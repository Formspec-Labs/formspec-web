import { describe, expect, it } from 'vitest';
import { emptyHistorySnapshot, stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import { demoHistorySnapshot } from '../../src/demo/respondent-history.ts';

describe('stubRespondentHistorySource (FW-0057)', () => {
  it('returns the snapshot it was constructed with', async () => {
    const snapshot = demoHistorySnapshot();
    const adapter = stubRespondentHistorySource(snapshot);
    const found = await adapter.readHistory({ subjectRef: 'respondent:demo' });
    expect(found).toEqual(snapshot);
  });

  it('defaults to an empty snapshot when constructed without args', async () => {
    const adapter = stubRespondentHistorySource();
    const found = await adapter.readHistory({});
    expect(found).toEqual(emptyHistorySnapshot());
  });

  it('returns a fresh copy each call (caller mutation does not leak into the stored snapshot)', async () => {
    const adapter = stubRespondentHistorySource(demoHistorySnapshot());
    const first = await adapter.readHistory({});
    (first as { entries: unknown }).entries = [];
    const second = await adapter.readHistory({});
    expect(second.entries.length).toBeGreaterThan(0);
  });

  it('replaceSnapshot swaps the returned snapshot in place', async () => {
    const adapter = stubRespondentHistorySource();
    adapter.replaceSnapshot(demoHistorySnapshot());
    const found = await adapter.readHistory({});
    expect(found.entries.length).toBeGreaterThan(0);
  });

  it('demo fixture aggregates across two senders (cross-issuer story is honest)', async () => {
    const snapshot = demoHistorySnapshot();
    const senders = new Set(snapshot.entries.map((e) => e.issuer.name));
    expect(senders.size).toBe(2);
  });

  it('demo fixture spans all three closed entry kinds', async () => {
    const snapshot = demoHistorySnapshot();
    const kinds = new Set(snapshot.entries.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['draft', 'submission', 'signed-record']));
  });
});
