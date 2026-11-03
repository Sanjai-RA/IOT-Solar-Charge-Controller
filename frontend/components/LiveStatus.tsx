'use client';
import { useLatest } from './Providers';
import { fmtAge } from '@/lib/format';

const LABEL = { live: 'Live', delayed: 'Delayed', stale: 'Stale', none: 'No data' } as const;

/** Pulses only when recent data is actually arriving. */
export function FreshnessBadge({ showAge = true }: { showAge?: boolean }) {
  const { freshness, ageSec, error, loading, latest } = useLatest();
  if (!latest && loading) return <span className="badge none"><span className="dot" />Connecting…</span>;
  if (!latest && error) return <span className="badge error" role="status"><span className="dot" />Offline</span>;
  return (
    <span className={`badge ${freshness}`} role="status" aria-live="polite" title={error ? `Refresh failed: ${error}` : undefined}>
      <span className="dot" />
      {LABEL[freshness]}
      {showAge && ageSec != null && <span className="mono hide-mobile" style={{ fontWeight: 500, opacity: 0.85 }}>· {fmtAge(ageSec)}</span>}
    </span>
  );
}
