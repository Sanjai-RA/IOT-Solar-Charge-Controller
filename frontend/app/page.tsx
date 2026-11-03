'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { Sun, Zap, BatteryCharging, Gauge as GaugeIcon, Activity, Flame, BrainCircuit, ArrowRight, PlugZap, Clock } from 'lucide-react';
import { useLatest, useSettings } from '@/components/Providers';
import { useRangeReadings } from '@/lib/useRange';
import MetricCard from '@/components/MetricCard';
import SolarScene from '@/components/SolarScene';
import PowerFlow from '@/components/PowerFlow';
import { TimeSeriesChart } from '@/components/Charts';
import { AlertList, Card, ChartState } from '@/components/UI';
import { FreshnessBadge } from '@/components/LiveStatus';
import { chartSeries, integrateWh, validEff } from '@/lib/calculations';
import { buildAlerts } from '@/lib/validation';
import { fmt, fmtDateTime } from '@/lib/format';
import { effReason, stateLabel } from '@/lib/labels';

export default function OverviewPage() {
  const { settings } = useSettings();
  const L = useLatest();
  const R = useRangeReadings({ key: '24h' });
  const r = L.latest;
  const stale = L.freshness !== 'live';
  const tail = R.readings.slice(-40);

  const powerData = useMemo(() => chartSeries(R.readings, (x) => ({ solarPower: x.solarPower, outputPower: x.outputPower }), R.gapMs), [R.readings, R.gapMs]);
  const battData = useMemo(() => chartSeries(R.readings, (x) => ({ batteryVoltage: x.batteryVoltage, batteryCurrent: x.batteryCurrent }), R.gapMs), [R.readings, R.gapMs]);
  const effData = useMemo(() => chartSeries(R.readings, (x) => ({ eff: validEff(x) }), R.gapMs), [R.readings, R.gapMs]);
  // Recompute each render is cheap; today's window starts at local midnight
  const midnight = new Date(L.now).setHours(0, 0, 0, 0);
  const today = useMemo(() => {
    if (!R.readings.length) return null;
    const pv = integrateWh(R.readings, 'solarPower', midnight, L.now, R.gapMs);
    const out = integrateWh(R.readings, 'outputPower', midnight, L.now, R.gapMs);
    return { pv, out };
  }, [R.readings, R.gapMs, midnight, Math.floor(L.now / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = buildAlerts({ latest: r, freshness: L.freshness, ageSec: L.ageSec, fetchError: L.error, recent: R.readings.slice(-200), settings });
  const effOk = r?.effStatus === 'ok';

  return (
    <>
      {/* HERO */}
      <section className="card hero" aria-label="Solar Energy Control Center">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">MPPT Solar · Channel {L.wire?.channel?.id ?? 3534436}</div>
            <h1>Solar Energy <span className="grad">Control Center</span></h1>
            <div className="hero-meta">
              <FreshnessBadge />
              <span className="badge neutral"><Clock size={13} /> {r ? fmtDateTime(r.t, settings.timeZone) : '—'}</span>
              <span className="badge neutral">Refresh {settings.refreshSeconds}s</span>
            </div>
            <p className="note" style={{ margin: 0 }}>
              Live readings from ThingSpeak (field1–field4). Scene brightness follows <b>measured PV power</b>; the sun is decorative, not an irradiance sensor.
            </p>
            <div className="hero-stats">
              <div className="hero-stat"><span>PV power</span><b style={{ color: 'var(--amber)' }}>{fmt(r?.solarPower)} W</b></div>
              <div className="hero-stat"><span>Battery</span><b style={{ color: 'var(--mint)' }}>{fmt(r?.batteryVoltage)} V</b></div>
              <div className="hero-stat"><span>State</span><b style={{ fontSize: 14, fontFamily: 'var(--font)' }}>{stateLabel(r?.batteryState)}</b></div>
            </div>
          </div>
          <div className="hero-scene">
            <SolarScene powerW={r?.solarPower ?? null} ratedW={settings.panelRatedW} live={L.freshness === 'live'} charging={r?.batteryState === 'charging'}
              solarV={r?.solarVoltage ?? null} batteryV={r?.batteryVoltage ?? null} />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid g-4 mt-l">
        <MetricCard index={0} label="Solar Voltage" value={r?.solarVoltage} unit="V" color="var(--cyan)" icon={Zap} stale={stale} spark={tail.map((x) => x.solarVoltage)} foot="PV · field1" />
        <MetricCard index={1} label="Solar Current" value={r?.solarCurrent} unit="A" digits={3} color="var(--blue)" icon={Activity} stale={stale} spark={tail.map((x) => x.solarCurrent)} foot="PV · field2" />
        <MetricCard index={2} label="Solar Power" value={r?.solarPower} unit="W" color="var(--amber)" icon={Sun} stale={stale} spark={tail.map((x) => x.solarPower)} foot="V × I" />
        <MetricCard index={3} label="Battery Voltage" value={r?.batteryVoltage} unit="V" color="var(--mint)" icon={BatteryCharging} stale={stale} spark={tail.map((x) => x.batteryVoltage)} foot="field3" />
        <MetricCard index={4} label="Battery Current" value={r?.batteryCurrent} unit="A" digits={3} color="var(--blue)" icon={PlugZap} stale={stale} spark={tail.map((x) => x.batteryCurrent)} foot={`field4 · ${stateLabel(r?.batteryState)}`} />
        <MetricCard index={5} label="Battery Power" value={r?.batteryPower} unit="W" color="var(--mint)" icon={BatteryCharging} stale={stale} spark={tail.map((x) => x.batteryPower)} foot="+ = into battery" />
        <MetricCard index={6} label="Conversion Efficiency" value={effOk ? r!.conversionEfficiencyPercent : null} unit="%" digits={1} color="var(--violet)" icon={GaugeIcon} stale={stale}
          spark={tail.map(validEff)} foot={effOk ? 'Estimate (out ÷ in)' : effReason(r?.effStatus)} />
        <MetricCard index={7} label="Est. Power Loss" value={effOk ? r!.estimatedPowerLossW : null} unit="W" color="var(--coral)" icon={Flame} stale={stale}
          spark={tail.map((x) => (x.effStatus === 'ok' ? x.estimatedPowerLossW : null))} foot="in − out (estimate)" />
      </div>

      {/* Flow + alerts */}
      <div className="grid g-main mt-l">
        <Card title="Power flow" sub="Solar input → MPPT controller → battery" icon={<Zap size={18} color="var(--amber)" />} delay={0.1}>
          <PowerFlow r={r} freshness={L.freshness} ratedW={settings.panelRatedW} />
        </Card>
        <Card title="Alerts & insights" sub="Data quality and threshold checks" delay={0.15}>
          <AlertList alerts={alerts} />
        </Card>
      </div>

      {/* Trends */}
      <div className="grid g-2 mt-l">
        <Card title="Solar power — last 24 h" sub="Input (PV) vs output (into battery)" delay={0.1}>
          <ChartState loading={R.loading} error={R.error} hasData={powerData.length > 0} onRetry={R.refresh} emptyText="No ThingSpeak entries in the last 24 hours.">
            <TimeSeriesChart title="Solar power last 24 hours" data={powerData} series={[
              { key: 'solarPower', name: 'Solar input', color: 'var(--amber)', unit: 'W', area: true },
              { key: 'outputPower', name: 'Battery output', color: 'var(--mint)', unit: 'W', dash: '5 4' },
            ]} yLabel="W" />
          </ChartState>
        </Card>
        <Card title="Battery voltage & current — last 24 h" delay={0.15}>
          <ChartState loading={R.loading} error={R.error} hasData={battData.length > 0} onRetry={R.refresh} emptyText="No ThingSpeak entries in the last 24 hours.">
            <TimeSeriesChart title="Battery voltage and current last 24 hours" data={battData} series={[
              { key: 'batteryVoltage', name: 'Battery voltage', color: 'var(--mint)', unit: 'V', area: true },
              { key: 'batteryCurrent', name: 'Battery current', color: 'var(--blue)', unit: 'A', axis: 'right', digits: 3, dash: '2 3' },
            ]} yLabel="V" yLabelRight="A" />
          </ChartState>
        </Card>
      </div>

      <div className="grid g-main mt-l">
        <Card title="Conversion efficiency trend" sub="Invalid/implausible points are excluded and shown as gaps" delay={0.1}>
          <ChartState loading={R.loading} error={R.error} hasData={effData.some((d) => d.eff != null)} onRetry={R.refresh}
            emptyText="No valid efficiency points (needs solar input above threshold and confirmed charging current).">
            <TimeSeriesChart title="Efficiency trend" data={effData} series={[{ key: 'eff', name: 'Efficiency (estimate)', color: 'var(--violet)', unit: '%', area: true, digits: 1 }]} yLabel="%" height={220} />
          </ChartState>
        </Card>
        <Card title="Today" sub="Energy since local midnight (trapezoidal integration)" delay={0.15}>
          {!today ? (
            <p className="note">No readings today yet.</p>
          ) : (
            <>
              <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="stat"><span>Solar energy (est.)</span><b style={{ color: 'var(--amber)' }}>{today.pv.coverage >= 0.2 ? fmt(today.pv.wh, 2) : '—'}</b> <small className="muted">Wh</small></div>
                <div className="stat"><span>Into battery (est.)</span><b style={{ color: 'var(--mint)' }}>{today.out.coverage >= 0.2 ? fmt(today.out.wh, 2) : '—'}</b> <small className="muted">Wh</small></div>
              </div>
              <p className="note">
                Sampling coverage: <b>{Math.round(today.pv.coverage * 100)}%</b> of today. Gaps longer than {Math.round(R.gapMs / 60000)} min are not integrated.
                {today.pv.coverage < 0.2 && ' Coverage too low for a meaningful estimate.'} Values are estimates.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Quick nav */}
      <div className="grid g-4 mt-l">
        {[
          { href: '/solar', t: 'Solar Panel', d: 'PV voltage, current, power', c: 'var(--amber)', i: <Sun size={22} /> },
          { href: '/battery', t: 'Battery', d: 'Charging trend & status', c: 'var(--mint)', i: <BatteryCharging size={22} /> },
          { href: '/efficiency', t: 'MPPT & Efficiency', d: 'In/out power, losses', c: 'var(--cyan)', i: <GaugeIcon size={22} /> },
          { href: '/forecast', t: 'AI Forecast', d: 'Future values + uncertainty', c: 'var(--violet)', i: <BrainCircuit size={22} /> },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="card qnav" style={{ ['--c' as any]: q.c }}>
            <span className="ic">{q.i}</span>
            <span><b>{q.t}</b><span>{q.d}</span></span>
            <ArrowRight size={18} className="arr" />
          </Link>
        ))}
      </div>
    </>
  );
}

