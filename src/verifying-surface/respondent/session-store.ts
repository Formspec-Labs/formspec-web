import type { SubmitConfirmation } from '../../ports/submit-transport.ts';

const STORAGE_PREFIX = 'formspec-web:respondent-receipt:v1';

export interface RespondentReceiptRecord {
  readonly appId: string;
  /** Release-qualified snapshot identity; confines this mutable confirmation copy. */
  readonly releaseIdentity: string;
  readonly caseRef: string;
  readonly submittedAt: string;
  readonly confirmation: SubmitConfirmation;
}

export interface RespondentReceiptSessionStore {
  read(
    appId: string,
    releaseIdentity: string,
    caseRef: string,
  ): RespondentReceiptRecord | undefined;
  write(record: RespondentReceiptRecord): 'stored' | 'unavailable';
}

export function createBrowserRespondentReceiptSessionStore(
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): RespondentReceiptSessionStore {
  return {
    read(appId, releaseIdentity, caseRef) {
      try {
        const activeStorage = storage ?? window.sessionStorage;
        const raw = activeStorage.getItem(storageKey(appId, releaseIdentity, caseRef));
        if (raw === null) return undefined;
        return parseReceiptRecord(JSON.parse(raw), appId, releaseIdentity, caseRef);
      } catch {
        return undefined;
      }
    },
    write(record) {
      try {
        const activeStorage = storage ?? window.sessionStorage;
        assertReceiptRecord(
          record,
          record.appId,
          record.releaseIdentity,
          record.caseRef,
        );
        activeStorage.setItem(
          storageKey(record.appId, record.releaseIdentity, record.caseRef),
          JSON.stringify(record),
        );
        return 'stored';
      } catch {
        return 'unavailable';
      }
    },
  };
}

export function createMemoryRespondentReceiptSessionStore(
  seed: readonly RespondentReceiptRecord[] = [],
): RespondentReceiptSessionStore {
  const records = new Map<string, RespondentReceiptRecord>();
  for (const record of seed) {
    assertReceiptRecord(record, record.appId, record.releaseIdentity, record.caseRef);
    records.set(
      storageKey(record.appId, record.releaseIdentity, record.caseRef),
      freezeReceiptRecord(record),
    );
  }
  return {
    read(appId, releaseIdentity, caseRef) {
      return records.get(storageKey(appId, releaseIdentity, caseRef));
    },
    write(record) {
      assertReceiptRecord(record, record.appId, record.releaseIdentity, record.caseRef);
      records.set(
        storageKey(record.appId, record.releaseIdentity, record.caseRef),
        freezeReceiptRecord(record),
      );
      return 'stored';
    },
  };
}

export function receiptRecordFromConfirmation(
  appId: string,
  releaseIdentity: string,
  confirmation: SubmitConfirmation,
  submittedAt = new Date().toISOString(),
): RespondentReceiptRecord {
  const record = {
    appId,
    releaseIdentity,
    caseRef: confirmation.referenceNumber,
    submittedAt,
    confirmation: {
      referenceNumber: confirmation.referenceNumber,
      status: confirmation.status,
      ...(confirmation.trackingUri ? { trackingUri: confirmation.trackingUri } : {}),
      ...(confirmation.caseUrn ? { caseUrn: confirmation.caseUrn } : {}),
    },
  } satisfies RespondentReceiptRecord;
  assertReceiptRecord(record, appId, releaseIdentity, confirmation.referenceNumber);
  return freezeReceiptRecord(record);
}

function parseReceiptRecord(
  value: unknown,
  expectedAppId: string,
  expectedReleaseIdentity: string,
  expectedCaseRef: string,
): RespondentReceiptRecord | undefined {
  try {
    assertReceiptRecord(value, expectedAppId, expectedReleaseIdentity, expectedCaseRef);
    return freezeReceiptRecord(value);
  } catch {
    return undefined;
  }
}

function assertReceiptRecord(
  value: unknown,
  expectedAppId: string,
  expectedReleaseIdentity: string,
  expectedCaseRef: string,
): asserts value is RespondentReceiptRecord {
  if (!isRecord(value)) throw new Error('Receipt session record must be an object.');
  if (
    value.appId !== expectedAppId
    || value.releaseIdentity !== expectedReleaseIdentity
    || value.caseRef !== expectedCaseRef
  ) {
    throw new Error('Receipt session record identity does not match its storage address.');
  }
  if (
    typeof value.submittedAt !== 'string'
    || !Number.isFinite(Date.parse(value.submittedAt))
    || !isSubmitConfirmation(value.confirmation)
    || value.confirmation.referenceNumber !== expectedCaseRef
  ) {
    throw new Error('Receipt session record is malformed.');
  }
}

function isSubmitConfirmation(value: unknown): value is SubmitConfirmation {
  if (!isRecord(value)) return false;
  if (
    typeof value.referenceNumber !== 'string'
    || value.referenceNumber.length === 0
    || (value.status !== 'accepted' && value.status !== 'queued' && value.status !== 'rejected')
  ) {
    return false;
  }
  if (value.trackingUri !== undefined && typeof value.trackingUri !== 'string') return false;
  return value.caseUrn === undefined || typeof value.caseUrn === 'string';
}

function freezeReceiptRecord(record: RespondentReceiptRecord): RespondentReceiptRecord {
  return Object.freeze({
    ...record,
    confirmation: Object.freeze({ ...record.confirmation }),
  });
}

function storageKey(appId: string, releaseIdentity: string, caseRef: string): string {
  return [
    STORAGE_PREFIX,
    encodeURIComponent(appId),
    encodeURIComponent(releaseIdentity),
    encodeURIComponent(caseRef),
  ].join(':');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
