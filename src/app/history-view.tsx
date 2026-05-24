/**
 * Shared history render helpers (FW-0057 slice 1).
 *
 * Consumed by:
 *   - `HistoryRuntime` at `/history` (standalone dashboard).
 *
 * Slice 1 has no in-form consumer; the extraction discipline matches the
 * `documents-view.tsx` / `obligations-view.tsx` precedent so FW-0034 (lifecycle
 * actions on past records) or any future in-form history panel can reuse this
 * module without parallel-implementation drift.
 *
 * Per design §"History framing": group by `kind` in the closed-taxonomy order
 * (drafts → submissions → signed-records); sort within section by `timestamp`
 * desc (newest first); ties broken by `id` asc. Empty kinds do not surface as
 * zero-length sections.
 */

import type { HistoryEntry, HistoryEntryKind } from '../ports/index.ts';
import { formatDate, labelFromToken } from './format.ts';

/**
 * Closed-taxonomy kind order — mirrors `HistoryEntryKind` in
 * `respondent-history-source.ts`. Authoritative ordering for grouped
 * rendering. Append-only: future feature ADRs adding a kind extend this list
 * AND the upstream taxonomy together.
 */
export const HISTORY_KIND_ORDER: readonly HistoryEntryKind[] = [
  'draft',
  'submission',
  'signed-record',
] as const;

export type GroupedHistory = ReadonlyMap<HistoryEntryKind, HistoryEntry[]>;

export function groupAndSortHistory(entries: readonly HistoryEntry[]): GroupedHistory {
  const buckets = new Map<HistoryEntryKind, HistoryEntry[]>();
  for (const entry of entries) {
    const list = buckets.get(entry.kind);
    if (list) {
      list.push(entry);
    } else {
      buckets.set(entry.kind, [entry]);
    }
  }
  const ordered = new Map<HistoryEntryKind, HistoryEntry[]>();
  for (const kind of HISTORY_KIND_ORDER) {
    const list = buckets.get(kind);
    if (list && list.length > 0) {
      ordered.set(kind, list.slice().sort(byTimestampThenId));
    }
  }
  return ordered;
}

export function uniqueIssuerCount(entries: readonly HistoryEntry[]): number {
  const names = new Set<string>();
  for (const entry of entries) {
    names.add(entry.issuer.name);
  }
  return names.size;
}

function byTimestampThenId(a: HistoryEntry, b: HistoryEntry): number {
  // ISO-8601 timestamps compare lexically as chronological. Desc.
  if (a.timestamp !== b.timestamp) {
    return a.timestamp < b.timestamp ? 1 : -1;
  }
  return a.id.localeCompare(b.id);
}

/**
 * One row in the history list. Carries the entry's title + sender + timestamp,
 * plus optional cross-route metadata lines (status link + documents link).
 * Pure render — no port calls, no state.
 */
export function HistoryEntryItem({ entry }: { entry: HistoryEntry }) {
  const hasStatusLink = typeof entry.applicantStatusRef === 'string' && entry.applicantStatusRef.length > 0;
  const docRefs = entry.documentRefs ?? [];
  const hasDocsLink = docRefs.length > 0;
  return (
    <li className="place-list__item">
      <div className="place-list__row">
        <strong>{entry.title}</strong>
        <span className="place-pill">{labelFromToken(entry.kind)}</span>
      </div>
      <p>{entry.issuer.name}</p>
      <small>{describeTimestamp(entry.kind, entry.timestamp)}</small>
      {hasStatusLink ? (
        <p className="history-list__cross-link">
          <a href={`/status?case=${encodeURIComponent(entry.applicantStatusRef as string)}`}>
            Track this application
          </a>
        </p>
      ) : null}
      {hasDocsLink ? (
        <p className="history-list__cross-link">
          <a href="/documents">
            {docRefs.length === 1 ? '1 saved document' : `${docRefs.length} saved documents`}
          </a>
        </p>
      ) : null}
    </li>
  );
}

function describeTimestamp(kind: HistoryEntryKind, timestamp: string): string {
  const formatted = formatDate(timestamp);
  if (kind === 'draft') return `Last edited ${formatted}`;
  if (kind === 'signed-record') return `Signed ${formatted}`;
  return `Submitted ${formatted}`;
}
