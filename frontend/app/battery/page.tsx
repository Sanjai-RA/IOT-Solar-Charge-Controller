'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BatteryCharging, Zap, PlugZap, Activity, ShieldCheck } from 'lucide-react';
import { useLatest, useSettings } from '@/components/Providers';
import { useRangeReadings, type RangeSel } from '@/lib/useRange';
import MetricCard from '@/components/MetricCard';
import { TimeSeriesChart } from '@/components/Charts';
import { Card, ChartState, PageHeader, RangePicker, StatsStrip } from '@/components/UI';
import { FreshnessBadge } from '@/components/LiveStatus';
import { batteryVoltageStatus, chartSeries, statsOf } from '@/lib/calculations';
import { BATTERY_TYPES } from '@/lib/config';
import { fmtAge, fmtDateTime } from '@/lib/format';
import { stateLabel } from '@/lib/labels';

export default function BatteryPage() {
  const { settings } = useSettings();
  const L = useLatest();
  const [sel, setSel] = useState<RangeSel>({ key: settings.defaultRange });
  const R = useRangeReadings(sel);
  const r = L.latest;
  const stale = L.freshness !== 'live';
  const tail = R.readings.slice(-40);

  const vData = useMemo(() => chartSeries(R.readings, (x) => ({ v: x.batteryVoltage }), R.gapMs), [R.readings, R.gapMs]);
  const iData = useMemo(() => chartSeries(R.readings, (x) => ({ i: x.batteryCurrent }), R.gapMs), [R.readings, R.gapMs]);
  const pData = useMemo(() => chartSeries(R.readings, (x) => ({ p: x.batteryPower }), R.gapMs), [R.readings, R.gapMs]);
  const sv = statsOf(R.readings.map((x) => x.batteryVoltage));
  const si = statsOf(R.readings.map((x) => x.batteryCurrent));
  const sp = statsOf(R.readings.map((x) => x.batteryPower));
  const counts = useMemo(() => {
    const c = { charging: 0, discharging: 0, idle: 0, other: 0 };
    R.readings.forEach((x) => { if (x.batteryState in c) (c as any)[x.batteryState]++; else c.other++; });
    return c;
  }, [R.readings]);
  const total = R.readings.length || 1;
  const vs = batteryVoltageStatus(r?.batteryVoltage ?? null, settings.batteryType, r?.batteryState ?? 'unknown');
  const st = r?.batteryState;
  const stColor = st === 'charging' ? 'mint' : st === 'discharging' ? 'delayed' : st === 'idle' ? 'cyan' : 'neutral';
  const empty = <>No entries for this range. Latest reading: {r ? `${fmtDateTime(r.t, settings.timeZone)} (${fmtAge(L.ageSec)})` : 'none'}.</>;

  return (
    <>
      <PageHeader icon={<BatteryCharging size={22} />} color="var(--mint)" eyebrow="Energy storage" title="Battery"
        desc="Battery voltage (field3), current (field4) and power, with a charging state derived from the configured current polarity."
        right={<><FreshnessBadge /><RangePicker value={sel} onChange={setSel} /></>} />

      <div className="grid g-4">
        <MetricCard index={0} label="Battery Voltage" value={r?.batteryVoltage} unit="V" color="var(--mint)" icon={Zap} stale={stale} spark={tail.map((x) => x.batteryVoltage)} foot="field3" />
        <MetricCard index={1} label="Battery Current" value={r?.batteryCurrent} unit="A" digits={3} color="var(--blue)" icon={Activity} stale={stale} spark={tail.map((x) => x.batteryCurrent)} foot="field4 (raw sign)" />
        <MetricCard index={2} label="Battery Power" value={r?.batteryPower} unit="W" color="var(--mint)" icon={PlugZap} stale={stale} spark={tail.map((x) => x.batteryPower)} foot="+ = into battery" />
        <div className="card kpi" style={{ ['--c' as any]: 'var(--mint)' }}>
          <div className="kpi-top"><span className="kpi-label">Charging state</span><span className="kpi-icon"><BatteryCharging size={18} /></span></div>
          <div style={{ marginTop: 14 }}><span className={`badge ${stColor}`} style={{ fontSize: 14 }}><span className="dot" />{stateLabel(st)}{stale && st ? ' (stale)' : ''}</span></div>
          <div className="kpi-foot"><span>
            {settings.polarity === 'not_calibrated' ? 'Direction not calibrated — set polarity in Settings.' :
              `Polarity: ${settings.polarity === 'positive_charging' ? '+ current = charging' : '− current = charging'} · threshold ±${settings.chargingThresholdA} A`}
          </span></div>
        </div>
      </div>

      <div className="grid g-main mt-l">
        <Card title="Battery voltage vs time" icon={<Zap size={18} color="var(--mint)" />}>
          <ChartState loading={R.loading} error={R.error} hasData={vData.length > 0} onRetry={R.refresh} emptyText={empty} height={280}>
            <TimeSeriesChart title="Battery voltage" data={vData} syncId="batt" brush height={280} series={[{ key: 'v', name: 'Battery voltage', color: 'var(--mint)', unit: 'V', area: true }]} yLabel="V" />
            <div className="mt"><StatsStrip stats={sv} unit="V" /></div>
          </ChartState>
        </Card>
        <Card title="Status estimate" icon={<ShieldCheck size={18} color="var(--mint)" />} sub={BATTERY_TYPES[settings.batteryType].label}>
          {vs.band ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div className="eyebrow">Voltage-based status estimate</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: vs.band === 'High' ? 'var(--mint)' : vs.band === 'Medium' ? 'var(--amber)' : 'var(--coral)' }}>{vs.band}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px 0' }}><div className="eyebrow">State of charge</div><div style={{ fontSize: 22, fontWeight: 600 }} className="muted">Not available</div></div>
          )}
          <p className="note">{vs.note}</p>
          <div className="divider" />
          <dl className="kv">
            <dt>Chemistry</dt><dd>{BATTERY_TYPES[settings.batteryType].label}</dd>
            <dt>Nominal</dt><dd>{settings.batteryNominalV} V</dd>
            <dt>Voltage limits</dt><dd>{settings.limits.batteryVoltage[0]} – {settings.limits.batteryVoltage[1]} V</dd>
            <dt>Current limits</dt><dd>{settings.limits.batteryCurrent[0]} – {settings.limits.batteryCurrent[1]} A</dd>
          </dl>
          <p className="note"><Link href="/settings" style={{ color: 'var(--cyan)' }}>Edit in Settings →</Link></p>
        </Card>
      </div>

      <div className="grid g-2 mt-l">
        <Card title="Battery current vs time" icon={<Activity size={18} color="var(--blue)" />}>
          <ChartState loading={R.loading} error={R.error} hasData={iData.length > 0} onRetry={R.refresh} emptyText={empty}>
            <TimeSeriesChart title="Battery current" data={iData} syncId="batt" series={[{ key: 'i', name: 'Battery current', color: 'var(--blue)', unit: 'A', digits: 3, area: true }]} yLabel="A" />
            <div className="mt"><StatsStrip stats={si} unit="A" digits={3} /></div>
          </ChartState>
        </Card>
        <Card title="Battery power trend" icon={<PlugZap size={18} color="var(--mint)" />} sub="+ = into battery (per polarity setting)">
          <ChartState loading={R.loading} error={R.error} hasData={pData.length > 0} onRetry={R.refresh} emptyText={empty}>
            <TimeSeriesChart title="Battery power" data={pData} syncId="batt" series={[{ key: 'p', name: 'Battery power', color: 'var(--mint)', unit: 'W', area: true }]} yLabel="W" />
            <div className="mt"><StatsStrip stats={sp} unit="W" /></div>
          </ChartState>
        </Card>
      </div>

      <Card className="mt-l" title="Charging state distribution" sub={`${R.readings.length} readings in range`}>
        <div style={{ display: 'flex', height: 18, borderRadius: 99, overflow: 'hidden', background: 'var(--grid)' }} role="img"
          aria-label={`Charging ${counts.charging}, discharging ${counts.discharging}, idle ${counts.idle}, unknown ${counts.other}`}>
          <div style={{ width: `${(counts.charging / total) * 100}%`, background: 'var(--mint)' }} />
          <div style={{ width: `${(counts.discharging / total) * 100}%`, background: 'var(--amber)' }} />
          <div style={{ width: `${(counts.idle / total) * 100}%`, background: 'var(--cyan)' }} />
          <div style={{ width: `${(counts.other / total) * 100}%`, background: 'var(--text-3)' }} />
        </div>
        <div className="chart-legend mt">
          <span><i style={{ borderColor: 'var(--mint)' }} />Charging {Math.round((counts.charging / total) * 100)}%</span>
          <span><i style={{ borderColor: 'var(--amber)' }} />Discharging {Math.round((counts.discharging / total) * 100)}%</span>
          <span><i style={{ borderColor: 'var(--cyan)' }} />Idle {Math.round((counts.idle / total) * 100)}%</span>
          <span><i style={{ borderColor: 'var(--text-3)' }} />Unknown / uncalibrated {Math.round((counts.other / total) * 100)}%</span>
        </div>
      </Card>
    </>
  );
}
