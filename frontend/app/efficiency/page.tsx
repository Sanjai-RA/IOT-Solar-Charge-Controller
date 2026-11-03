'use client';
import { useMemo, useState } from 'react';
import { Gauge as GaugeIcon, Flame, ArrowDownUp, AlertTriangle, Sigma } from 'lucide-react';
import { useLatest, useSettings } from '@/components/Providers';
import { useRangeReadings, type RangeSel } from '@/lib/useRange';
import MetricCard from '@/components/MetricCard';
import { TimeSeriesChart } from '@/components/Charts';
import { Card, ChartState, Gauge, PageHeader, RangePicker, StatsStrip } from '@/components/UI';
import { FreshnessBadge } from '@/components/LiveStatus';
import { chartSeries, statsOf, validEff } from '@/lib/calculations';
import { fmt, fmtDateTime } from '@/lib/format';
import { effReason } from '@/lib/labels';
import { Sun, BatteryCharging } from 'lucide-react';

export default function EfficiencyPage() {
  const { settings } = useSettings();
  const L = useLatest();
  const [sel, setSel] = useState<RangeSel>({ key: settings.defaultRange });
  const R = useRangeReadings(sel);
  const r = L.latest;
  const stale = L.freshness !== 'live';
  const tail = R.readings.slice(-40);
  const effOk = r?.effStatus === 'ok';

  const ioData = useMemo(() => chartSeries(R.readings, (x) => ({ pin: x.solarPower, pout: x.outputPower }), R.gapMs), [R.readings, R.gapMs]);
  const lossData = useMemo(() => chartSeries(R.readings, (x) => ({ loss: x.effStatus === 'ok' ? x.estimatedPowerLossW : null }), R.gapMs), [R.readings, R.gapMs]);
  const effData = useMemo(() => chartSeries(R.readings, (x) => ({ eff: validEff(x) }), R.gapMs), [R.readings, R.gapMs]);
  const vData = useMemo(() => chartSeries(R.readings, (x) => ({ sv: x.solarVoltage, bv: x.batteryVoltage }), R.gapMs), [R.readings, R.gapMs]);
  const iData = useMemo(() => chartSeries(R.readings, (x) => ({ si: x.solarCurrent, bi: x.batteryCurrent }), R.gapMs), [R.readings, R.gapMs]);
  const es = statsOf(R.readings.map(validEff));
  const flagged = R.readings.filter((x) => x.effStatus === 'implausible');
  const breakdown = useMemo(() => {
    const c: Record<string, number> = {};
    R.readings.forEach((x) => (c[x.effStatus] = (c[x.effStatus] ?? 0) + 1));
    return c;
  }, [R.readings]);
  const empty = 'No entries for this range.';

  return (
    <>
      <PageHeader icon={<GaugeIcon size={22} />} color="var(--cyan)" eyebrow="Controller analysis" title="MPPT & Efficiency"
        desc={<>Input vs output power, <b>estimated conversion efficiency</b> and losses. This is not MPPT <i>tracking</i> efficiency, which needs the panel's true maximum-power-point power as a reference.</>}
        right={<><FreshnessBadge /><RangePicker value={sel} onChange={setSel} /></>} />

      <div className="grid g-main">
        <Card title="Conversion efficiency (latest)" icon={<GaugeIcon size={18} color="var(--violet)" />} sub={r ? fmtDateTime(r.t, settings.timeZone) : '—'}>
          <div className="grid g-2" style={{ alignItems: 'center' }}>
            <Gauge value={effOk ? r!.conversionEfficiencyPercent : null} label="conversion (est.)"
              sub={effOk ? (stale ? 'Last known value — data not live' : 'Battery output ÷ solar input') : `Not calculated: ${effReason(r?.effStatus)}`} />
            <div>
              <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="stat"><span>Input (PV)</span><b style={{ color: 'var(--amber)' }}>{fmt(r?.solarPower)}</b> <small className="muted">W</small></div>
                <div className="stat"><span>Output (batt)</span><b style={{ color: 'var(--mint)' }}>{fmt(r?.outputPower)}</b> <small className="muted">W</small></div>
                <div className="stat"><span>Loss (est.)</span><b style={{ color: 'var(--coral)' }}>{fmt(effOk ? r!.estimatedPowerLossW : null)}</b> <small className="muted">W</small></div>
                <div className="stat"><span>Range avg</span><b style={{ color: 'var(--violet)' }}>{fmt(es.avg, 1)}</b> <small className="muted">%</small></div>
              </div>
              <p className="note">
                Calculated only when PV input ≥ <b>{settings.minInputPowerW} W</b>, both measurements are valid and current polarity confirms charging.
                Wiring losses, sensor offsets, current polarity and timing mismatch between samples all affect this estimate.
              </p>
            </div>
          </div>
        </Card>
        <Card title="Formulas" icon={<Sigma size={18} color="var(--cyan)" />}>
          <dl className="kv">
            <dt>Input power</dt><dd>PV V × PV I</dd>
            <dt>Output power</dt><dd>Batt V × charging I</dd>
            <dt>Efficiency</dt><dd>out ÷ in × 100</dd>
            <dt>Power loss</dt><dd>in − out</dd>
            <dt>Plausible</dt><dd>0 … {100 + settings.effTolerancePct}% (else flagged)</dd>
          </dl>
          <div className="divider" />
          <div className="note">Calculation status in range:</div>
          <div className="chart-legend" style={{ marginTop: 6 }}>
            {Object.entries(breakdown).map(([k, v]) => <span key={k} className="badge neutral">{k === 'ok' ? 'Valid' : effReason(k)}: {v}</span>)}
          </div>
        </Card>
      </div>

      <div className="grid g-4 mt-l">
        <MetricCard index={0} label="Input Power" value={r?.solarPower} unit="W" color="var(--amber)" icon={Sun} stale={stale} spark={tail.map((x) => x.solarPower)} foot="PV" />
        <MetricCard index={1} label="Output Power" value={r?.outputPower} unit="W" color="var(--mint)" icon={BatteryCharging} stale={stale} spark={tail.map((x) => x.outputPower)} foot="into battery" />
        <MetricCard index={2} label="Efficiency (est.)" value={effOk ? r!.conversionEfficiencyPercent : null} unit="%" digits={1} color="var(--violet)" icon={GaugeIcon} stale={stale} spark={tail.map(validEff)} foot={effOk ? 'conversion' : effReason(r?.effStatus)} />
        <MetricCard index={3} label="Power Loss (est.)" value={effOk ? r!.estimatedPowerLossW : null} unit="W" color="var(--coral)" icon={Flame} stale={stale} spark={tail.map((x) => (x.effStatus === 'ok' ? x.estimatedPowerLossW : null))} foot="in − out" />
      </div>

      <Card className="mt-l" title="Input vs output power" icon={<ArrowDownUp size={18} color="var(--amber)" />} sub="Aligned on ThingSpeak timestamps · synchronized cursor with charts below">
        <ChartState loading={R.loading} error={R.error} hasData={ioData.length > 0} onRetry={R.refresh} emptyText={empty} height={300}>
          <TimeSeriesChart title="Input versus output power" data={ioData} syncId="eff" brush height={300} yLabel="W" series={[
            { key: 'pin', name: 'Solar input', color: 'var(--amber)', unit: 'W', area: true },
            { key: 'pout', name: 'Battery output', color: 'var(--mint)', unit: 'W', area: true, dash: '6 4' },
          ]} />
        </ChartState>
      </Card>

      <div className="grid g-2 mt-l">
        <Card title="Efficiency trend" sub="Invalid points excluded (gaps, not fake continuity)">
          <ChartState loading={R.loading} error={R.error} hasData={effData.some((d) => d.eff != null)} onRetry={R.refresh} emptyText="No valid efficiency points in this range.">
            <TimeSeriesChart title="Efficiency trend" data={effData} syncId="eff" yLabel="%" series={[{ key: 'eff', name: 'Efficiency (est.)', color: 'var(--violet)', unit: '%', digits: 1, area: true }]} />
            <div className="mt"><StatsStrip stats={es} unit="%" digits={1} /></div>
          </ChartState>
        </Card>
        <Card title="Estimated loss trend">
          <ChartState loading={R.loading} error={R.error} hasData={lossData.some((d) => d.loss != null)} onRetry={R.refresh} emptyText="No valid loss points in this range.">
            <TimeSeriesChart title="Loss trend" data={lossData} syncId="eff" yLabel="W" series={[{ key: 'loss', name: 'Power loss (est.)', color: 'var(--coral)', unit: 'W', area: true }]} />
          </ChartState>
        </Card>
        <Card title="Voltages (synchronized)">
          <ChartState loading={R.loading} error={R.error} hasData={vData.length > 0} onRetry={R.refresh} emptyText={empty}>
            <TimeSeriesChart title="PV and battery voltage" data={vData} syncId="eff" yLabel="V" series={[
              { key: 'sv', name: 'PV voltage', color: 'var(--cyan)', unit: 'V' },
              { key: 'bv', name: 'Battery voltage', color: 'var(--mint)', unit: 'V', dash: '5 4' },
            ]} />
          </ChartState>
        </Card>
        <Card title="Currents (synchronized)">
          <ChartState loading={R.loading} error={R.error} hasData={iData.length > 0} onRetry={R.refresh} emptyText={empty}>
            <TimeSeriesChart title="PV and battery current" data={iData} syncId="eff" yLabel="A" series={[
              { key: 'si', name: 'PV current', color: 'var(--blue)', unit: 'A', digits: 3 },
              { key: 'bi', name: 'Battery current', color: 'var(--mint)', unit: 'A', digits: 3, dash: '5 4' },
            ]} />
          </ChartState>
        </Card>
      </div>

      <Card className="mt-l" title="Readings flagged for review" icon={<AlertTriangle size={18} color="var(--coral)" />}
        sub={`Efficiency below 0% or above ${100 + settings.effTolerancePct}% — kept as-is (not clamped)`}>
        {flagged.length === 0 ? <p className="note">No implausible efficiency readings in this range.</p> : (
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table className="data">
              <thead><tr><th>Time</th><th>PV V</th><th>PV A</th><th>Batt V</th><th>Batt A</th><th>In W</th><th>Out W</th><th>Eff %</th></tr></thead>
              <tbody>
                {flagged.slice(-100).reverse().map((x) => (
                  <tr key={x.id + '-' + x.t}>
                    <td>{fmtDateTime(x.t, settings.timeZone)}</td><td>{fmt(x.solarVoltage)}</td><td>{fmt(x.solarCurrent, 3)}</td><td>{fmt(x.batteryVoltage)}</td>
                    <td>{fmt(x.batteryCurrent, 3)}</td><td>{fmt(x.solarPower)}</td><td>{fmt(x.outputPower)}</td><td style={{ color: 'var(--coral)' }}>{fmt(x.conversionEfficiencyPercent, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
