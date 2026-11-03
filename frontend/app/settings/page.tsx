'use client';
import { useState } from 'react';
import { Settings as SettingsIcon, PlugZap, Palette, SlidersHorizontal, BatteryCharging, CheckCircle2, XCircle, RotateCcw, Loader2 } from 'lucide-react';
import { useLatest, useSettings } from '@/components/Providers';
import { usePolled } from '@/lib/usePolled';
import { Card, PageHeader } from '@/components/UI';
import { BATTERY_TYPES, FIELD_MAP, RANGE_LABELS } from '@/lib/config';
import { fmtDateTime } from '@/lib/format';
import type { Limits, Settings } from '@/lib/types';

interface Status {
  channelId: string; access: string; accessLabel: string; defaultRefreshSeconds: number;
  lastSuccessAt: string | null; lastErrorAt: string | null; lastError: string | null; lastLatencyMs: number | null;
  test: null | { ok: boolean; latencyMs: number | null; message: string; channelName: string | null; fields: Record<string, string> | null; lastEntryAt: string | null };
}

export default function SettingsPage() {
  const { settings: s, update, reset, savedAt } = useSettings();
  const L = useLatest();
  const st = usePolled<Status>('/api/status', 30e3);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<Status['test']>(null);

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await fetch('/api/status?test=1', { cache: 'no-store' });
      const j: Status = await r.json();
      setTest(j.test);
      st.refresh();
    } catch {
      setTest({ ok: false, latencyMs: null, message: 'Could not reach the dashboard server.', channelName: null, fields: null, lastEntryAt: null });
    } finally { setTesting(false); }
  };

  const fields = test?.fields ?? L.wire?.channel?.fields ?? null;
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v)) update({ [k]: v } as Partial<Settings>);
  };
  const lim = (k: keyof Limits, i: 0 | 1) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    const next = [...s.limits[k]] as [number, number];
    next[i] = v;
    update({ limits: { ...s.limits, [k]: next } });
  };

  return (
    <>
      <PageHeader icon={<SettingsIcon size={22} />} color="var(--text-2)" eyebrow="Configuration" title="System Settings"
        desc="ThingSpeak connection status, refresh cadence, thresholds, units and display preferences. Settings are saved in this browser and recorded in exported reports."
        right={<>
          {savedAt && <span className="badge mint"><CheckCircle2 size={13} /> Saved</span>}
          <button className="btn" onClick={() => confirm('Reset all settings to defaults?') && reset()}><RotateCcw size={15} /> Reset defaults</button>
        </>} />

      <div className="grid g-main">
        <Card title="ThingSpeak connection" icon={<PlugZap size={18} color="var(--cyan)" />} sub="API keys are kept on the server and never shown here"
          right={<button className="btn violet" onClick={runTest} disabled={testing}>{testing ? <Loader2 size={15} className="spin" /> : <PlugZap size={15} />} Test connection</button>}>
          <dl className="kv">
            <dt>Channel ID</dt><dd>{st.data?.channelId ?? '3534436'}</dd>
            <dt>Channel name</dt><dd>{test?.channelName ?? L.wire?.channel?.name ?? '—'}</dd>
            <dt>Access</dt><dd style={{ fontFamily: 'var(--font)' }}>{st.data?.accessLabel ?? '—'}</dd>
            <dt>Last successful fetch</dt><dd>{st.data?.lastSuccessAt ? fmtDateTime(Date.parse(st.data.lastSuccessAt), s.timeZone) : '—'}{st.data?.lastLatencyMs != null ? ` (${st.data.lastLatencyMs} ms)` : ''}</dd>
            <dt>Last error</dt><dd style={{ color: st.data?.lastError ? 'var(--coral)' : undefined, fontFamily: 'var(--font)' }}>
              {st.data?.lastError ? `${st.data.lastError} (${fmtDateTime(Date.parse(st.data.lastErrorAt!), s.timeZone)})` : 'none'}</dd>
            <dt>Latest entry</dt><dd>{L.latest ? fmtDateTime(L.latest.t, s.timeZone) : '—'}</dd>
          </dl>
          {test && (
            <div className={`alert ${test.ok ? 'ok' : 'critical'} mt`}>
              <span className="a-ic">{test.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</span>
              <div><b>{test.ok ? 'Connection OK' : 'Connection failed'}</b><p>{test.message}{test.latencyMs != null ? ` · ${test.latencyMs} ms` : ''}{test.lastEntryAt ? ` · last entry ${fmtDateTime(Date.parse(test.lastEntryAt), s.timeZone)}` : ''}</p></div>
            </div>
          )}
        </Card>
        <Card title="Field mapping" sub="Confirm against ThingSpeak → Channel Settings">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Field</th><th>Expected</th><th>On channel</th><th>Unit</th></tr></thead>
              <tbody>
                {FIELD_MAP.map((f) => {
                  const actual = fields?.[f.field];
                  const ok = actual == null || actual.toLowerCase().replace(/\s+/g, '_') === f.name;
                  return (
                    <tr key={f.field}>
                      <td>{f.field}</td><td>{f.name}</td>
                      <td style={{ color: ok ? undefined : 'var(--amber)' }}>{actual ?? '—'}{!ok && ' ⚠'}</td><td>{f.unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid g-2 mt-l">
        <Card title="Refresh & display" icon={<Palette size={18} color="var(--violet)" />}>
          <div className="set-grid">
            <label className="field">Refresh interval (seconds)
              <input type="number" min={15} max={600} value={s.refreshSeconds} onChange={(e) => update({ refreshSeconds: Math.max(15, Math.min(600, Number(e.target.value) || 30)) })} />
            </label>
            <label className="field">Theme
              <select value={s.theme} onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}><option value="dark">Dark (default)</option><option value="light">Light</option></select>
            </label>
            <label className="field">Animation
              <select value={s.motion} onChange={(e) => update({ motion: e.target.value as Settings['motion'] })}>
                <option value="system">Follow system (reduced-motion)</option><option value="reduce">Reduce animation</option><option value="full">Full animation</option>
              </select>
            </label>
            <label className="field">Default chart range
              <select value={s.defaultRange} onChange={(e) => update({ defaultRange: e.target.value as Settings['defaultRange'] })}>
                {(['1h', '6h', '24h', '7d'] as const).map((k) => <option key={k} value={k}>{RANGE_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="field">Time zone display
              <select value={s.timeZone} onChange={(e) => update({ timeZone: e.target.value as Settings['timeZone'] })}><option value="local">Local time</option><option value="utc">UTC</option></select>
            </label>
            <label className="field">Chart gap threshold (min)
              <input type="number" min={1} max={120} value={s.gapMinutes} onChange={num('gapMinutes')} />
            </label>
          </div>
          <p className="note">ThingSpeak free channels accept one upload every 15 s; refreshing faster than your ESP32 upload cadence adds no new data. Units: V, A, W, Wh, %.</p>
        </Card>
        <Card title="Freshness & forecast" icon={<SlidersHorizontal size={18} color="var(--cyan)" />}>
          <div className="set-grid">
            <label className="field">Live if newer than (s)<input type="number" min={15} value={s.liveSeconds} onChange={num('liveSeconds')} /></label>
            <label className="field">Stale after (s)<input type="number" min={30} value={s.staleSeconds} onChange={num('staleSeconds')} /></label>
            <label className="field">Forecast max data age (min)<input type="number" min={5} max={1440} value={s.forecastMaxAgeMin} onChange={num('forecastMaxAgeMin')} /></label>
          </div>
          <p className="note">Between “live” and “stale” the status shows <b>Delayed</b>. Choose thresholds from your real upload interval (e.g. 20 s uploads → live ≤ 90 s).</p>
        </Card>
      </div>

      <div className="grid g-2 mt-l">
        <Card title="Calculation settings" icon={<SlidersHorizontal size={18} color="var(--amber)" />}>
          <div className="set-grid">
            <label className="field">Battery current polarity
              <select value={s.polarity} onChange={(e) => update({ polarity: e.target.value as Settings['polarity'] })}>
                <option value="positive_charging">Positive current = charging</option>
                <option value="negative_charging">Negative current = charging</option>
                <option value="not_calibrated">Not calibrated</option>
              </select>
            </label>
            <label className="field">Charging threshold (A)<input type="number" step="0.01" min={0} value={s.chargingThresholdA} onChange={num('chargingThresholdA')} /></label>
            <label className="field">Min. input power for efficiency (W)<input type="number" step="0.05" min={0} value={s.minInputPowerW} onChange={num('minInputPowerW')} /></label>
            <label className="field">Efficiency tolerance above 100% (%)<input type="number" step="1" min={0} max={30} value={s.effTolerancePct} onChange={num('effTolerancePct')} /></label>
            <label className="field">Panel rated power (W)<input type="number" step="0.01" min={0.1} value={s.panelRatedW} onChange={num('panelRatedW')} /></label>
          </div>
          <p className="note">Verify polarity with a multimeter: during sunlight with the battery charging, field4 should have the sign selected above.</p>
        </Card>
        <Card title="Battery" icon={<BatteryCharging size={18} color="var(--mint)" />}>
          <div className="set-grid">
            <label className="field">Chemistry / type
              <select value={s.batteryType} onChange={(e) => { const t = e.target.value as Settings['batteryType']; update({ batteryType: t, batteryNominalV: BATTERY_TYPES[t].nominal }); }}>
                {Object.entries(BATTERY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label className="field">Nominal voltage (V)<input type="number" step="0.1" value={s.batteryNominalV} onChange={num('batteryNominalV')} /></label>
          </div>
          <p className="note">Exact State of Charge is not computed from voltage alone. With a chemistry selected, the Battery page shows a voltage-based High / Medium / Low estimate with a disclaimer.</p>
        </Card>
      </div>

      <Card className="mt-l" title="Warning thresholds (expected ranges)" sub="Readings outside these limits are flagged ‘out of range’. Review against your actual hardware ratings to avoid false alarms.">
        <div className="set-grid">
          {([
            ['solarVoltage', 'PV voltage (V)'], ['solarCurrent', 'PV current (A)'], ['batteryVoltage', 'Battery voltage (V)'], ['batteryCurrent', 'Battery current (A)'],
          ] as [keyof Limits, string][]).map(([k, label]) => (
            <div key={k} className="field" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
              {label}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" step="0.01" value={s.limits[k][0]} onChange={lim(k, 0)} aria-label={`${label} minimum`} style={{ width: '100%' }} />
                <span className="muted">to</span>
                <input type="number" step="0.01" value={s.limits[k][1]} onChange={lim(k, 1)} aria-label={`${label} maximum`} style={{ width: '100%' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
