/**
 * Structural validation for `HistorySnapshot` shapes consumed by the
 * RespondentHistorySource port (FW-0057). Used by the stub adapter to validate
 * fixture data and by the conformance suite's type guard.
 *
 * The check is intentionally structural — it mirrors the closed-set
 * constraints documented on the port interface without re-encoding a full
 * JSON Schema (web ADR-0004 §"consume primitives" — formspec-web does not
 * invent schemas where shape can be enforced at the port boundary).
 */
import type {
  HistoryEntry,
  HistoryEntryKind,
  HistorySnapshot,
} from '../ports/respondent-history-source.ts';

const HISTORY_ENTRY_KINDS: ReadonlySet<HistoryEntryKind> = new Set<HistoryEntryKind>([
  'draft',
  'submission',
  'signed-record',
]);

export function isHistorySnapshot(value: unknown): value is HistorySnapshot {
  if (!isObject(value)) return false;
  if ((value as { $formspecRespondentHistory?: unknown }).$formspecRespondentHistory !== '1.0') {
    return false;
  }
  if ((value as { aggregationMode?: unknown }).aggregationMode !== 'client-wallet') {
    return false;
  }
  if (typeof (value as { subjectRef?: unknown }).subjectRef !== 'string') return false;
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    if (!isHistoryEntry(entry)) return false;
  }
  return true;
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isObject(value)) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string') return false;
  if (typeof entry.kind !== 'string' || !HISTORY_ENTRY_KINDS.has(entry.kind as HistoryEntryKind)) {
    return false;
  }
  if (typeof entry.timestamp !== 'string') return false;
  if (typeof entry.title !== 'string') return false;
  if (!isObject(entry.issuer)) return false;
  const issuer = entry.issuer as Record<string, unknown>;
  if (typeof issuer.name !== 'string') return false;
  if (issuer.url !== undefined && typeof issuer.url !== 'string') return false;
  if (issuer.identifier !== undefined && typeof issuer.identifier !== 'string') return false;
  if (entry.applicantStatusRef !== undefined && typeof entry.applicantStatusRef !== 'string') {
    return false;
  }
  if (entry.receiptRef !== undefined && typeof entry.receiptRef !== 'string') return false;
  if (entry.documentRefs !== undefined) {
    if (!Array.isArray(entry.documentRefs)) return false;
    for (const ref of entry.documentRefs) {
      if (typeof ref !== 'string') return false;
    }
  }
  if (entry.definitionRef !== undefined) {
    if (!isObject(entry.definitionRef)) return false;
    const def = entry.definitionRef as Record<string, unknown>;
    if (typeof def.url !== 'string') return false;
    if (def.version !== undefined && typeof def.version !== 'string') return false;
  }
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
