'use client';
import { useEffect, useMemo, useState } from 'react';
import { History, Download, Printer, ArrowUpDown, Table2, LineChart } from 'lucide-react';
import { useSettings } from '@/components/Providers';
import { useRangeReadings, type RangeSel } from '@/lib/useRange';
import { TimeSeriesChart } from '@/components/Charts';
import { Card, ChartState, PageHeader, RangePicker } from '@/components/UI';
import { chartSeries, integrateWh, statsOf, validEff } from '@/lib/calculations';
import { fmt, fmtDateTime } from '@/lib/format';
import { DEFAULT_SETTINGS, RANGE_LABELS } from '@/lib/config';
import type { Reading } from '@/lib/types';

const METRICS = [
  { key: 'solarVoltage', label: 'PV voltage', unit: 'V', color: 'var(--cyan)', digits: 2 },
  { key: 'solarCurrent', label: 'PV current', unit: 'A', color: 'var(--blue)', digits: 3 },
  { key: 'solarPower', label: 'Solar power', unit: 'W', color: 'var(--amber)', digits: 2 },
  { key: 'batteryVoltage', label: 'Battery voltage', unit: 'V', color: 'var(--mint)', digits: 2 },
  { key: 'batteryCurrent', label: 'Battery current', unit: 'A', color: 'var(--blue)', digits: 3 },
  { key: 'batteryPower', label: 'Battery power', unit: 'W', color: 'var(--mint)', digits: 2 },
  { key: 'eff', label: 'Efficiency (est.)', unit: '%', color: 'var(--violet)', digits: 1 },
] as const;
type MKey = (typeof METRICS)[number]['key'];
const PAGE = 50;

function val(r: Reading, k: MKey): number | null {
  return k === 'eff' ? validEff(r) : (r as any)[k];
}

export default function HistoryPage() {
  const { settings } = useSettings();
  const [sel, setSel] = useState<RangeSel>({ key: '24h' });
  const [metric, setMetric] = useState<MKey>('solarPower');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(0);
  const R = useRangeReadings(sel);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const m = METRICS.find((x) => x.key === metric)!;

  const data = useMemo(() => chartSeries(R.readings, (r) => ({ v: val(r, metric) }), R.gapMs), [R.readings, R.gapMs, metric]);
  const gaps = useMemo(() => {
    const g: { from: number; to: number }[] = [];
    for (let i = 1; i < R.readings.length; i++) if (R.readings[i].t - R.readings[i - 1].t > R.gapMs) g.push({ from: R.readings[i - 1].t, to: R.readings[i].t });
    return g;
  }, [R.readings, R.gapMs]);
  const sorted = useMemo(() => (desc ? [...R.readings].reverse() : R.readings), [R.readings, desc]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const rows = sorted.slice(page * PAGE, page * PAGE + PAGE);
  const rangeStart = R.wire?.range.start ? Date.parse(R.wire.range.start) : R.readings[0]?.t;
  const rangeEnd = R.wire?.range.end ? Math.min(Date.parse(R.wire.range.end), Date.now()) : R.readings[R.readings.length - 1]?.t;
  const quality = useMemo(() => {
    const c = { valid: 0, incomplete: 0, out_of_range: 0, implausible: 0 };
    R.readings.forEach((r) => { c[r.quality]++; if (r.effStatus === 'implausible') c.implausible++; });
    return c;
  }, [R.readings]);
  const energy = rangeStart && rangeEnd ? integrateWh(R.readings, 'solarPower', rangeStart, rangeEnd, R.gapMs) : null;

  const exportCsv = () => {
    const meta = [
      `# MPPT Solar export — ThingSpeak channel ${R.wire?.channel?.id ?? 3534436} (${R.wire?.channel?.name ?? ''})`,
      `# Range: ${rangeStart ? new Date(rangeStart).toISOString() : ''} to ${rangeEnd ? new Date(rangeEnd).toISOString() : ''} (UTC)`,
      `# Generated: ${new Date().toISOString()}`,
      `# Rows: ${R.readings.length}. Missing values are left empty; gaps are NOT interpolated.${R.wire?.aggregated ? ' Data: ' + R.wire.aggregated + '.' : ''}`,
      `# Settings: polarity=${settings.polarity}; minInputPowerW=${settings.minInputPowerW}; chargingThresholdA=${settings.chargingThresholdA}; effTolerancePct=${settings.effTolerancePct}`,
      '# Efficiency = battery output power / solar input power x 100 (estimate, not MPPT tracking efficiency)',
    ];
    const head = ['timestamp_utc', 'timestamp_local', 'entry_id', 'pv_voltage_V', 'pv_current_A', 'battery_voltage_V', 'battery_current_A', 'solar_power_W', 'battery_power_W', 'efficiency_estimate_pct', 'efficiency_status', 'battery_state', 'data_quality', 'issues'];
    const c = (v: number | null, d = 4) => (v == null ? '' : v.toFixed(d));
    const lines = R.readings.map((r) => [
      new Date(r.t).toISOString(), fmtDateTime(r.t, 'local').replace(/,/g, ''), r.id, c(r.solarVoltage), c(r.solarCurrent), c(r.batteryVoltage), c(r.batteryCurrent),
      c(r.solarPower), c(r.batteryPower), c(r.conversionEfficiencyPercent, 2), r.effStatus, r.batteryState, r.quality, `"${r.issues.join('; ').replace(/"/g, "'")}"`,
    ].join(','));
    const blob = new Blob([[...meta, head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mppt-solar_${sel.key}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const summary = METRICS.map((x) => ({ ...x, s: statsOf(R.readings.map((r) => val(r, x.key))) }));
  const changed = (Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(DEFAULT_SETTINGS[k]));

  return (
    <>
      <PageHeader icon={<History size={22} />} color="var(--blue)" eyebrow="Records" title="History & Reports"
        desc="Browse stored ThingSpeak readings, export the selected range as CSV, or print / save a PDF report."
        right={<>
          <button className="btn" onClick={exportCsv} disabled={!R.readings.length}><Download size={16} /> CSV</button>
          <button className="btn primary" onClick={() => window.print()} disabled={!R.readings.length}><Printer size={16} /> Report / PDF</button>
        </>} />

      <div className="card no-print" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <RangePicker value={sel} onChange={(s) => { setSel(s); setPage(0); }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={metric} onChange={(e) => setMetric(e.target.value as MKey)} aria-label="Metric">
            {METRICS.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.unit})</option>)}
          </select>
          <div className="seg" role="group" aria-label="View">
            <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}><LineChart size={14} style={{ verticalAlign: -2 }} /> Chart</button>
            <button aria-pressed={view === 'table'} onClick={() => setView('table')}><Table2 size={14} style={{ verticalAlign: -2 }} /> Table</button>
          </div>
        </div>
      </div>

      {/* Print-only report header */}
      {mounted && <div className="print-only">
        <h1 style={{ margin: '0 0 4px' }}>MPPT Solar — Monitoring Report</h1>
        <p style={{ margin: 0 }}>Channel {R.wire?.channel?.id ?? 3534436} · {R.wire?.channel?.name}</p>
        <p style={{ margin: 0 }}>Range: {fmtDateTime(rangeStart, settings.timeZone)} → {fmtDateTime(rangeEnd, settings.timeZone)} ({RANGE_LABELS[sel.key]}) · Generated {fmtDateTime(Date.now(), settings.timeZone)}</p>
        <hr />
      </div>}

      <div className="grid g-4 mt-l">
        <div className="card"><div className="eyebrow">Records</div><div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{R.readings.length}</div><div className="note">{R.wire?.aggregated ?? 'raw entries'}</div></div>
        <div className="card"><div className="eyebrow">Data coverage</div><div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{energy ? Math.round(energy.coverage * 100) : 0}%</div><div className="note">{gaps.length} gap(s) &gt; {Math.round(R.gapMs / 60000)} min</div></div>
        <div className="card"><div className="eyebrow">Solar energy (est.)</div><div className="mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--amber)' }}>{energy && energy.coverage > 0.2 ? fmt(energy.wh, 2) : '—'}<small className="muted"> Wh</small></div><div className="note">trapezoidal, gaps excluded</div></div>
        <div className="card"><div className="eyebrow">Quality</div><div className="note" style={{ marginTop: 6 }}>
          <span className="q valid">valid {quality.valid}</span> <span className="q incomplete">incomplete {quality.incomplete}</span><br />
          <span className="q out_of_range">out-of-range {quality.out_of_range}</span> <span className="q implausible">eff. flagged {quality.implausible}</span>
        </div></div>
      </div>

      {(view === 'chart') && (
        <Card className="mt-l" title={`${m.label} — ${RANGE_LABELS[sel.key]}`} sub="Drag the brush to zoom · breaks in the line are missing intervals">
          <ChartState loading={R.loading} error={R.error} hasData={data.length > 0} onRetry={R.refresh} emptyText="No stored entries in this range." height={320}>
            <TimeSeriesChart title={m.label} data={data} brush height={320} yLabel={m.unit} series={[{ key: 'v', name: m.label, color: m.color, unit: m.unit, digits: m.digits, area: true }]} />
          </ChartState>
        </Card>
      )}

      <Card className={`mt-l ${view === 'chart' ? 'print-only' : ''}`} title="Summary statistics">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Metric</th><th>Min</th><th>Max</th><th>Average</th><th>Samples</th></tr></thead>
            <tbody>{summary.map((x) => <tr key={x.key}><td style={{ fontFamily: 'var(--font)' }}>{x.label} ({x.unit})</td><td>{fmt(x.s.min, x.digits)}</td><td>{fmt(x.s.max, x.digits)}</td><td>{fmt(x.s.avg, x.digits)}</td><td>{x.s.count}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      {view === 'table' && (
        <Card className="mt-l no-print" title="Data table" sub={`${sorted.length} rows · page ${page + 1} of ${pages}`}
          right={<div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>}>
          <ChartState loading={R.loading} error={R.error} hasData={rows.length > 0} onRetry={R.refresh} emptyText="No stored entries in this range.">
            <div className="table-wrap" style={{ maxHeight: 560 }}>
              <table className="data">
                <thead><tr>
                  <th className="sortable" onClick={() => setDesc((d) => !d)} aria-sort={desc ? 'descending' : 'ascending'}>Timestamp <ArrowUpDown size={12} /></th>
                  <th>PV V</th><th>PV A</th><th>Batt V</th><th>Batt A</th><th>Solar W</th><th>Batt W</th><th>Eff %</th><th>Quality</th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const prev = desc ? rows[i + 1] : rows[i - 1];
                    const gap = prev && Math.abs(r.t - prev.t) > R.gapMs;
                    return (
                      <tr key={`${r.id}-${r.t}`}>
                        <td>{fmtDateTime(r.t, settings.timeZone)}{gap && <span className="q gap" style={{ marginLeft: 6 }}>gap</span>}</td>
                        <Cell v={r.solarVoltage} /><Cell v={r.solarCurrent} d={3} /><Cell v={r.batteryVoltage} /><Cell v={r.batteryCurrent} d={3} />
                        <Cell v={r.solarPower} /><Cell v={r.batteryPower} /><Cell v={r.conversionEfficiencyPercent} d={1} flag={r.effStatus === 'implausible'} />
                        <td><span className={`q ${r.quality}`} title={r.issues.join('; ')}>{r.quality.replace('_', ' ')}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartState>
        </Card>
      )}

      {gaps.length > 0 && (
        <Card className="mt-l" title="Missing intervals" sub="Not interpolated in charts or exports">
          <div className="chart-legend">
            {gaps.slice(-20).reverse().map((g) => (
              <span key={g.from} className="badge neutral">{fmtDateTime(g.from, settings.timeZone)} → {fmtDateTime(g.to, settings.timeZone)} ({Math.round((g.to - g.from) / 60000)} min)</span>
            ))}
            {gaps.length > 20 && <span className="muted small">…and {gaps.length - 20} more</span>}
          </div>
        </Card>
      )}

      <Card className="mt-l" title="Calculation notes">
        <ul className="note" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Solar power = PV voltage × PV current. Battery power = battery voltage × battery current with configured polarity (+ = into battery).</li>
          <li>Conversion efficiency (estimate) = battery output ÷ solar input × 100, only when input ≥ {settings.minInputPowerW} W and charging is confirmed. Not MPPT tracking efficiency.</li>
          <li>Energy = trapezoidal integration of power over time; intervals longer than {Math.round(R.gapMs / 60000)} min are excluded and reported as reduced coverage.</li>
          <li>Timestamps come from ThingSpeak (UTC) and are displayed in {settings.timeZone === 'utc' ? 'UTC' : 'your local time zone'}.</li>
          <li>Settings changed from defaults: {changed.length ? changed.map((k) => `${k}=${JSON.stringify(settings[k])}`).join('; ') : 'none'}.</li>
        </ul>
      </Card>
    </>
  );
}

function Cell({ v, d = 2, flag }: { v: number | null; d?: number; flag?: boolean }) {
  if (v == null) return <td className="miss">—</td>;
  return <td style={flag ? { color: 'var(--coral)' } : undefined}>{v.toFixed(d)}</td>;
}
