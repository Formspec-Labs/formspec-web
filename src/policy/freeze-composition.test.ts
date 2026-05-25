import { describe, expect, it } from 'vitest';
import { freezeComposition, CompositionIncoherenceError } from './composition-coherence.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableEmbedTransport } from '../adapters/unavailable/embed-transport.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import { unavailablePaymentRailAdapter } from '../adapters/unavailable/payment-rail-adapter.ts';
import { unavailableRespondentHistorySource } from '../adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { stubAttachmentStore } from '../adapters/stub/attachment-store.ts';
import { stubEmbedTransport } from '../adapters/stub/embed-transport.ts';
import { stubOfflineSubmitQueue } from '../adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../adapters/stub/payment-rail-adapter.ts';
import { stubRespondentHistorySource } from '../adapters/stub/respondent-history-source.ts';
import { stubRespondentPlaceSource } from '../adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../adapters/stub/submit-transport.ts';

describe('freezeComposition — boot-time funnel for composition-coherence', () => {
  it('returns the same reference when the composition is coherent', () => {
    const composition = {
      mode: 'demo' as const,
      instanceCapabilities: {
        respondentPlace: 'demo-stub',
        status: 'demo-stub',
        // FW-0056 design line 121 + arch-review MED-1: no demo VP stack;
        // documentPresentation 'unavailable' opts out of the shared
        // respondentPlaceSource slot, so the demo-stub place adapter
        // satisfies only the respondentPlace key.
        documentPresentation: 'unavailable',
        fileUpload: 'demo-stub',
        crossIssuerHistory: 'demo-stub',
        offlineSubmit: 'demo-stub',
        payment: 'demo-stub',
        embed: 'demo-stub',
      } as const,
      respondentPlaceSource: stubRespondentPlaceSource(),
      statusReader: stubStatusReader(),
      attachmentStore: stubAttachmentStore(),
      respondentHistorySource: stubRespondentHistorySource(),
      offlineSubmitQueue: stubOfflineSubmitQueue({ transport: stubSubmitTransport() }),
      paymentRailAdapter: stubPaymentRailAdapter(),
      embedTransport: stubEmbedTransport(),
    };
    expect(freezeComposition(composition)).toBe(composition);
  });

  it('throws CompositionIncoherenceError when production composition wires a demo-stub', () => {
    const composition = {
      mode: 'production' as const,
      instanceCapabilities: {
        respondentPlace: 'unavailable',
        status: 'available',
        documentPresentation: 'unavailable',
        fileUpload: 'unavailable',
        crossIssuerHistory: 'unavailable',
        offlineSubmit: 'unavailable',
        payment: 'unavailable',
        embed: 'unavailable',
      } as const,
      respondentPlaceSource: unavailableRespondentPlaceSource(),
      statusReader: stubStatusReader(),
      attachmentStore: unavailableAttachmentStore(),
      respondentHistorySource: unavailableRespondentHistorySource(),
      offlineSubmitQueue: unavailableOfflineSubmitQueue(),
      paymentRailAdapter: unavailablePaymentRailAdapter(),
      embedTransport: unavailableEmbedTransport(),
    };
    expect(() => freezeComposition(composition)).toThrow(CompositionIncoherenceError);
  });
});
