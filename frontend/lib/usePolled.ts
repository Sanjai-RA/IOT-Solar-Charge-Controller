'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Shared polling store: one request + one interval per URL, no matter how many
 * components subscribe. On error the previous data is kept (marked by `error`).
 */
interface Entry<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  lastSuccess: number | null;
  lastAttempt: number | null;
  inflight: Promise<void> | null;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  intervalMs: number;
  snapshot: Snap<T>;
}
export interface Snap<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  lastSuccess: number | null;
}

const store = new Map<string, Entry<any>>();
const EMPTY: Snap<any> = { data: null, error: null, loading: true, lastSuccess: null };

function getEntry<T>(url: string): Entry<T> {
  let e = store.get(url);
  if (!e) {
    e = { data: null, error: null, loading: true, lastSuccess: null, lastAttempt: null, inflight: null, listeners: new Set(), timer: null, intervalMs: 30000, snapshot: EMPTY };
    store.set(url, e);
  }
  return e;
}

function emit(e: Entry<any>) {
  e.snapshot = { data: e.data, error: e.error, loading: e.loading, lastSuccess: e.lastSuccess };
  e.listeners.forEach((l) => l());
}

async function load(url: string) {
  const e = getEntry(url);
  if (e.inflight) return e.inflight;
  e.loading = true;
  e.lastAttempt = Date.now();
  emit(e);
  e.inflight = (async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      let body: any = null;
      try { body = await res.json(); } catch { throw new Error(`Server returned an unreadable response (HTTP ${res.status}).`); }
      if (!res.ok || body?.ok === false || body?.status === 'error') throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
      e.data = body;
      e.error = null;
      e.lastSuccess = Date.now();
    } catch (err: any) {
      e.error = err?.message || 'Request failed';
    } finally {
      e.loading = false;
      e.inflight = null;
      emit(e);
    }
  })();
  return e.inflight;
}

function startTimer(url: string) {
  const e = getEntry(url);
  if (e.timer) clearInterval(e.timer);
  e.timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    load(url);
  }, e.intervalMs);
}

export function usePolled<T>(url: string | null, intervalMs: number): Snap<T> & { refresh: () => void } {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!url) return () => {};
      const e = getEntry<T>(url);
      e.listeners.add(cb);
      if (e.listeners.size === 1) {
        e.intervalMs = intervalMs;
        const stale = !e.lastAttempt || Date.now() - e.lastAttempt > Math.min(intervalMs, 15000);
        if (stale) load(url);
        startTimer(url);
      }
      return () => {
        e.listeners.delete(cb);
        if (e.listeners.size === 0 && e.timer) { clearInterval(e.timer); e.timer = null; }
      };
    },
    [url, intervalMs],
  );
  const getSnap = useCallback(() => (url ? getEntry<T>(url).snapshot : EMPTY), [url]);
  const snap = useSyncExternalStore(subscribe, getSnap, () => EMPTY);

  // Interval change (settings) → restart timer
  useEffect(() => {
    if (!url) return;
    const e = getEntry(url);
    if (e.intervalMs !== intervalMs && e.listeners.size > 0) { e.intervalMs = intervalMs; startTimer(url); }
  }, [url, intervalMs]);

  // Refresh when the tab becomes visible again
  useEffect(() => {
    if (!url) return;
    const onVis = () => { if (document.visibilityState === 'visible') load(url); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [url]);

  const refresh = useCallback(() => { if (url) load(url); }, [url]);
  return { ...snap, refresh };
}
