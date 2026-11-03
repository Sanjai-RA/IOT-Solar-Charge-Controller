import type { BatteryState, EffStatus, Freshness, Quality, Reading, Settings, TelemetryWire, WireReading } from './types';

/** Convert the columnar wire payload back into row objects, sorted by time. */
export function wireToRows(w: TelemetryWire | null | undefined): WireReading[] {
  if (!w || !w.cols) return [];
  const { t, id, sv, si, bv, bi } = w.cols;
  const rows: WireReading[] = [];
  for (let i = 0; i < t.length; i++) rows.push({ t: t[i], id: id[i], sv: sv[i], si: si[i], bv: bv[i], bi: bi[i] });
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

function polaritySign(s: Settings): number {
  return s.polarity === 'negative_charging' ? -1 : 1;
}

function inRange(v: number | null, r: [number, number]): boolean {
  return v == null || (v >= r[0] && v <= r[1]);
}

/** Derive power, efficiency, battery state and quality for one reading. Missing values stay null. */
export function derive(r: WireReading, s: Settings): Reading {
  const issues: string[] = [];
  const solarPower = r.sv != null && r.si != null ? r.sv * r.si : null;

  // Battery current direction
  let batteryState: BatteryState = 'unknown';
  let chargeCurrent: number | null = null;
  if (r.bi != null) {
    if (s.polarity === 'not_calibrated') {
      batteryState = 'uncalibrated';
    } else {
      chargeCurrent = r.bi * polaritySign(s);
      if (chargeCurrent > s.chargingThresholdA) batteryState = 'charging';
      else if (chargeCurrent < -s.chargingThresholdA) batteryState = 'discharging';
      else batteryState = 'idle';
    }
  }
  const batteryPower =
    r.bv != null && r.bi != null ? r.bv * r.bi * (s.polarity === 'not_calibrated' ? 1 : polaritySign(s)) : null;
  const outputPower = batteryState === 'charging' && r.bv != null && chargeCurrent != null ? r.bv * chargeCurrent : null;

  // Conversion efficiency (NOT MPPT tracking efficiency)
  let effStatus: EffStatus = 'ok';
  let eff: number | null = null;
  let loss: number | null = null;
  if (solarPower == null || r.bv == null || r.bi == null) effStatus = 'missing';
  else if (s.polarity === 'not_calibrated') effStatus = 'uncalibrated';
  else if (solarPower < s.minInputPowerW) effStatus = 'low_input';
  else if (outputPower == null) effStatus = 'not_charging';
  else {
    eff = (outputPower / solarPower) * 100;
    loss = solarPower - outputPower;
    if (eff < 0 || eff > 100 + s.effTolerancePct) {
      effStatus = 'implausible';
      issues.push(`Efficiency ${eff.toFixed(1)}% outside plausible range — review sensors/polarity`);
    }
  }

  // Data quality
  let quality: Quality = 'valid';
  const missing = (['sv', 'si', 'bv', 'bi'] as const).filter((k) => r[k] == null);
  if (missing.length) {
    quality = 'incomplete';
    issues.push(`Missing: ${missing.map((k) => FIELD_LABEL[k]).join(', ')}`);
  }
  const L = s.limits;
  const oor: string[] = [];
  if (!inRange(r.sv, L.solarVoltage)) oor.push('PV voltage');
  if (!inRange(r.si, L.solarCurrent)) oor.push('PV current');
  if (!inRange(r.bv, L.batteryVoltage)) oor.push('battery voltage');
  if (!inRange(r.bi, L.batteryCurrent)) oor.push('battery current');
  if (oor.length) {
    quality = 'out_of_range';
    issues.push(`Out of range: ${oor.join(', ')}`);
  }

  return {
    t: r.t,
    id: r.id,
    solarVoltage: r.sv,
    solarCurrent: r.si,
    batteryVoltage: r.bv,
    batteryCurrent: r.bi,
    solarPower,
    batteryPower,
    outputPower,
    conversionEfficiencyPercent: eff,
    estimatedPowerLossW: loss,
    batteryState,
    effStatus,
    quality,
    issues,
  };
}

export const FIELD_LABEL = { sv: 'PV voltage', si: 'PV current', bv: 'battery voltage', bi: 'battery current' } as const;

export function deriveAll(rows: WireReading[], s: Settings): Reading[] {
  return rows.map((r) => derive(r, s));
}

/** Efficiency value usable for trends/gauges (excludes implausible/invalid). */
export function validEff(r: Reading): number | null {
  return r.effStatus === 'ok' ? r.conversionEfficiencyPercent : null;
}

export function freshnessOf(latestT: number | null | undefined, now: number, s: Settings): { state: Freshness; ageSec: number | null } {
  if (latestT == null) return { state: 'none', ageSec: null };
  const ageSec = (now - latestT) / 1000;
  if (ageSec <= s.liveSeconds) return { state: 'live', ageSec };
  if (ageSec <= s.staleSeconds) return { state: 'delayed', ageSec };
  return { state: 'stale', ageSec };
}

export interface Stats { min: number | null; max: number | null; avg: number | null; count: number; last: number | null }

export function statsOf(values: (number | null | undefined)[]): Stats {
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  let last: number | null = null;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
    last = v;
  }
  return count ? { min, max, avg: sum / count, count, last } : { min: null, max: null, avg: null, count: 0, last: null };
}

export function medianInterval(rows: { t: number }[]): number | null {
  if (rows.length < 3) return null;
  const d: number[] = [];
  for (let i = 1; i < rows.length; i++) d.push(rows[i].t - rows[i - 1].t);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

export function effectiveGapMs(rows: { t: number }[], s: Settings): number {
  const med = medianInterval(rows) ?? 0;
  return Math.max(s.gapMinutes * 60e3, med * 3);
}

/**
 * Trapezoidal energy integration. Intervals longer than gapMs are NOT integrated
 * (treated as missing). Returns Wh plus coverage of the requested window.
 */
export function integrateWh(
  readings: Reading[],
  key: 'solarPower' | 'outputPower',
  fromT: number,
  toT: number,
  gapMs: number,
): { wh: number; coveredMs: number; windowMs: number; coverage: number } {
  let wh = 0, covered = 0;
  const rs = readings.filter((r) => r.t >= fromT && r.t <= toT);
  for (let i = 1; i < rs.length; i++) {
    const a = rs[i - 1], b = rs[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > gapMs) continue;
    const pa = key === 'outputPower' ? chargeP(a) : a.solarPower;
    const pb = key === 'outputPower' ? chargeP(b) : b.solarPower;
    if (pa == null || pb == null) continue;
    wh += ((pa + pb) / 2) * (dt / 3600e3);
    covered += dt;
  }
  const windowMs = Math.max(1, toT - fromT);
  return { wh, coveredMs: covered, windowMs, coverage: covered / windowMs };
}

function chargeP(r: Reading): number | null {
  if (r.batteryState === 'charging') return r.outputPower;
  if (r.batteryState === 'idle' || r.batteryState === 'discharging') return 0;
  return null; // unknown / uncalibrated → not integrated
}

type Pt = { t: number; [k: string]: number | null };

/** Bucket-average downsampling for charts (averages each derived metric separately). */
export function downsample(points: Pt[], maxPoints: number): Pt[] {
  if (points.length <= maxPoints) return points;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const bucketMs = (t1 - t0) / maxPoints || 1;
  const keys = Object.keys(points[0]).filter((k) => k !== 't');
  const out: Pt[] = [];
  let cur: { tSum: number; n: number; sums: Record<string, number>; cnt: Record<string, number> } | null = null;
  let curIdx = -1;
  const flush = () => {
    if (!cur) return;
    const p: Pt = { t: cur.tSum / cur.n };
    for (const k of keys) p[k] = cur.cnt[k] ? cur.sums[k] / cur.cnt[k] : null;
    out.push(p);
  };
  for (const p of points) {
    const idx = Math.min(maxPoints - 1, Math.floor((p.t - t0) / bucketMs));
    if (idx !== curIdx) {
      flush();
      cur = { tSum: 0, n: 0, sums: {}, cnt: {} };
      curIdx = idx;
    }
    cur!.tSum += p.t;
    cur!.n++;
    for (const k of keys) {
      const v = p[k];
      if (v != null && Number.isFinite(v)) {
        cur!.sums[k] = (cur!.sums[k] ?? 0) + v;
        cur!.cnt[k] = (cur!.cnt[k] ?? 0) + 1;
      }
    }
  }
  flush();
  return out;
}

/** Insert null rows where the time gap is too long so chart lines break instead of faking continuity. */
export function insertGaps(points: Pt[], gapMs: number): Pt[] {
  if (points.length < 2) return points;
  const keys = Object.keys(points[0]).filter((k) => k !== 't');
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > gapMs) {
      const g: Pt = { t: points[i - 1].t + 1 };
      for (const k of keys) g[k] = null;
      out.push(g);
    }
    out.push(points[i]);
  }
  return out;
}

/** Build chart-ready series: pick metrics, downsample, then mark gaps. */
export function chartSeries(readings: Reading[], pick: (r: Reading) => Record<string, number | null>, gapMs: number, maxPoints = 700): Pt[] {
  if (!readings.length) return [];
  const pts: Pt[] = readings.map((r) => ({ t: r.t, ...pick(r) }));
  const ds = downsample(pts, maxPoints);
  const bucketGap = ds.length < pts.length ? ((pts[pts.length - 1].t - pts[0].t) / maxPoints) * 2.5 : 0;
  return insertGaps(ds, Math.max(gapMs, bucketGap));
}

/** Voltage-based battery status band. Only available when chemistry is configured. */
export function batteryVoltageStatus(
  v: number | null,
  type: Settings['batteryType'],
  state: BatteryState,
): { band: 'High' | 'Medium' | 'Low' | null; note: string } {
  if (type === 'not_configured') return { band: null, note: 'Configure battery chemistry in Settings to enable a voltage-based status estimate. Exact SoC is not shown.' };
  if (v == null) return { band: null, note: 'Battery voltage unavailable.' };
  const t: Record<string, [number, number]> = {
    lead_acid_12v: [12.2, 12.7],
    lifepo4_4s: [12.9, 13.3],
    liion_3s: [11.1, 12.0],
    liion_1s: [3.6, 4.0],
  };
  const [lo, hi] = t[type];
  const band = v >= hi ? 'High' : v >= lo ? 'Medium' : 'Low';
  const note =
    state === 'charging'
      ? 'Charging raises terminal voltage — this voltage-based estimate reads high while charging. Not a true SoC.'
      : 'Voltage-based status estimate only (no temperature/rest compensation). Not a true SoC.';
  return { band, note };
}

export function trendDelta(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < 2) return null;
  return v[v.length - 1] - v[v.length - 2];
}
