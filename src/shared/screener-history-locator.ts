import type { ScreenerHistoryLocator } from '../ports/screener-retention.ts';

/** Detach the closed deployment locator before authentication or any asynchronous operation. */
export function snapshotScreenerHistoryLocator(value: ScreenerHistoryLocator): Readonly<ScreenerHistoryLocator> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'draftId,evidenceHash,revision,runId'
    || ![value.draftId, value.runId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 2048
      && id.trim() === id && !['.', '..'].includes(id))
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.evidenceHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.evidenceHash)) {
    throw new Error('Source Screener original history locator mismatch');
  }
  return Object.freeze({ draftId: value.draftId, runId: value.runId, revision: value.revision, evidenceHash: value.evidenceHash });
}
