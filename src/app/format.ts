export function labelFromToken(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function slugToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Plain-language elapsed time between two ISO timestamps. Per FW-0039 §Timing
 * realism — used by the StatusRuntime per-case timing strip. Never claims
 * "average" or "typical" — that copy belongs to the workflow-throughput strip
 * (FW-0067) once the upstream EXT-29 projection lands.
 */
export function formatDuration(fromIso: string, toIso: string): string {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return '';
  }
  const ms = Math.max(0, to - from);
  if (ms < MINUTE_MS) {
    return 'less than a minute';
  }
  if (ms < HOUR_MS) {
    const n = Math.round(ms / MINUTE_MS);
    return `${n} minute${n === 1 ? '' : 's'}`;
  }
  if (ms < DAY_MS) {
    const n = Math.round(ms / HOUR_MS);
    return `${n} hour${n === 1 ? '' : 's'}`;
  }
  const n = Math.round(ms / DAY_MS);
  return `${n} day${n === 1 ? '' : 's'}`;
}
