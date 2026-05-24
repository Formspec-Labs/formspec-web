/**
 * Shared documents render helpers (FW-0056 slice 1).
 *
 * Consumed by:
 *   - `RespondentPlacePanel.DocumentItem` inside `RespondentRuntime` (in-form context).
 *   - `DocumentsRuntime` at `/documents` (standalone dashboard).
 *
 * Per design §"Library framing": group by document kind in the closed-taxonomy
 * order from `respondent-place-source.ts`; sort within section by `capturedAt`
 * desc (undefined last); ties broken by `displayName` asc. Empty kinds do not
 * surface as zero-length sections.
 */

import type {
  RespondentDocumentKind,
  RespondentDocumentRecord,
} from '../ports/index.ts';
import { formatDate, labelFromToken } from './format.ts';

/**
 * Closed-taxonomy kind order — mirrors `RespondentDocumentKind` in
 * `respondent-place-source.ts`. Authoritative ordering for grouped rendering.
 * Append-only: future feature ADRs adding a kind extend this list AND the
 * upstream taxonomy together.
 */
export const DOCUMENT_KIND_ORDER: readonly RespondentDocumentKind[] = [
  'identity-proof',
  'income-proof',
  'proof-of-address',
  'proof-of-age',
  'eligibility-evidence',
  'form-attachment',
  'signed-receipt',
  'correspondence',
  'other',
] as const;

export type GroupedDocuments = ReadonlyMap<RespondentDocumentKind, RespondentDocumentRecord[]>;

export function groupAndSortDocuments(
  documents: readonly RespondentDocumentRecord[],
): GroupedDocuments {
  const buckets = new Map<RespondentDocumentKind, RespondentDocumentRecord[]>();
  for (const doc of documents) {
    const list = buckets.get(doc.kind);
    if (list) {
      list.push(doc);
    } else {
      buckets.set(doc.kind, [doc]);
    }
  }
  // Re-emit in the closed-taxonomy order so the iteration order is stable
  // regardless of insertion order.
  const ordered = new Map<RespondentDocumentKind, RespondentDocumentRecord[]>();
  for (const kind of DOCUMENT_KIND_ORDER) {
    const list = buckets.get(kind);
    if (list && list.length > 0) {
      ordered.set(kind, list.slice().sort(byCapturedAtThenDisplayName));
    }
  }
  return ordered;
}

export function uniqueKindCount(documents: readonly RespondentDocumentRecord[]): number {
  const kinds = new Set<RespondentDocumentKind>();
  for (const doc of documents) {
    kinds.add(doc.kind);
  }
  return kinds.size;
}

function byCapturedAtThenDisplayName(
  a: RespondentDocumentRecord,
  b: RespondentDocumentRecord,
): number {
  const aCaptured = a.capturedAt;
  const bCaptured = b.capturedAt;
  if (!aCaptured && bCaptured) return 1;
  if (aCaptured && !bCaptured) return -1;
  if (aCaptured && bCaptured && aCaptured !== bCaptured) {
    // capturedAt is ISO-8601; lexical comparison is chronological. Descending.
    return aCaptured < bCaptured ? 1 : -1;
  }
  return a.displayName.localeCompare(b.displayName);
}

export function DocumentItem({ document }: { document: RespondentDocumentRecord }) {
  return (
    <li className="place-list__item">
      <div className="place-list__row">
        <strong>{document.displayName}</strong>
        <span className="place-pill">{labelFromToken(document.kind)}</span>
      </div>
      <p>{document.issuer?.name ?? document.contentRef.mediaType}</p>
      <small>
        Uploaded {formatDate(document.capturedAt)}
        {document.expiresAt ? ` / Expires ${formatDate(document.expiresAt)}` : ''}
      </small>
    </li>
  );
}
