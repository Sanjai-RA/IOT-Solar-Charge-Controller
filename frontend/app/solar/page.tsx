'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Sun, Zap, Activity, BrainCircuit } from 'lucide-react';
import { useLatest, useSettings } from '@/components/Providers';
import { useRangeReadings, type RangeSel } from '@/lib/useRange';
import { usePolled } from '@/lib/usePolled';
import MetricCard from '@/components/MetricCard';
import SolarScene from '@/components/SolarScene';
import { ForecastChart, TimeSeriesChart } from '@/components/Charts';
import { Card, ChartState, PageHeader, RangePicker, StatsStrip, EmptyState, LoadingBlock } from '@/components/UI';
import { FreshnessBadge } from '@/components/LiveStatus';
import { chartSeries, statsOf } from '@/lib/calculations';
import { fmt, fmtAge, fmtDateTime } from '@/lib/format';
import type { ForecastResult } from '@/lib/types';

export default function SolarPage() {
  const { settings } = useSettings();
  const L = useLatest();
  const [sel, setSel] = useState<RangeSel>({ key: settings.defaultRange });
  const R = useRangeReadings(sel);
  const r = L.latest;
  const stale = L.freshness !== 'live';
  const tail = R.readings.slice(-40);

  const vData = useMemo(() => chartSeries(R.readings, (x) => ({ v: x.solarVoltage }), R.gapMs), [R.readings, R.gapMs]);
  const iData = useMemo(() => chartSeries(R.readings, (x) => ({ i: x.solarCurrent }), R.gapMs), [R.readings, R.gapMs]);
  const pData = useMemo(() => chartSeries(R.readings, (x) => ({ p: x.solarPower }), R.gapMs), [R.readings, R.gapMs]);
  const sv = statsOf(R.readings.map((x) => x.solarVoltage));
  const si = statsOf(R.readings.map((x) => x.solarCurrent));
  const sp = statsOf(R.readings.map((x) => x.solarPower));
  const util = r?.solarPower != null && settings.panelRatedW > 0 ? (r.solarPower / settings.panelRatedW) * 100 : null;

  const fc = usePolled<ForecastResult>(`/api/forecast?metric=solarPower&horizon=60&pol=${settings.polarity}&maxAge=${settings.forecastMaxAgeMin}`, 120e3);

  const empty = <>No entries for this range. Latest reading: {r ? `${fmtDateTime(r.t, settings.timeZone)} (${fmtAge(L.ageSec)})` : 'none'}.</>;

  return (
    <>
      <PageHeader icon={<Sun size={22} />} color="var(--amber)" eyebrow="Photovoltaic input" title="Solar Panel"
        desc="PV voltage (field1), current (field2) and power (V × I) with history, statistics and freshness."
        right={<><FreshnessBadge /><RangePicker value={sel} onChange={setSel} /></>} />

      <div className="grid g-main">
        <Card className="hero" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ aspectRatio: '840 / 380', width: '100%' }}>
            <SolarScene powerW={r?.solarPower ?? null} ratedW={settings.panelRatedW} live={L.freshness === 'live'} charging={r?.batteryState === 'charging'}
              solarV={r?.solarVoltage ?? null} batteryV={r?.batteryVoltage ?? null} />
          </div>
        </Card>
        <Card title="Production status" sub={r ? `Last reading ${fmtDateTime(r.t, settings.timeZone)}` : 'Waiting for data'}>
          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><span>Status</span><b style={{ fontFamily: 'var(--font)', fontSize: 15 }}>{productionLabel(r?.solarPower ?? null, settings.minInputPowerW, stale)}</b></div>
            <div className="stat"><span>Data age</span><b style={{ fontSize: 15 }}>{fmtAge(L.ageSec)}</b></div>
            <div className="stat"><span>Nameplate</span><b>{settings.panelRatedW}</b> <small className="muted">W ref.</small></div>
            <div className="stat"><span>Utilisation</span><b>{fmt(util, 0)}</b> <small className="muted">%</small></div>
          </div>
          <p className="note">
            The <b>{settings.panelRatedW} W</b> nameplate (from panel specs) is a reference rating at standard test conditions, not a live reading.
            Utilisation = measured PV power ÷ nameplate; real output depends on irradiance, temperature and operating point.
          </p>
        </Card>
      </div>

      <div className="grid g-3 mt-l">
        <MetricCard index={0} label="PV Voltage" value={r?.solarVoltage} unit="V" color="var(--cyan)" icon={Zap} stale={stale} spark={tail.map((x) => x.solarVoltage)} foot="field1" />
        <MetricCard index={1} label="PV Current" value={r?.solarCurrent} unit="A" digits={3} color="var(--blue)" icon={Activity} stale={stale} spark={tail.map((x) => x.solarCurrent)} foot="field2" />
        <MetricCard index={2} label="PV Power" value={r?.solarPower} unit="W" color="var(--amber)" icon={Sun} stale={stale} spark={tail.map((x) => x.solarPower)} foot="V × I" />
      </div>

      {R.wire?.aggregated && <p className="note mt">Showing {R.wire.aggregated}. Min/max reflect averaged values.</p>}
      {R.wire?.truncated && <p className="note mt">Range contains more than 8,000 entries; the latest 8,000 are shown.</p>}

      <Card className="mt-l" title="PV power vs time" sub="Zoom with the brush under the chart" icon={<Sun size={18} color="var(--amber)" />}>
        <ChartState loading={R.loading} error={R.error} hasData={pData.length > 0} onRetry={R.refresh} emptyText={empty} height={300}>
          <TimeSeriesChart title="PV power" data={pData} syncId="solar" brush height={300} series={[{ key: 'p', name: 'PV power', color: 'var(--amber)', unit: 'W', area: true }]} yLabel="W" />
          <div className="mt"><StatsStrip stats={sp} unit="W" /></div>
        </ChartState>
      </Card>

      <div className="grid g-2 mt-l">
        <Card title="PV voltage vs time" icon={<Zap size={18} color="var(--cyan)" />}>
          <ChartState loading={R.loading} error={R.error} hasData={vData.length > 0} onRetry={R.refresh} emptyText={empty}>
            <TimeSeriesChart title="PV voltage" data={vData} syncId="solar" series={[{ key: 'v', name: 'PV voltage', color: 'var(--cyan)', unit: 'V', area: true }]} yLabel="V" />
            <div className="mt"><StatsStrip stats={sv} unit="V" /></div>
          </ChartState>
        </Card>
        <Card title="PV current vs time" icon={<Activity size={18} color="var(--blue)" />}>
          <ChartState loading={R.loading} error={R.error} hasData={iData.length > 0} onRetry={R.refresh} emptyText={empty}>
            <TimeSeriesChart title="PV current" data={iData} syncId="solar" series={[{ key: 'i', name: 'PV current', color: 'var(--blue)', unit: 'A', digits: 3, area: true }]} yLabel="A" />
            <div className="mt"><StatsStrip stats={si} unit="A" digits={3} /></div>
          </ChartState>
        </Card>
      </div>

      <Card className="mt-l" title="Measured vs forecast solar power (next 60 min)" icon={<BrainCircuit size={18} color="var(--violet)" />}
        right={<Link href="/forecast" className="btn">Open AI Forecast</Link>}>
        {!fc.data && fc.loading ? <LoadingBlock height={260} /> :
          fc.error && !fc.data ? <EmptyState error title="Forecast unavailable" detail={fc.error} onRetry={fc.refresh} /> :
          fc.data?.status !== 'ok' ? <EmptyState title="No forecast" detail={fc.data?.message} onRetry={fc.refresh} /> :
          <>
            <ForecastChart label="Solar power" history={fc.data.history} forecast={fc.data.forecast} unit="W" height={260} />
            <p className="note">Model: <b>{fc.data.selected?.name}</b> · MAE {fmt(fc.data.models.find((m) => m.id === fc.data!.selected?.id)?.mae, 3)} W on time-ordered holdout.</p>
          </>}
      </Card>
    </>
  );
}

function productionLabel(p: number | null, min: number, stale: boolean) {
  if (p == null) return 'No reading';
  const s = p < min ? 'Idle / very low' : p < min * 5 ? 'Low output' : 'Producing';
  return stale ? `${s} (stale)` : s;
}
