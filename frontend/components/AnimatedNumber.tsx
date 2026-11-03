'use client';
import { useEffect, useRef } from 'react';
import { animate } from 'framer-motion';
import { useSettings } from './Providers';

/** Smoothly tweens from the previous value to the new one (never counts up from zero on refresh). */
export default function AnimatedNumber({ value, digits = 2, className = 'num' }: { value: number | null | undefined; digits?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const { reducedMotion } = useSettings();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value == null || !Number.isFinite(value)) { el.textContent = '—'; prev.current = null; return; }
    const from = prev.current;
    prev.current = value;
    if (from == null || reducedMotion || from === value) { el.textContent = value.toFixed(digits); return; }
    const c = animate(from, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { el.textContent = v.toFixed(digits); } });
    return () => c.stop();
  }, [value, digits, reducedMotion]);

  return <span ref={ref} className={className}>{value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)}</span>;
}
