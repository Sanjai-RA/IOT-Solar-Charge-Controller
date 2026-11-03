'use client';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';

export function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < 2) return <svg className="kpi-spark" aria-hidden />;
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const W = 96, Hh = 30;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * W, Hh - 3 - ((x - min) / span) * (Hh - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = `sg${color.replace(/[^a-z]/gi, '')}`;
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${W} ${Hh}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.45" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${Hh} L0,${Hh} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function MetricCard({
  label, value, unit, digits = 2, color, icon: Icon, spark, foot, stale, index = 0, tag,
}: {
  label: string; value: number | null | undefined; unit: string; digits?: number; color: string; icon: LucideIcon;
  spark?: (number | null)[]; foot?: React.ReactNode; stale?: boolean; index?: number; tag?: React.ReactNode;
}) {
  return (
    <motion.div
      className={`card kpi ${stale ? 'stale' : ''}`}
      style={{ ['--c' as any]: color }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`${label}: ${value == null ? 'unavailable' : value.toFixed(digits) + ' ' + unit}${stale ? ' (stale)' : ''}`}
    >
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon"><Icon size={18} /></span>
      </div>
      <div className="kpi-value">
        <AnimatedNumber value={value} digits={digits} />
        <span className="unit">{unit}</span>
        {tag}
      </div>
      <div className="kpi-foot">
        <span>{foot}</span>
        {spark && <Sparkline values={spark} color={color} />}
      </div>
    </motion.div>
  );
}
