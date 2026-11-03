'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, XCircle, RefreshCw, DatabaseZap } from 'lucide-react';
import type { Alert } from '@/lib/validation';
import type { RangeSel } from '@/lib/useRange';
import { RANGE_LABELS } from '@/lib/config';
import type { Stats } from '@/lib/calculations';
import { fmt } from '@/lib/format';

export function PageHeader({ icon, color, eyebrow, title, desc, right }: {
  icon: React.ReactNode; color: string; eyebrow: string; title: string; desc?: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          <span className="h-icon" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>{icon}</span>
          {title}
        </h1>
        {desc && <p>{desc}</p>}
      </div>
      {right && <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{right}</div>}
    </div>
  );
}

export function Card({ title, sub, icon, right, children, className = '', delay = 0, style }: {
  title?: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number; style?: React.CSSProperties;
}) {
  return (
    <motion.section className={`card ${className}`} style={style}
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}>
      {(title || right) && (
        <div className="card-head">
          <div>
            {title && <h2 className="card-title">{icon}{title}</h2>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </motion.section>
  );
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  const ic = { critical: <XCircle size={18} />, warning: <AlertTriangle size={18} />, info: <Info size={18} />, ok: <CheckCircle2 size={18} /> };
  return (
    <ul className="alerts" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {alerts.map((a, i) => (
        <motion.li key={a.id} className={`alert ${a.level}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
          <span className="a-ic" aria-hidden>{ic[a.level]}</span>
          <div><b><span className="sr-only">{a.level}: </span>{a.title}</b><p>{a.detail}</p></div>
        </motion.li>
      ))}
    </ul>
  );
}

export function RangePicker({ value, onChange, allowCustom = true }: { value: RangeSel; onChange: (s: RangeSel) => void; allowCustom?: boolean }) {
  const [start, setStart] = useState(value.start ? toLocalInput(value.start) : toLocalInput(new Date(Date.now() - 86400e3).toISOString()));
  const [end, setEnd] = useState(value.end ? toLocalInput(value.end) : toLocalInput(new Date().toISOString()));
  const keys: RangeSel['key'][] = ['1h', '6h', '24h', '7d', ...(allowCustom ? (['custom'] as const) : [])];
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <div className="seg" role="group" aria-label="Time range">
        {keys.map((k) => (
          <button key={k} aria-pressed={value.key === k}
            onClick={() => onChange(k === 'custom' ? { key: 'custom', start: new Date(start).toISOString(), end: new Date(end).toISOString() } : { key: k })}>
            {RANGE_LABELS[k]}
          </button>
        ))}
      </div>
      {value.key === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start date and time" />
          <span className="muted">→</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End date and time" />
          <button className="btn" onClick={() => onChange({ key: 'custom', start: new Date(start).toISOString(), end: new Date(end).toISOString() })}>Apply</button>
        </div>
      )}
    </div>
  );
}

export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function LoadingBlock({ height = 260 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-busy="true" aria-label="Loading" />;
}

export function EmptyState({ title, detail, onRetry, error }: { title: string; detail?: React.ReactNode; onRetry?: () => void; error?: boolean }) {
  return (
    <div className="state" role={error ? 'alert' : 'status'}>
      {error ? <XCircle size={30} style={{ color: 'var(--coral)' }} /> : <DatabaseZap size={30} />}
      <b>{title}</b>
      {detail && <div className="small" style={{ maxWidth: 520 }}>{detail}</div>}
      {onRetry && <button className="btn" onClick={onRetry}><RefreshCw size={15} /> Retry</button>}
    </div>
  );
}

/** Wraps a chart with loading / error / empty handling. */
export function ChartState({ loading, error, hasData, onRetry, emptyText, height = 260, children }: {
  loading: boolean; error: string | null; hasData: boolean; onRetry: () => void; emptyText: React.ReactNode; height?: number; children: React.ReactNode;
}) {
  if (!hasData && loading) return <LoadingBlock height={height} />;
  if (!hasData && error) return <EmptyState error title="Could not load data" detail={error} onRetry={onRetry} />;
  if (!hasData) return <EmptyState title="No readings in this range" detail={emptyText} onRetry={onRetry} />;
  return (
    <>
      {error && <p className="note" style={{ color: 'var(--coral)', marginTop: 0 }}>Refresh failed ({error}) — showing last loaded data.</p>}
      {children}
    </>
  );
}

export function StatsStrip({ stats, unit, digits = 2 }: { stats: Stats; unit: string; digits?: number }) {
  return (
    <div className="stats">
      <div className="stat"><span>Min</span><b>{fmt(stats.min, digits)}</b> <small className="muted">{unit}</small></div>
      <div className="stat"><span>Max</span><b>{fmt(stats.max, digits)}</b> <small className="muted">{unit}</small></div>
      <div className="stat"><span>Average</span><b>{fmt(stats.avg, digits)}</b> <small className="muted">{unit}</small></div>
      <div className="stat"><span>Samples</span><b>{stats.count}</b></div>
    </div>
  );
}

/** Semicircle gauge with animated arc. */
export function Gauge({ value, label, sub, max = 100 }: { value: number | null; label: string; sub?: string; max?: number }) {
  const R = 90, C = Math.PI * R;
  const v = value == null ? 0 : Math.max(0, Math.min(max, value));
  const frac = v / max;
  const color = value == null ? 'var(--text-3)' : frac < 0.5 ? 'var(--coral)' : frac < 0.75 ? 'var(--amber)' : 'var(--mint)';
  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 220 130" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={`${label}: ${value == null ? 'not available' : value.toFixed(1) + '%'}`}>
        <defs>
          <linearGradient id="gArc" x1="0" x2="1">
            <stop offset="0" stopColor="#ff6b6b" />
            <stop offset="0.55" stopColor="#ffb020" />
            <stop offset="1" stopColor="#2ed3a2" />
          </linearGradient>
        </defs>
        <path d="M 20 115 A 90 90 0 0 1 200 115" fill="none" stroke="var(--grid)" strokeWidth="16" strokeLinecap="round" />
        {[0.25, 0.5, 0.75].map((f) => {
          const a = Math.PI * (1 - f);
          return <line key={f} x1={110 + 72 * Math.cos(a)} y1={115 - 72 * Math.sin(a)} x2={110 + 64 * Math.cos(a)} y2={115 - 64 * Math.sin(a)} stroke="var(--text-3)" strokeWidth="2" />;
        })}
        <motion.path d="M 20 115 A 90 90 0 0 1 200 115" fill="none" stroke="url(#gArc)" strokeWidth="16" strokeLinecap="round"
          strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - frac) }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
        <text x="110" y="98" textAnchor="middle" fontSize="32" fontWeight="700" fill={color} fontFamily="var(--mono)">{value == null ? 'N/A' : value.toFixed(1)}</text>
        <text x="110" y="120" textAnchor="middle" fontSize="11" fill="var(--text-3)">{value == null ? '' : '%'} {label}</text>
      </svg>
      {sub && <p className="note" style={{ textAlign: 'center', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}
