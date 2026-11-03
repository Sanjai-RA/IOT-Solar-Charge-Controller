"""
MPPT SOLAR — Intelligent Monitoring Dashboard (Python / Flask backend)

  python app.py   →  open the printed URL in your browser

Backend (Python):  /api/telemetry   /api/forecast   /api/status
Frontend:          pre-built dashboard in ./static_site (source in ./frontend)
ThingSpeak keys:   read from .env on the server only — never sent to the browser.
"""
from __future__ import annotations

import math
import os
import socket
import sys
import threading
import time
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "backend"))

import thingspeak_client as ts  # noqa: E402
from forecast import HORIZONS_MIN, METRIC_INFO, run_forecast  # noqa: E402

STATIC = ROOT / "static_site"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "5000"))

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SPANS = {"1h": 3600e3, "6h": 6 * 3600e3, "24h": 24 * 3600e3, "7d": 7 * 86400e3}
MAX_CUSTOM_MS = 31 * 86400e3


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def iso(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(s: str | None) -> float | None:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp() * 1000


def no_store(resp, status=200):
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    return resp


def clean(o):
    """Replace NaN/Inf with None so the JSON is always valid."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


# ------------------------------------------------------------------ API
@app.get("/api/telemetry")
def telemetry():
    rng = request.args.get("range", "24h")
    now = math.floor(time.time() / 10) * 10 * 1000  # round to 10 s → shared cache
    start = end = None
    average = results = None

    if rng == "latest":
        results = 1
    elif rng == "custom":
        s, e = parse_iso(request.args.get("start")), parse_iso(request.args.get("end"))
        if s is None or e is None or e <= s:
            return no_store(jsonify(ok=False, error="Invalid custom range: start and end must be valid and end must be after start."), 400)
        if e - s > MAX_CUSTOM_MS:
            return no_store(jsonify(ok=False, error="Custom range is limited to 31 days."), 400)
        start, end, results = s, e, 8000
        if e - s > 2 * 86400e3:
            average = 10
    elif rng in SPANS:
        start, end, results = now - SPANS[rng], now + 60e3, 8000
        if rng == "7d":
            average = 10
    else:
        return no_store(jsonify(ok=False, error=f'Unknown range "{rng}".'), 400)

    try:
        res = ts.fetch_feeds(results=results, start_ms=start, end_ms=end, average=average)
    except ts.ThingSpeakError as e:
        return no_store(jsonify(ok=False, error=e.message, fetchedAt=now_iso()), e.status)
    except Exception:  # noqa: BLE001
        return no_store(jsonify(ok=False, error="Unexpected server error while reading ThingSpeak.", fetchedAt=now_iso()), 500)

    rows = res["rows"]
    body = {
        "ok": True,
        "range": {"key": rng, "start": iso(start) if start else None, "end": iso(end) if end else None},
        "channel": res["channel"],
        "cols": {
            "t": [r["t"] for r in rows], "id": [r["id"] for r in rows],
            "sv": [r["sv"] for r in rows], "si": [r["si"] for r in rows],
            "bv": [r["bv"] for r in rows], "bi": [r["bi"] for r in rows],
        },
        "count": len(rows),
        "truncated": (not average) and len(rows) >= 8000,
        "aggregated": f"{average}-minute averages computed by ThingSpeak" if average else None,
        "fetchedAt": now_iso(),
        "cached": res["cached"],
        "access": ts.access_mode(),
    }
    return no_store(jsonify(clean(body)))


_fc_memo: dict[str, tuple[float, dict]] = {}


@app.get("/api/forecast")
def forecast():
    metric = request.args.get("metric", "solarPower")
    try:
        horizon = int(float(request.args.get("horizon", "60")))
        max_age = min(24 * 60, max(5.0, float(request.args.get("maxAge", "30"))))
    except ValueError:
        return no_store(jsonify(status="error", message="Invalid number in query."), 400)
    polarity = request.args.get("pol", "positive_charging")
    if metric not in METRIC_INFO:
        return no_store(jsonify(status="error", message="Unknown metric."), 400)
    if horizon not in HORIZONS_MIN:
        return no_store(jsonify(status="error", message="Unsupported horizon."), 400)

    key = f"{metric}|{horizon}|{polarity}|{max_age}"
    hit = _fc_memo.get(key)
    if hit and time.time() - hit[0] < 30:
        return no_store(jsonify(hit[1]))
    try:
        # Latest 8000 records (ThingSpeak max per request) — real channel history only
        res = ts.fetch_feeds(results=8000, ttl_s=30)
        result = clean(run_forecast(res["rows"], metric, horizon, polarity, max_age, time.time() * 1000))
    except ts.ThingSpeakError as e:
        return no_store(jsonify(status="error", message=e.message), e.status)
    except Exception as e:  # noqa: BLE001
        app.logger.exception("forecast failed")
        return no_store(jsonify(status="error", message=f"Unexpected server error while forecasting ({type(e).__name__})."), 500)
    _fc_memo[key] = (time.time(), result)
    return no_store(jsonify(result))


@app.get("/api/status")
def status():
    test = None
    if request.args.get("test") == "1":
        t0 = time.time()
        try:
            res = ts.fetch_feeds(results=1, ttl_s=0)
            rows = res["rows"]
            test = {
                "ok": True, "latencyMs": int((time.time() - t0) * 1000),
                "message": "Connected — channel readable." if rows else "Connected, but the channel has no entries yet.",
                "channelName": (res["channel"] or {}).get("name"), "fields": (res["channel"] or {}).get("fields"),
                "lastEntryAt": iso(rows[-1]["t"]) if rows else None,
            }
        except ts.ThingSpeakError as e:
            test = {"ok": False, "latencyMs": int((time.time() - t0) * 1000), "message": e.message,
                    "channelName": None, "fields": None, "lastEntryAt": None}
    mode = ts.access_mode()
    return no_store(jsonify({
        "channelId": ts.channel_id(),
        "access": mode,
        "accessLabel": "Private — Read API Key configured on server" if mode == "private-key" else "Public — no Read API Key configured",
        "defaultRefreshSeconds": int(os.getenv("DASHBOARD_REFRESH_SECONDS", "30")),
        **ts.diagnostics,
        "test": test,
        "serverTime": now_iso(),
    }))


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return no_store(jsonify(ok=False, error="Not found"), 404)
    page = STATIC / "404.html"
    if page.exists():
        return send_from_directory(STATIC, "404.html"), 404
    return "Not found", 404


# ------------------------------------------------------------------ static dashboard
@app.get("/")
@app.get("/<path:path>")
def site(path: str = ""):
    if not STATIC.exists():
        return ("static_site folder is missing. Re-extract the zip (it contains the pre-built dashboard).", 500)
    path = path.strip("/")
    target = (STATIC / path).resolve()
    if STATIC.resolve() not in target.parents and target != STATIC.resolve():
        abort(404)
    if path and target.is_file():
        resp = send_from_directory(STATIC, path)
        if path.startswith("_next/static/"):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp
    index = target / "index.html"
    if index.is_file():
        return send_from_directory(STATIC, f"{path}/index.html" if path else "index.html")
    html = target.with_suffix(".html")
    if html.is_file():
        return send_from_directory(STATIC, html.relative_to(STATIC).as_posix())
    abort(404)


# ------------------------------------------------------------------ startup
def lan_ip() -> str:
    """Find this PC's Wi-Fi/LAN IP (no data is actually sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        s.close()


def banner():
    ip = lan_ip()
    key = "configured (private)" if ts.read_key() else "NOT SET (public read)"
    line = "=" * 64
    print(f"\n{line}")
    print("  MPPT SOLAR — Intelligent Monitoring Dashboard (Python backend)")
    print(line)
    print(f"  ThingSpeak channel : {ts.channel_id()}   Read API key: {key}")
    print(f"  This computer      : http://127.0.0.1:{PORT}")
    print(f"  Phone / other PC   : http://{ip}:{PORT}   (same Wi-Fi)")
    print(f"  Stop server        : Ctrl + C")
    print(f"{line}\n", flush=True)
    return ip


if __name__ == "__main__":
    banner()
    if os.getenv("OPEN_BROWSER", "1") == "1":
        threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    try:
        from waitress import serve
        serve(app, host=HOST, port=PORT, threads=8)
    except ImportError:
        app.run(host=HOST, port=PORT, threaded=True, debug=False)
