'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '@/lib/config';
import type { Freshness, Reading, Settings, TelemetryWire } from '@/lib/types';
import { usePolled } from '@/lib/usePolled';
import { derive, freshnessOf, wireToRows } from '@/lib/calculations';
import { useNow } from '@/lib/useNow';

// ---------------- Settings ----------------
interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  reducedMotion: boolean;
  savedAt: number | null;
}
const SettingsContext = createContext<SettingsCtx | null>(null);

function mergeSettings(raw: any): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) } as Settings;
  s.limits = { ...DEFAULT_SETTINGS.limits, ...(raw?.limits || {}) };
  return s;
}

export function useSettings(): SettingsCtx {
  const c = useContext(SettingsContext);
  if (!c) throw new Error('useSettings must be used inside <Providers>');
  return c;
}

// ---------------- Latest telemetry ----------------
interface LatestCtx {
  wire: TelemetryWire | null;
  latest: Reading | null;
  freshness: Freshness;
  ageSec: number | null;
  error: string | null;
  loading: boolean;
  lastSuccess: number | null;
  refresh: () => void;
  now: number;
}
const LatestContext = createContext<LatestCtx | null>(null);
export function useLatest(): LatestCtx {
  const c = useContext(LatestContext);
  if (!c) throw new Error('useLatest must be used inside <Providers>');
  return c;
}

function LatestProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const { data, error, loading, lastSuccess, refresh } = usePolled<TelemetryWire>('/api/telemetry?range=latest', settings.refreshSeconds * 1000);
  const now = useNow(1000);
  const latest = useMemo(() => {
    const rows = wireToRows(data);
    return rows.length ? derive(rows[rows.length - 1], settings) : null;
  }, [data, settings]);
  const f = freshnessOf(latest?.t, now, settings);
  // If the fetch itself is failing, the values are by definition not live.
  const state: Freshness = error && f.state === 'live' ? 'delayed' : f.state;
  const value: LatestCtx = { wire: data, latest, freshness: state, ageSec: f.ageSec, error, loading, lastSuccess, refresh, now };
  return <LatestContext.Provider value={value}>{children}</LatestContext.Provider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [systemReduce, setSystemReduce] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) setSettings(mergeSettings(JSON.parse(raw)));
    } catch { /* storage unavailable — defaults used */ }
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      setSystemReduce(mq.matches);
      const on = (e: MediaQueryListEvent) => setSystemReduce(e.matches);
      mq.addEventListener?.('change', on);
      return () => mq.removeEventListener?.('change', on);
    }
  }, []);

  const persist = (s: Settings) => {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s)); setSavedAt(Date.now()); } catch { /* ignore */ }
  };
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => { const next = mergeSettings({ ...prev, ...patch }); persist(next); return next; });
  }, []);
  const reset = useCallback(() => { setSettings(DEFAULT_SETTINGS); persist(DEFAULT_SETTINGS); }, []);

  const reducedMotion = settings.motion === 'reduce' || (settings.motion === 'system' && systemReduce);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = settings.theme;
    html.classList.toggle('reduce-motion', reducedMotion);
  }, [settings.theme, reducedMotion]);

  const ctx = useMemo(() => ({ settings, update, reset, reducedMotion, savedAt }), [settings, update, reset, reducedMotion, savedAt]);

  return (
    <SettingsContext.Provider value={ctx}>
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
        <LatestProvider>{children}</LatestProvider>
      </MotionConfig>
    </SettingsContext.Provider>
  );
}
