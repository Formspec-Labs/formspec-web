import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableEmbedTransport } from '../adapters/unavailable/embed-transport.ts';
import { unavailableLifecycleActionClient } from '../adapters/unavailable/lifecycle-action-client.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import { unavailablePaymentRailAdapter } from '../adapters/unavailable/payment-rail-adapter.ts';
import { unavailableReviewerSession } from '../adapters/unavailable/reviewer-session.ts';
import { unavailableReviewThreadStore } from '../adapters/unavailable/review-thread-store.ts';
import { unavailableSafeAddressDirectory } from '../adapters/unavailable/safe-address-directory.ts';
import { unavailableRespondentHistorySource } from '../adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableScreenerDocumentSource } from '../adapters/unavailable/screener-document-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import { unavailableSurfaceBundleSource } from '../adapters/unavailable/surface-bundle-source.ts';
import { unavailableSurfaceBundleVerifier } from '../adapters/unavailable/surface-bundle-verifier.ts';
import { EmptyFormRuntimePolicyExtractor } from '../adapters/composing/form-runtime-policy-extractor.ts';
import { freezeComposition, RUNTIME_FEATURE_KEYS, type InstanceCapabilities, type OrgRuntimePolicy } from '../policy/index.ts';
import type { Composition } from './types.ts';

/** No resource, identity, feature or sample is selected before admission. */
export function createUnavailableComposition(initialDefinitionUrl: string): Composition {
  const unavailable = async (): Promise<never> => { throw new Error('Composition capability is not configured'); };
  const instanceCapabilities = Object.fromEntries(RUNTIME_FEATURE_KEYS.map(key => [key, 'unavailable'])) as InstanceCapabilities;
  return freezeComposition({
    mode: 'production', initialDefinitionUrl,
    definitionSource: { getDefinition: unavailable },
    draftStore: { load: unavailable, save: unavailable, list: unavailable, delete: unavailable, invalidateSubject: unavailable },
    submitTransport: { submit: unavailable },
    identityProvider: { async discover() { return []; }, authenticate: unavailable, async revoke() {}, subscribe(listener) { listener(null); return () => {}; } },
    attachmentStore: unavailableAttachmentStore(),
    embedTransport: unavailableEmbedTransport(),
    lifecycleActionClient: unavailableLifecycleActionClient(),
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    paymentRailAdapter: unavailablePaymentRailAdapter(),
    reviewerSession: unavailableReviewerSession(),
    reviewThreadStore: unavailableReviewThreadStore(),
    safeAddressDirectory: unavailableSafeAddressDirectory(),
    respondentHistorySource: unavailableRespondentHistorySource(),
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    screenerDocumentSource: unavailableScreenerDocumentSource(),
    statusReader: unavailableStatusReader(),
    surfaceBundleSource: unavailableSurfaceBundleSource(),
    surfaceBundleVerifier: unavailableSurfaceBundleVerifier(),
    instanceCapabilities,
    orgRuntimePolicy: { features: Object.fromEntries(RUNTIME_FEATURE_KEYS.map(key => [key, 'allowed'])) as OrgRuntimePolicy['features'], limits: { embed: { allowedOrigins: [] } } },
    formRuntimePolicyExtractor: new EmptyFormRuntimePolicyExtractor(),
  });
}
