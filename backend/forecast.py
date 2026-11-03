"""
Forecast engine (pure Python) — transparent baselines + one learned model,
evaluated on a chronological (time-ordered) holdout. No random splits.
No fabricated curves: if data is stale or too short, no forecast is produced.

Models:
  persistence      – last value (baseline)
  moving_average   – mean of last 30 min (baseline)
  holt             – damped Holt trend, exponential smoothing (baseline, grid-searched on train)
  ridge_ar         – ridge autoregression + time-of-day features (LEARNED model)
  seasonal         – time-of-day daily profile (baseline, needs ~1.5 days)
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

MODEL_VERSION = "mppt-forecast 1.0.0 (python)"
STEP_MIN = 5
STEP = STEP_MIN * 60_000
HORIZONS_MIN = [30, 60, 180]
DAY_BUCKETS = (24 * 60) // STEP_MIN  # 288
Z80 = 1.2816
MIN_BUCKETS = 36  # ≈ 3 hours
MAX_ORIGINS = 500

METRIC_INFO = {
    "solarVoltage": {"label": "Solar voltage", "unit": "V", "nonNegative": True},
    "solarCurrent": {"label": "Solar current", "unit": "A", "nonNegative": True},
    "solarPower": {"label": "Solar power", "unit": "W", "nonNegative": True},
    "batteryVoltage": {"label": "Battery voltage", "unit": "V", "nonNegative": True},
    "batteryPower": {"label": "Battery power", "unit": "W", "nonNegative": False},
}


def _iso(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _metric_value(r: dict, m: str, pol: str):
    sign = -1 if pol == "negative_charging" else 1
    sv, si, bv, bi = r["sv"], r["si"], r["bv"], r["bi"]
    if m == "solarVoltage":
        return sv
    if m == "solarCurrent":
        return si
    if m == "solarPower":
        return sv * si if sv is not None and si is not None else None
    if m == "batteryVoltage":
        return bv
    if m == "batteryPower":
        return bv * bi * sign if bv is not None and bi is not None else None
    return None


def _last_value(y, i):
    for k in range(i, -1, -1):
        if y[k] is not None:
            return y[k]
    return None


# ---------------------------------------------------------------- models
class Model:
    id = ""
    name = ""
    learned = False
    params = "—"

    def predict(self, i: int, H: int) -> list[float]:  # pragma: no cover
        raise NotImplementedError


class Persistence(Model):
    id, name = "persistence", "Persistence baseline (last value)"

    def __init__(self, y):
        self.y = y

    def predict(self, i, H):
        v = _last_value(self.y, i)
        return [v if v is not None else 0.0] * H


class MovingAverage(Model):
    id = "moving_average"

    def __init__(self, y, k=6):
        self.y, self.k = y, k
        self.name = f"Moving-average baseline ({k * STEP_MIN} min)"
        self.params = f"window={k} buckets"

    def predict(self, i, H):
        vals = []
        j = i
        while j >= 0 and j > i - 2 * self.k and len(vals) < self.k:
            if self.y[j] is not None:
                vals.append(self.y[j])
            j -= 1
        if vals:
            v = sum(vals) / len(vals)
        else:
            lv = _last_value(self.y, i)
            v = lv if lv is not None else 0.0
        return [v] * H


def _run_holt(y, a, b, phi):
    n = len(y)
    L = [math.nan] * n
    T = [math.nan] * n
    lvl, tr = math.nan, 0.0
    for i in range(n):
        v = y[i]
        if math.isnan(lvl):
            if v is not None:
                lvl, tr = v, 0.0
        else:
            pl, pt = lvl + phi * tr, phi * tr
            if v is not None:
                nl = a * v + (1 - a) * pl
                tr = b * (nl - lvl) + (1 - b) * pt
                lvl = nl
            else:
                lvl, tr = pl, pt
        L[i], T[i] = lvl, tr
    return L, T


class Holt(Model):
    id, name = "holt", "Damped Holt trend (exponential smoothing)"

    def __init__(self, y, train_end):
        self.y = y
        best = (0.5, 0.1, 0.9, math.inf)
        ytr = y[:train_end]
        for a in (0.2, 0.4, 0.6, 0.8):
            for b in (0.02, 0.1, 0.3):
                for phi in (0.8, 0.9, 0.98):
                    L, T = _run_holt(ytr, a, b, phi)
                    sse = 0.0
                    for i in range(1, train_end):
                        v = y[i]
                        if v is None or math.isnan(L[i - 1]):
                            continue
                        e = v - (L[i - 1] + phi * T[i - 1])
                        sse += e * e
                    if sse < best[3]:
                        best = (a, b, phi, sse)
        self.a, self.b, self.phi = best[0], best[1], best[2]
        self.params = f"α={self.a}, β={self.b}, φ={self.phi} (grid-searched on training split)"
        self.L, self.T = _run_holt(y, self.a, self.b, self.phi)  # causal states

    def predict(self, i, H):
        out, acc, ph = [], 0.0, 1.0
        for _ in range(H):
            ph *= self.phi
            acc += ph
            v = self.L[i] + acc * self.T[i]
            if not math.isfinite(v):
                lv = _last_value(self.y, i)
                v = lv if lv is not None else 0.0
            out.append(v)
        return out


def _solve(A, b):
    """Gaussian elimination with partial pivoting. Returns None if singular."""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[p][c]) < 1e-12:
            return None
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r == c:
                continue
            f = M[r][c] / M[c][c]
            if f:
                for k in range(c, n + 1):
                    M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


class RidgeAR(Model):
    """Learned model: ridge-regularised autoregression with time-of-day features."""
    id, name, learned = "ridge_ar", "Ridge autoregression + time-of-day (learned model)", True

    @classmethod
    def fit(cls, y, tod, fit_end, p=6, lam=1.0):
        train_vals = [v for v in y[:fit_end] if v is not None]
        if len(train_vals) < 40:
            return None
        mu = sum(train_vals) / len(train_vals)
        sd = math.sqrt(sum((v - mu) ** 2 for v in train_vals) / len(train_vals)) or 1.0
        d = p + 3
        XtX = [[0.0] * d for _ in range(d)]
        Xty = [0.0] * d
        n_samples = 0
        for j in range(p, fit_end):
            target = y[j]
            if target is None:
                continue
            lags = []
            ok = True
            for k in range(1, p + 1):
                v = y[j - k]
                if v is None:
                    ok = False
                    break
                lags.append((v - mu) / sd)
            if not ok:
                continue
            x = cls._feat(lags, tod[j])
            yt = (target - mu) / sd
            for a in range(d):
                Xty[a] += x[a] * yt
                xa = x[a]
                row = XtX[a]
                for b in range(d):
                    row[b] += xa * x[b]
            n_samples += 1
        if n_samples < 30:
            return None
        for a in range(d - 1):  # do not penalise intercept
            XtX[a][a] += lam
        w = _solve(XtX, Xty)
        if w is None:
            return None
        m = cls()
        m.y, m.tod, m.p, m.mu, m.sd, m.w = y, tod, p, mu, sd, w
        m.params = f"lags={p}, λ={lam:g}, {n_samples} training samples"
        return m

    @staticmethod
    def _feat(lags, tod):
        ang = 2 * math.pi * tod / DAY_BUCKETS
        return lags + [math.sin(ang), math.cos(ang), 1.0]

    def predict(self, i, H):
        hist = []
        fill = _last_value(self.y, i)
        if fill is None:
            fill = self.mu
        for k in range(self.p - 1, -1, -1):
            v = self.y[i - k] if i - k >= 0 else None
            if v is not None:
                fill = v
            val = v if v is not None else fill
            hist.append((val - self.mu) / self.sd)
        out = []
        for h in range(1, H + 1):
            lags = hist[-self.p:][::-1]
            tod = (self.tod[i] + h) % DAY_BUCKETS
            x = self._feat(lags, tod)
            yz = sum(wa * xa for wa, xa in zip(self.w, x))
            hist.append(yz)
            out.append(yz * self.sd + self.mu)
        return out


class Seasonal(Model):
    id, name = "seasonal", "Time-of-day seasonal baseline"
    params = "daily profile + decaying anomaly (0.9^h)"

    @classmethod
    def fit(cls, y, tod, fit_end):
        s = [0.0] * DAY_BUCKETS
        c = [0] * DAY_BUCKETS
        for j in range(fit_end):
            v = y[j]
            if v is not None:
                s[tod[j]] += v
                c[tod[j]] += 1
        covered = sum(1 for x in c if x > 0)
        if fit_end < DAY_BUCKETS * 1.5 or covered < DAY_BUCKETS * 0.6:
            return None
        prof = [s[k] / c[k] if c[k] else math.nan for k in range(DAY_BUCKETS)]
        for k in range(DAY_BUCKETS):
            if math.isnan(prof[k]):
                for o in range(1, DAY_BUCKETS):
                    a = prof[(k + o) % DAY_BUCKETS]
                    b = prof[(k - o) % DAY_BUCKETS]
                    if not math.isnan(a):
                        prof[k] = a
                        break
                    if not math.isnan(b):
                        prof[k] = b
                        break
        m = cls()
        m.y, m.tod, m.prof = y, tod, prof
        return m

    def predict(self, i, H):
        last = _last_value(self.y, i)
        if last is None:
            last = self.prof[self.tod[i]]
        anom = last - self.prof[self.tod[i]]
        return [self.prof[(self.tod[i] + h) % DAY_BUCKETS] + anom * 0.9 ** h for h in range(1, H + 1)]


# ---------------------------------------------------------------- evaluation
def _evaluate(m: Model, y, origins, H):
    abs_h = [0.0] * H
    sq_h = [0.0] * H
    n_h = [0] * H
    n = len(y)
    for i in origins:
        p = m.predict(i, H)
        for h in range(1, H + 1):
            j = i + h
            if j >= n:
                break
            a = y[j]
            if a is None:
                continue
            e = p[h - 1] - a
            abs_h[h - 1] += abs(e)
            sq_h[h - 1] += e * e
            n_h[h - 1] += 1
    total = sum(n_h)
    mae = sum(abs_h) / total if total else None
    rmse = math.sqrt(sum(sq_h) / total) if total else None
    rmse_by_step = [math.sqrt(sq_h[k] / n_h[k]) if n_h[k] else math.nan for k in range(H)]
    return {"mae": mae, "rmse": rmse, "rmseByStep": rmse_by_step, "n": total}


# ---------------------------------------------------------------- main
def run_forecast(rows: list[dict], metric: str, horizon_min: int, polarity: str, max_age_min: float, now_ms: float) -> dict:
    info = METRIC_INFO[metric]
    H = round(horizon_min / STEP_MIN)
    base = {
        "status": "insufficient", "message": "", "metric": metric, "unit": info["unit"], "horizonMin": horizon_min,
        "stepMin": STEP_MIN, "generatedAt": _iso(now_ms), "samplesUsed": 0, "bucketsUsed": 0, "lastObservedAt": None,
        "train": None, "test": None, "selected": None, "models": [], "intervalLevel": 80, "history": [], "forecast": [],
        "backtest": [], "availableHorizons": [],
        "notes": [
            "No weather data source is connected — sudden cloud changes cannot be predicted.",
            "Uncertainty band = ±1.28 × backtest RMSE at each step (≈80% interval, assumes errors similar to the holdout period).",
        ],
    }

    pts = []
    for r in rows:
        v = _metric_value(r, metric, polarity)
        if v is not None and math.isfinite(v):
            pts.append((r["t"], v))
    base["samplesUsed"] = len(pts)
    if len(pts) < 20:
        base["message"] = "Not enough recent data to forecast — fewer than 20 valid readings available on the channel."
        return base
    base["lastObservedAt"] = _iso(pts[-1][0])

    # Uniform 5-minute buckets (mean). Missing buckets stay None.
    t0 = (pts[0][0] // STEP) * STEP
    tN = (pts[-1][0] // STEP) * STEP
    n = int((tN - t0) // STEP) + 1
    s = [0.0] * n
    c = [0] * n
    for t, v in pts:
        k = int(((t // STEP) * STEP - t0) // STEP)
        s[k] += v
        c[k] += 1
    y = [s[k] / c[k] if c[k] else None for k in range(n)]
    times = [t0 + k * STEP + STEP / 2 for k in range(n)]
    tod = [int(((t0 + k * STEP) % 86_400_000) // STEP) for k in range(n)]
    valid = sum(1 for v in y if v is not None)
    base["bucketsUsed"] = valid
    keep = max(3 * H, 72)
    base["history"] = [{"t": times[k], "v": y[k]} for k in range(max(0, n - keep), n)]

    age_min = (now_ms - pts[-1][0]) / 60_000
    if age_min > max_age_min:
        base["status"] = "stale"
        base["message"] = (f"Not enough recent data to forecast — the latest reading is {round(age_min)} min old "
                           f"(limit {max_age_min:g} min). No forecast curve is drawn.")
        return base
    if valid < MIN_BUCKETS:
        base["message"] = (f"Not enough recent data to forecast — {valid} five-minute buckets available, "
                           f"{MIN_BUCKETS} needed (≈3 hours).")
        return base

    # Chronological split: first 80% of valid buckets = train, last 20% = test
    target = int(valid * 0.8)
    seen, train_end = 0, n
    for k in range(n):
        if y[k] is not None:
            seen += 1
        if seen >= target:
            train_end = k + 1
            break
    origins = [i for i in range(train_end, n - 1) if y[i] is not None]
    if len(origins) > MAX_ORIGINS:
        st = math.ceil(len(origins) / MAX_ORIGINS)
        origins = origins[::st]

    avail = []
    for hm in HORIZONS_MIN:
        hs = hm // STEP_MIN
        covered = sum(1 for i in origins if i + hs < n and y[i + hs] is not None)
        if covered >= 10 and valid >= 3 * hs:
            avail.append(hm)
    base["availableHorizons"] = avail
    if horizon_min not in avail:
        base["status"] = "horizon_unavailable"
        base["message"] = (f"The {horizon_min}-minute horizon is not validated with the current history. Available: "
                           + ", ".join(f"{h} min" for h in avail) + ".") if avail else \
            "Not enough history to validate any forecast horizon yet. Keep the device uploading and check back."
        return base

    base["train"] = {"start": _iso(times[0]), "end": _iso(times[train_end - 1]),
                     "buckets": sum(1 for v in y[:train_end] if v is not None)}
    base["test"] = {"start": _iso(times[train_end] if train_end < n else times[-1]), "end": _iso(times[-1]),
                    "origins": len(origins)}

    # Fit on TRAIN only, evaluate on TEST origins
    cands: list[Model] = [Persistence(y), MovingAverage(y), Holt(y, train_end)]
    ar = RidgeAR.fit(y, tod, train_end)
    if ar:
        cands.append(ar)
    se = Seasonal.fit(y, tod, train_end)
    if se:
        cands.append(se)

    evals = [(m, _evaluate(m, y, origins, H)) for m in cands]
    persist_mae = evals[0][1]["mae"]
    base["models"] = [{
        "id": m.id, "name": m.name, "learned": m.learned, "mae": e["mae"], "rmse": e["rmse"], "evalPoints": e["n"],
        "skillVsPersistence": (1 - e["mae"] / persist_mae) if (e["mae"] is not None and persist_mae) else None,
    } for m, e in evals]
    ranked = sorted([x for x in evals if x[1]["mae"] is not None], key=lambda x: x[1]["mae"])
    if not ranked:
        base["message"] = "Could not evaluate any model on the holdout period (too many gaps)."
        return base
    best_m, best_e = ranked[0]

    # Refit learned / seasonal model on ALL data for the live forecast (same hyper-parameters)
    final = best_m
    if best_m.id == "ridge_ar":
        final = RidgeAR.fit(y, tod, n) or best_m
    elif best_m.id == "seasonal":
        final = Seasonal.fit(y, tod, n) or best_m

    origin = n - 1
    pred = final.predict(origin, H)
    fallback = best_e["rmse"] or 0.0
    fc = []
    for k, v in enumerate(pred):
        r = best_e["rmseByStep"][k]
        if not math.isfinite(r):
            r = fallback
        val, lo, hi = v, v - Z80 * r, v + Z80 * r
        if info["nonNegative"]:
            val, lo, hi = max(0.0, val), max(0.0, lo), max(0.0, hi)
        fc.append({"t": times[origin] + (k + 1) * STEP, "v": val, "lo": lo, "hi": hi})
    base["forecast"] = fc

    bt = []
    for i in origins:
        if i + H < n and y[i + H] is not None:
            p = best_m.predict(i, H)[H - 1]
            if info["nonNegative"]:
                p = max(0.0, p)
            bt.append({"t": times[i + H], "actual": y[i + H], "predicted": p})
    base["backtest"] = bt[-300:]

    base["selected"] = {"id": final.id, "name": final.name, "version": MODEL_VERSION, "learned": final.learned,
                        "params": final.params}
    base["status"] = "ok"
    base["message"] = ("Learned model selected: it beat the persistence and smoothing baselines on the time-ordered holdout."
                       if final.learned else
                       "A transparent baseline scored best on the time-ordered holdout, so it is used instead of the learned model.")
    if H > 12:
        base["notes"].append("Longer horizons carry wider uncertainty; treat the 3-hour view as indicative.")
    return base
