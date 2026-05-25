import { describe, expect, it } from 'vitest';
import { unavailableAttachmentStore } from '../../src/adapters/unavailable/attachment-store.ts';
import { unavailableEmbedTransport } from '../../src/adapters/unavailable/embed-transport.ts';
import { unavailableOfflineSubmitQueue } from '../../src/adapters/unavailable/offline-submit-queue.ts';
import { unavailablePaymentRailAdapter } from '../../src/adapters/unavailable/payment-rail-adapter.ts';
import { unavailableRespondentHistorySource } from '../../src/adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';
import {
  samplePaymentAmount,
  samplePaymentMethodToken,
} from '../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { isUnavailableAdapter, UNAVAILABLE_ADAPTER } from '../../src/policy/sentinel.ts';

describe('unavailable adapters carry the policy sentinel marker', () => {
  it('unavailableRespondentPlaceSource is marked with featureKey "respondentPlace"', () => {
    const adapter = unavailableRespondentPlaceSource();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('respondentPlace');
  });

  it('unavailableStatusReader is marked with featureKey "status"', () => {
    const adapter = unavailableStatusReader();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('status');
  });

  it('unavailableAttachmentStore is marked with featureKey "fileUpload"', () => {
    const adapter = unavailableAttachmentStore();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('fileUpload');
  });

  it('unavailableRespondentHistorySource is marked with featureKey "crossIssuerHistory"', () => {
    const adapter = unavailableRespondentHistorySource();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('crossIssuerHistory');
  });

  it('unavailableOfflineSubmitQueue is marked with featureKey "offlineSubmit"', () => {
    const adapter = unavailableOfflineSubmitQueue();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('offlineSubmit');
  });

  it('unavailablePaymentRailAdapter is marked with featureKey "payment"', () => {
    const adapter = unavailablePaymentRailAdapter();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('payment');
  });

  it('unavailableEmbedTransport is marked with featureKey "embed"', () => {
    const adapter = unavailableEmbedTransport();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('embed');
  });

  it('marked adapters still throw on call (sentinel does not change runtime behavior)', async () => {
    await expect(unavailableRespondentPlaceSource().readPlace({} as never)).rejects.toThrow();
    await expect(
      unavailableStatusReader().readStatus({ subjectRef: 'x', submissionId: 'y' } as never),
    ).rejects.toThrow();
    await expect(
      unavailableAttachmentStore().upload(new Blob(['x']), { filename: 'x', mimeType: 'text/plain' }),
    ).rejects.toThrow();
    await expect(unavailableRespondentHistorySource().readHistory({})).rejects.toThrow();
    await expect(unavailableOfflineSubmitQueue().replay()).rejects.toThrow();
    await expect(
      unavailablePaymentRailAdapter().authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      ),
    ).rejects.toThrow();
    expect(() =>
      unavailableEmbedTransport().postMessage(
        { kind: 'host-handshake', hostOrigin: 'https://allowed.example.test' },
        'https://allowed.example.test',
      ),
    ).toThrow();
  });
});
