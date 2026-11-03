export function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtUnit(v: number | null | undefined, unit: string, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)} ${unit}`;
}

export function fmtTime(t: number | null | undefined, tz: 'local' | 'utc', withDate = false, withSeconds = true): string {
  if (t == null || !Number.isFinite(t)) return '—';
  const d = new Date(t);
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
    ...(withDate ? { day: '2-digit', month: 'short' } : {}),
    ...(tz === 'utc' ? { timeZone: 'UTC' } : {}),
  };
  return d.toLocaleString(undefined, opts) + (tz === 'utc' ? ' UTC' : '');
}

export function fmtDateTime(t: number | null | undefined, tz: 'local' | 'utc'): string {
  if (t == null || !Number.isFinite(t)) return '—';
  const d = new Date(t);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    ...(tz === 'utc' ? { timeZone: 'UTC' } : {}),
  }) + (tz === 'utc' ? ' UTC' : '');
}

export function fmtAge(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 0) sec = 0;
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ago`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h ago`;
}

export function axisTimeFormatter(spanMs: number, tz: 'local' | 'utc') {
  return (t: number) => {
    const d = new Date(t);
    const base: Intl.DateTimeFormatOptions = { hour12: false, ...(tz === 'utc' ? { timeZone: 'UTC' } : {}) };
    if (spanMs > 2 * 86400e3) return d.toLocaleString(undefined, { ...base, day: '2-digit', month: 'short', hour: '2-digit' });
    return d.toLocaleString(undefined, { ...base, hour: '2-digit', minute: '2-digit' });
  };
}
