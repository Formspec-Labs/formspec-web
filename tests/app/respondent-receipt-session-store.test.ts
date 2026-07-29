import { describe, expect, it } from 'vitest';
import {
  createBrowserRespondentReceiptSessionStore,
  createMemoryRespondentReceiptSessionStore,
  receiptRecordFromConfirmation,
} from '../../src/verifying-surface/respondent/session-store.ts';

const APP_ID = 'https://example.gov/apps/respondent';
const RELEASE_A = 'sha256:release-a';
const RELEASE_B = 'sha256:release-b';

describe('respondent receipt session store', () => {
  it('persists an actual confirmation for refresh and isolates it by authenticated release', () => {
    const storage = memoryStorage();
    const first = createBrowserRespondentReceiptSessionStore(storage);
    const record = receiptRecordFromConfirmation(
      APP_ID,
      RELEASE_A,
      {
        referenceNumber: 'CASE-204',
        status: 'accepted',
        trackingUri: 'https://status.example.gov/CASE-204',
      },
      '2026-07-28T20:00:00.000Z',
    );

    expect(first.write(record)).toBe('stored');

    const refreshed = createBrowserRespondentReceiptSessionStore(storage);
    expect(refreshed.read(APP_ID, RELEASE_A, 'CASE-204')).toEqual(record);
    expect(refreshed.read(APP_ID, RELEASE_B, 'CASE-204')).toBeUndefined();
  });

  it('turns blocked browser storage into unavailable state without throwing', () => {
    const blocked = {
      getItem(): string | null {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem(): void {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    const store = createBrowserRespondentReceiptSessionStore(blocked);
    const record = receiptRecordFromConfirmation(
      APP_ID,
      RELEASE_A,
      { referenceNumber: 'CASE-205', status: 'accepted' },
      '2026-07-28T20:00:00.000Z',
    );

    expect(store.write(record)).toBe('unavailable');
    expect(store.read(APP_ID, RELEASE_A, 'CASE-205')).toBeUndefined();
  });

  it('never returns a record addressed by another app, release, or case', () => {
    const record = receiptRecordFromConfirmation(
      APP_ID,
      RELEASE_A,
      { referenceNumber: 'CASE-206', status: 'queued' },
      '2026-07-28T20:00:00.000Z',
    );
    const store = createMemoryRespondentReceiptSessionStore([record]);

    expect(store.read(APP_ID, RELEASE_A, 'CASE-206')).toEqual(record);
    expect(store.read('https://other.example/app', RELEASE_A, 'CASE-206')).toBeUndefined();
    expect(store.read(APP_ID, RELEASE_B, 'CASE-206')).toBeUndefined();
    expect(store.read(APP_ID, RELEASE_A, 'CASE-999')).toBeUndefined();
  });
});

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
