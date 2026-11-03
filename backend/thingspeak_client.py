"""
ThingSpeak reader (server side only).
The Read API Key is loaded from the .env file and is NEVER sent to the browser.
"""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

import requests

TIMEOUT_S = 10
CACHE_TTL_S = 10.0


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def base_url() -> str:
    return _env("THINGSPEAK_BASE_URL", "https://api.thingspeak.com").rstrip("/")


def channel_id() -> str:
    return _env("THINGSPEAK_CHANNEL_ID", "3534436")


def read_key() -> str:
    return _env("THINGSPEAK_READ_API_KEY")


def access_mode() -> str:
    return "private-key" if read_key() else "public"


# Safe diagnostics (never contain the key or full URL)
diagnostics: dict[str, Any] = {
    "lastSuccessAt": None,
    "lastErrorAt": None,
    "lastError": None,
    "lastLatencyMs": None,
}


class ThingSpeakError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _fail(msg: str) -> None:
    diagnostics["lastError"] = msg
    diagnostics["lastErrorAt"] = _now_iso()


def _ts(ms: float) -> str:
    """ThingSpeak start/end format, UTC."""
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _num(x: Any) -> float | None:
    if x is None:
        return None
    s = str(x).strip()
    if s == "" or s.lower() in ("nan", "null", "none"):
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    if v != v or v in (float("inf"), float("-inf")):
        return None
    return v


def _parse_time(s: Any) -> int | None:
    if not isinstance(s, str) or not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return int(d.timestamp() * 1000)


def _map_channel(c: Any) -> dict | None:
    if not isinstance(c, dict):
        return None
    fields = {f"field{i}": c[f"field{i}"] for i in range(1, 9) if isinstance(c.get(f"field{i}"), str)}
    cid = _num(c.get("id"))
    last = _num(c.get("last_entry_id"))
    return {
        "id": int(cid) if cid is not None else None,
        "name": c.get("name") if isinstance(c.get("name"), str) else None,
        "fields": fields,
        "lastEntryId": int(last) if last is not None else None,
        "updatedAt": c.get("updated_at") if isinstance(c.get("updated_at"), str) else None,
        "createdAt": c.get("created_at") if isinstance(c.get("created_at"), str) else None,
    }


_cache: dict[str, tuple[float, dict]] = {}
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def fetch_feeds(results: int | None = None, start_ms: float | None = None, end_ms: float | None = None,
                average: int | None = None, ttl_s: float = CACHE_TTL_S) -> dict:
    """Returns {"channel": {...}|None, "rows": [ {t,id,sv,si,bv,bi}, ... ], "cached": bool}."""
    key = f"{results}|{start_ms}|{end_ms}|{average}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl_s:
        return {**hit[1], "cached": True}
    with _locks_guard:
        lock = _locks.setdefault(key, threading.Lock())
    with lock:  # de-duplicate simultaneous identical requests
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < ttl_s:
            return {**hit[1], "cached": True}
        value = _do_fetch(results, start_ms, end_ms, average)
        _cache[key] = (time.time(), value)
        if len(_cache) > 50:
            oldest = min(_cache.items(), key=lambda kv: kv[1][0])[0]
            _cache.pop(oldest, None)
        return {**value, "cached": False}


def _do_fetch(results, start_ms, end_ms, average) -> dict:
    cid = channel_id()
    if not cid.isdigit():
        raise ThingSpeakError("THINGSPEAK_CHANNEL_ID is missing or not numeric (check .env).", 500)
    params: dict[str, str] = {"timezone": "Etc/UTC"}
    if results:
        params["results"] = str(min(8000, max(1, int(results))))
    if start_ms is not None:
        params["start"] = _ts(start_ms)
    if end_ms is not None:
        params["end"] = _ts(end_ms)
    if average:
        params["average"] = str(average)
    if read_key():
        params["api_key"] = read_key()

    url = f"{base_url()}/channels/{cid}/feeds.json"
    t0 = time.time()
    try:
        res = requests.get(url, params=params, timeout=TIMEOUT_S, headers={"Accept": "application/json"})
    except requests.Timeout:
        msg = f"ThingSpeak did not respond within {TIMEOUT_S} s (timeout)."
        _fail(msg)
        raise ThingSpeakError(msg, 504)
    except requests.RequestException:
        msg = "Network error: could not reach ThingSpeak (check internet connection)."
        _fail(msg)
        raise ThingSpeakError(msg, 504)

    if res.status_code == 429:
        msg = "ThingSpeak rate limit reached (HTTP 429). Will retry on next refresh."
        _fail(msg)
        raise ThingSpeakError(msg, 429)
    if not res.ok:
        if res.status_code in (400, 401, 403):
            msg = f"ThingSpeak rejected the request (HTTP {res.status_code}) — check the channel ID and Read API Key."
        elif res.status_code == 404:
            msg = "Channel not found or not accessible (HTTP 404) — check THINGSPEAK_CHANNEL_ID / Read API Key."
        else:
            msg = f"ThingSpeak returned HTTP {res.status_code}."
        _fail(msg)
        raise ThingSpeakError(msg, 502)

    text = res.text.strip()
    if text in ("-1", "0"):
        msg = "ThingSpeak denied access (-1): the channel is private and the Read API Key is missing or wrong."
        _fail(msg)
        raise ThingSpeakError(msg, 502)
    try:
        data = res.json()
    except ValueError:
        msg = "ThingSpeak returned malformed JSON."
        _fail(msg)
        raise ThingSpeakError(msg, 502)
    if not isinstance(data, dict) or not isinstance(data.get("feeds"), list):
        msg = 'Unexpected ThingSpeak response shape (no "feeds" array).'
        _fail(msg)
        raise ThingSpeakError(msg, 502)

    seen: dict[str, dict] = {}
    for i, f in enumerate(data["feeds"]):
        if not isinstance(f, dict):
            continue
        t = _parse_time(f.get("created_at"))
        if t is None:
            continue
        eid = _num(f.get("entry_id"))
        rid = int(eid) if eid is not None else i
        row = {"t": t, "id": rid, "sv": _num(f.get("field1")), "si": _num(f.get("field2")),
               "bv": _num(f.get("field3")), "bi": _num(f.get("field4"))}
        # Duplicate entry IDs / timestamps: keep the last one received
        seen[f"id:{rid}" if f.get("entry_id") is not None else f"t:{t}"] = row
    rows = sorted(seen.values(), key=lambda r: (r["t"], r["id"]))

    diagnostics["lastSuccessAt"] = _now_iso()
    diagnostics["lastLatencyMs"] = int((time.time() - t0) * 1000)
    return {"channel": _map_channel(data.get("channel")), "rows": rows}
