'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, Sparkles, FlaskConical, Info, Timer, Database, Target } from 'lucide-react';
import { useSettings } from '@/components/Providers';
import { usePolled } from '@/lib/usePolled';
import { BacktestChart, ForecastChart } from '@/components/Charts';
import { Card, EmptyState, LoadingBlock, PageHeader } from '@/components/UI';
import { FreshnessBadge } from '@/components/LiveStatus';
import type { ForecastMetric, ForecastResult } from '@/lib/types';
import { fmt, fmtDateTime } from '@/lib/format';

const METRICS: { key: ForecastMetric; label: string }[] = [
  { key: 'solarPower', label: 'Solar power' },
  { key: 'solarVoltage', label: 'Solar voltage' },
  { key: 'solarCurrent', label: 'Solar current' },
  { key: 'batteryVoltage', label: 'Battery voltage' },
  { key: 'batteryPower', label: 'Battery power' },
];
const HORIZONS = [30, 60, 180];

export default function ForecastPage() {
  const { settings } = useSettings();
  const [metric, setMetric] = useState<ForecastMetric>('solarPower');
  const [horizon, setHorizon] = useState(60);
  const url = `/api/forecast?metric=${metric}&horizon=${horizon}&pol=${settings.polarity}&maxAge=${settings.forecastMaxAgeMin}`;
  const F = usePolled<ForecastResult>(url, Math.max(60e3, settings.refreshSeconds * 1000));
  const d = F.data;
  const digits = metric === 'solarCurrent' ? 3 : 2;
  const sel = d?.models.find((m) => m.id === d.selected?.id);
  const persist = d?.models.find((m) => m.id === 'persistence');
  const last = d?.forecast[d.forecast.length - 1];

  return (
    <>
      <PageHeader icon={<BrainCircuit size={22} />} color="var(--violet)" eyebrow="Predictive analytics" title="AI Forecast"
        desc="Future values predicted from real ThingSpeak history. Candidate models are trained on the earlier 80% of the history and scored on the most recent 20% (chronological split, never random)."
        right={<FreshnessBadge />} />

      <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="seg" role="group" aria-label="Metric">
          {METRICS.map((m) => <button key={m.key} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Forecast horizon">
          {HORIZONS.map((h) => {
            const avail = !d || d.availableHorizons.length === 0 || d.availableHorizons.includes(h);
            return (
              <button key={h} aria-pressed={horizon === h} onClick={() => setHorizon(h)} disabled={!avail}
                title={avail ? undefined : 'Not validated with current history'} style={avail ? undefined : { opacity: 0.4, cursor: 'not-allowed' }}>
                Next {h < 60 ? `${h} min` : `${h / 60} h`}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="mt-l" title={`${METRICS.find((m) => m.key === metric)?.label} — measured history & forecast`} icon={<Sparkles size={18} color="var(--violet)" />}
        sub={d?.status === 'ok' ? `Horizon ${horizon} min · ${d.stepMin}-minute steps · generated ${fmtDateTime(Date.parse(d.generatedAt), settings.timeZone)}` : undefined}
        right={d?.selected && <span className={`badge ${d.selected.learned ? 'violet' : 'cyan'}`}>{d.selected.learned ? 'Learned model' : 'Baseline model'}</span>}>
        {!d && F.loading ? <LoadingBlock height={340} /> :
          !d && F.error ? <EmptyState error title="Forecast service error" detail={F.error} onRetry={F.refresh} /> :
          d && d.status !== 'ok' ? (
            <>
              <EmptyState title={d.status === 'horizon_unavailable' ? 'Horizon not available' : 'Not enough recent data to forecast'} detail={d.message} onRetry={F.refresh} />
              {d.history.some((h) => h.v != null) && (
                <div className="mt"><p className="note">Measured history only (no predicted curve drawn):</p>
                  <ForecastChart label="history" history={d.history} forecast={[]} unit={d.unit} height={240} digits={digits} /></div>
              )}
            </>
          ) : d ? (
            <>
              <ForecastChart label={metric} history={d.history} forecast={d.forecast} unit={d.unit} digits={digits} />
              {last && (
                <motion.div className="stats mt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                  <div className="stat"><span>Predicted at +{horizon} min</span><b style={{ color: 'var(--violet)' }}>{fmt(last.v, digits)}</b> <small className="muted">{d.unit}</small></div>
                  <div className="stat"><span>80% band</span><b>{fmt(last.lo, digits)}–{fmt(last.hi, digits)}</b></div>
                  <div className="stat"><span>Forecast until</span><b style={{ fontSize: 14 }}>{fmtDateTime(last.t, settings.timeZone)}</b></div>
                  <div className="stat"><span>Last measured</span><b style={{ fontSize: 14 }}>{d.lastObservedAt ? fmtDateTime(Date.parse(d.lastObservedAt), settings.timeZone) : '—'}</b></div>
                </motion.div>
              )}
              {F.error && <p className="note" style={{ color: 'var(--coral)' }}>Refresh failed ({F.error}) — showing previous forecast.</p>}
            </>
          ) : null}
      </Card>

      {d && d.status === 'ok' && (
        <>
          <div className="grid g-main mt-l">
            <Card title="Backtest — actual vs predicted" icon={<Target size={18} color="var(--cyan)" />}
              sub={`Holdout ${fmtDateTime(Date.parse(d.test!.start), settings.timeZone)} → ${fmtDateTime(Date.parse(d.test!.end), settings.timeZone)} · predictions made ${horizon} min ahead`}>
              {d.backtest.length ? <BacktestChart data={d.backtest} unit={d.unit} /> : <p className="note">Not enough holdout points.</p>}
            </Card>
            <Card title="Model card" icon={<FlaskConical size={18} color="var(--violet)" />}>
              <dl className="kv">
                <dt>Model</dt><dd style={{ fontFamily: 'var(--font)' }}>{d.selected?.name}</dd>
                <dt>Version</dt><dd>{d.selected?.version}</dd>
                <dt>Parameters</dt><dd>{d.selected?.params}</dd>
                <dt>Last trained</dt><dd>{fmtDateTime(Date.parse(d.generatedAt), settings.timeZone)} (on each request)</dd>
                <dt>Raw samples</dt><dd>{d.samplesUsed.toLocaleString()} readings</dd>
                <dt>5-min buckets</dt><dd>{d.bucketsUsed} (train {d.train?.buckets} / test origins {d.test?.origins})</dd>
                <dt>MAE (holdout)</dt><dd>{fmt(sel?.mae, 4)} {d.unit}</dd>
                <dt>RMSE (holdout)</dt><dd>{fmt(sel?.rmse, 4)} {d.unit}</dd>
                <dt>vs persistence</dt><dd>{sel?.skillVsPersistence != null ? `${(sel.skillVsPersistence * 100).toFixed(1)}% lower MAE` : '—'} (persistence MAE {fmt(persist?.mae, 4)})</dd>
              </dl>
              <p className="note" style={{ marginTop: 12 }}>{d.message}</p>
            </Card>
          </div>

          <Card className="mt-l" title="Model comparison (time-ordered holdout)" icon={<Database size={18} color="var(--cyan)" />}
            sub="Lowest MAE is selected. Skill = 1 − MAE ÷ persistence MAE. No accuracy % is shown because it has no defined evaluation method here.">
            <div className="table-wrap">
              <table className="data model-table">
                <thead><tr><th>Model</th><th>Type</th><th>MAE ({d.unit})</th><th>RMSE ({d.unit})</th><th>Skill vs persistence</th><th>Eval points</th></tr></thead>
                <tbody>
                  {[...d.models].sort((a, b) => (a.mae ?? 1e9) - (b.mae ?? 1e9)).map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontFamily: 'var(--font)' }}>{m.name} {m.id === d.selected?.id && <span className="tag-best">★ selected</span>}</td>
                      <td style={{ fontFamily: 'var(--font)' }}>{m.learned ? 'Learned' : 'Baseline'}</td>
                      <td>{fmt(m.mae, 4)}</td><td>{fmt(m.rmse, 4)}</td>
                      <td style={{ color: (m.skillVsPersistence ?? 0) > 0 ? 'var(--mint)' : 'var(--text-3)' }}>{m.skillVsPersistence == null ? '—' : `${(m.skillVsPersistence * 100).toFixed(1)}%`}</td>
                      <td>{m.evalPoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-l" title="Limitations" icon={<Info size={18} color="var(--amber)" />}>
        <ul className="note" style={{ margin: 0, paddingLeft: 18 }}>
          {(d?.notes ?? ['No weather data source is connected — sudden cloud changes cannot be predicted.']).map((n) => <li key={n}>{n}</li>)}
          <li>Forecasts are only generated when the latest reading is newer than {settings.forecastMaxAgeMin} min and at least ~3 h of history exists. Otherwise no curve is drawn.</li>
          <li>Only horizons with enough validated holdout points are offered. The model is retrained on every request from the latest 8,000 ThingSpeak entries.</li>
          <li><Timer size={12} style={{ verticalAlign: -1 }} /> History is resampled to {d?.stepMin ?? 5}-minute means before modelling; missing buckets stay missing.</li>
        </ul>
      </Card>
    </>
  );
}
