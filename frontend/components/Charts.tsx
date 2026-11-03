'use client';
import { useId, useMemo, useRef } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Brush, ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import { useSettings } from './Providers';
import { axisTimeFormatter, fmtDateTime } from '@/lib/format';

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
  unit: string;
  digits?: number;
  area?: boolean;
  dash?: string;
  axis?: 'left' | 'right';
}

function TooltipBox({ active, payload, label, series, tz }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value != null && !Array.isArray(p.value));
  if (!rows.length) return null;
  return (
    <div className="tt">
      <div className="tt-time">{fmtDateTime(label, tz)}</div>
      {rows.map((p: any) => {
        const s: SeriesDef | undefined = series.find((x: SeriesDef) => x.key === p.dataKey);
        return (
          <div className="tt-row" key={p.dataKey}>
            <span><i className="tt-sw" style={{ background: s?.color ?? p.color }} />{s?.name ?? p.name}</span>
            <b>{Number(p.value).toFixed(s?.digits ?? 2)} {s?.unit}</b>
          </div>
        );
      })}
    </div>
  );
}

/** Summary for screen readers. */
function srSummary(data: any[], series: SeriesDef[]) {
  return series
    .map((s) => {
      const v = data.map((d) => d[s.key]).filter((x) => x != null) as number[];
      if (!v.length) return `${s.name}: no data.`;
      return `${s.name}: min ${Math.min(...v).toFixed(2)}, max ${Math.max(...v).toFixed(2)}, latest ${v[v.length - 1].toFixed(2)} ${s.unit}.`;
    })
    .join(' ');
}

export function TimeSeriesChart({
  data, series, height = 260, brush = false, syncId, yLabel, yLabelRight, domain, title,
}: {
  data: any[]; series: SeriesDef[]; height?: number; brush?: boolean; syncId?: string; yLabel?: string; yLabelRight?: string;
  domain?: [any, any]; title: string;
}) {
  const { settings, reducedMotion } = useSettings();
  const drawn = useRef(false); // draw-in animation only on first load
  const animate = !reducedMotion && !drawn.current && data.length > 0;
  if (data.length > 0) drawn.current = true;
  const span = data.length ? data[data.length - 1].t - data[0].t : 0;
  const tickFmt = useMemo(() => axisTimeFormatter(span, settings.timeZone), [span, settings.timeZone]);
  const hasRight = series.some((s) => s.axis === 'right');
  const uid = useId().replace(/:/g, '');
  const ids = series.map((s) => `g-${s.key}-${uid}`);

  return (
    <figure className="chart-wrap" style={{ margin: 0 }} aria-label={title}>
      <div className="chart-legend" style={{ marginBottom: 8 }}>
        {series.map((s) => (
          <span key={s.key}><i className={s.dash ? 'dash' : ''} style={{ borderColor: s.color }} />{s.name} ({s.unit})</span>
        ))}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} syncId={syncId} margin={{ top: 8, right: hasRight ? 4 : 12, left: -6, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={ids[i]} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={s.color} stopOpacity={0.38} />
                  <stop offset="1" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tickFmt} stroke="var(--grid)" minTickGap={40} tickLine={false} />
            <YAxis yAxisId="left" stroke="var(--grid)" tickLine={false} width={52} domain={domain ?? ['auto', 'auto']}
              label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', offset: 18, fill: 'var(--text-3)', fontSize: 11 } : undefined} />
            {hasRight && (
              <YAxis yAxisId="right" orientation="right" stroke="var(--grid)" tickLine={false} width={48}
                label={yLabelRight ? { value: yLabelRight, angle: 90, position: 'insideRight', offset: 14, fill: 'var(--text-3)', fontSize: 11 } : undefined} />
            )}
            <Tooltip content={<TooltipBox series={series} tz={settings.timeZone} />} cursor={{ stroke: 'var(--text-3)', strokeDasharray: '3 3' }} />
            {series.map((s, i) =>
              s.area ? (
                <Area key={s.key} yAxisId={s.axis ?? 'left'} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2}
                  fill={`url(#${ids[i]})`} connectNulls={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} strokeDasharray={s.dash}
                  isAnimationActive={animate} animationDuration={1100} />
              ) : (
                <Line key={s.key} yAxisId={s.axis ?? 'left'} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2}
                  connectNulls={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} strokeDasharray={s.dash}
                  isAnimationActive={animate} animationDuration={1100} />
              ),
            )}
            {brush && data.length > 20 && (
              <Brush dataKey="t" height={24} stroke="var(--border-strong)" fill="transparent" travellerWidth={8} tickFormatter={tickFmt} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{title}. {srSummary(data, series)}</figcaption>
    </figure>
  );
}

/** Forecast overlay: solid measured history, dashed violet forecast, shaded uncertainty band, forecast-start marker. */
export function ForecastChart({
  history, forecast, unit, height = 340, digits = 2, label,
}: {
  history: { t: number; v: number | null }[]; forecast: { t: number; v: number; lo: number; hi: number }[]; unit: string; height?: number; digits?: number; label: string;
}) {
  const { settings, reducedMotion } = useSettings();
  const lastHist = [...history].reverse().find((h) => h.v != null);
  const start = lastHist?.t ?? forecast[0]?.t;
  const data = useMemo(() => {
    const rows: any[] = history.map((h) => ({ t: h.t, actual: h.v }));
    if (lastHist && forecast.length) {
      const i = rows.findIndex((r) => r.t === lastHist.t);
      if (i >= 0) { rows[i].forecast = lastHist.v; rows[i].band = [lastHist.v, lastHist.v]; }
    }
    for (const f of forecast) rows.push({ t: f.t, forecast: f.v, band: [f.lo, f.hi] });
    return rows;
  }, [history, forecast, lastHist]);
  const span = data.length ? data[data.length - 1].t - data[0].t : 0;
  const tickFmt = axisTimeFormatter(span, settings.timeZone);
  const end = data.length ? data[data.length - 1].t : 0;

  return (
    <figure className="chart-wrap" style={{ margin: 0 }} aria-label={`${label} forecast chart`}>
      <div className="chart-legend" style={{ marginBottom: 8 }}>
        <span><i style={{ borderColor: 'var(--cyan)' }} />Measured history (solid)</span>
        <span><i className="dash" style={{ borderColor: 'var(--violet)' }} />Predicted (dashed)</span>
        <span><i style={{ borderColor: 'color-mix(in srgb, var(--violet) 35%, transparent)', borderTopWidth: 8 }} />80% uncertainty band</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 18, right: 14, left: -6, bottom: 0 }}>
            <defs>
              <linearGradient id="histFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--cyan)" stopOpacity={0.3} />
                <stop offset="1" stopColor="var(--cyan)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            {start && forecast.length > 0 && <ReferenceArea x1={start} x2={end} fill="var(--violet)" fillOpacity={0.06} />}
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tickFmt} stroke="var(--grid)" minTickGap={40} tickLine={false} />
            <YAxis stroke="var(--grid)" tickLine={false} width={52} label={{ value: unit, angle: -90, position: 'insideLeft', offset: 18, fill: 'var(--text-3)', fontSize: 11 }} />
            <Tooltip
              content={({ active, payload, label: l }: any) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload;
                return (
                  <div className="tt">
                    <div className="tt-time">{fmtDateTime(l, settings.timeZone)}</div>
                    {row.actual != null && <div className="tt-row"><span><i className="tt-sw" style={{ background: 'var(--cyan)' }} />Measured</span><b>{row.actual.toFixed(digits)} {unit}</b></div>}
                    {row.forecast != null && row.actual == null && <div className="tt-row"><span><i className="tt-sw" style={{ background: 'var(--violet)' }} />Predicted</span><b>{row.forecast.toFixed(digits)} {unit}</b></div>}
                    {row.band && row.actual == null && <div className="tt-row"><span className="muted">80% band</span><b>{row.band[0].toFixed(digits)} – {row.band[1].toFixed(digits)}</b></div>}
                  </div>
                );
              }}
            />
            <Area dataKey="band" stroke="none" fill="var(--violet)" fillOpacity={0.2} isAnimationActive={!reducedMotion} connectNulls={false} />
            <Area dataKey="actual" type="monotone" stroke="var(--cyan)" strokeWidth={2.4} fill="url(#histFill)" connectNulls={false} dot={false} isAnimationActive={!reducedMotion} />
            <Line dataKey="forecast" type="monotone" stroke="var(--violet)" strokeWidth={2.6} strokeDasharray="7 6" dot={false} isAnimationActive={!reducedMotion} animationBegin={500} connectNulls />
            {start && forecast.length > 0 && (
              <ReferenceLine x={start} stroke="var(--violet)" strokeDasharray="3 3" label={{ value: 'Forecast start ▸', position: 'top', fill: 'var(--violet)', fontSize: 11 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {label}: {history.filter((h) => h.v != null).length} measured points; {forecast.length} predicted points
        {forecast.length ? `, ending at ${forecast[forecast.length - 1].v.toFixed(2)} ${unit} (80% band ${forecast[forecast.length - 1].lo.toFixed(2)}–${forecast[forecast.length - 1].hi.toFixed(2)})` : ''}.
      </figcaption>
    </figure>
  );
}

/** Actual vs predicted on the time-ordered holdout. */
export function BacktestChart({ data, unit, height = 240 }: { data: { t: number; actual: number; predicted: number }[]; unit: string; height?: number }) {
  const { settings, reducedMotion } = useSettings();
  const span = data.length ? data[data.length - 1].t - data[0].t : 0;
  return (
    <figure className="chart-wrap" style={{ margin: 0 }} aria-label="Backtest: actual versus predicted">
      <div className="chart-legend" style={{ marginBottom: 8 }}>
        <span><i style={{ borderColor: 'var(--cyan)' }} />Actual</span>
        <span><i className="dash" style={{ borderColor: 'var(--violet)' }} />Predicted (made one horizon earlier)</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={axisTimeFormatter(span, settings.timeZone)} stroke="var(--grid)" minTickGap={40} tickLine={false} />
            <YAxis stroke="var(--grid)" tickLine={false} width={52} />
            <Tooltip content={<TooltipBox tz={settings.timeZone} series={[
              { key: 'actual', name: 'Actual', color: 'var(--cyan)', unit },
              { key: 'predicted', name: 'Predicted', color: 'var(--violet)', unit },
            ]} />} />
            <Line dataKey="actual" stroke="var(--cyan)" strokeWidth={2} dot={false} isAnimationActive={!reducedMotion} />
            <Line dataKey="predicted" stroke="var(--violet)" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={!reducedMotion} />
            <Legend wrapperStyle={{ display: 'none' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
