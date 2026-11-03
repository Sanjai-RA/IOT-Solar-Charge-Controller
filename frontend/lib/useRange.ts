'use client';
import { useMemo } from 'react';
import { usePolled } from './usePolled';
import { deriveAll, effectiveGapMs, wireToRows } from './calculations';
import type { RangeKey, Reading, TelemetryWire } from './types';
import { useSettings } from '@/components/Providers';

export interface RangeSel {
  key: Exclude<RangeKey, 'latest'>;
  start?: string; // ISO (custom)
  end?: string;
}

export function rangeUrl(sel: RangeSel): string | null {
  if (sel.key === 'custom') {
    if (!sel.start || !sel.end) return null;
    return `/api/telemetry?range=custom&start=${encodeURIComponent(sel.start)}&end=${encodeURIComponent(sel.end)}`;
  }
  return `/api/telemetry?range=${sel.key}`;
}

export function useRangeReadings(sel: RangeSel) {
  const { settings } = useSettings();
  const url = rangeUrl(sel);
  // Custom (historical) ranges don't need fast polling.
  const interval = sel.key === 'custom' ? 10 * 60e3 : sel.key === '7d' ? Math.max(120e3, settings.refreshSeconds * 1000) : settings.refreshSeconds * 1000;
  const q = usePolled<TelemetryWire>(url, interval);
  const readings: Reading[] = useMemo(() => deriveAll(wireToRows(q.data), settings), [q.data, settings]);
  const gapMs = useMemo(() => effectiveGapMs(readings, settings), [readings, settings]);
  return { ...q, readings, gapMs, wire: q.data };
}
