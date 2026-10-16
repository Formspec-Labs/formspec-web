import type { FormDefinition } from '@formspec-org/types';
import { createUnavailableComposition } from '../../src/composition/unavailable.ts';
import { freezeComposition } from '../../src/policy/index.ts';
import type { Composition } from '../../src/composition/types.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../../src/adapters/stub/payment-rail-adapter.ts';
import { stubEmbedTransport } from '../../src/adapters/stub/embed-transport.ts';
import { stubScreenerDocumentSource } from '../../src/adapters/stub/screener-document-source.ts';
import { stubSafeAddressDirectory } from '../../src/adapters/stub/safe-address-directory.ts';
import { stubLifecycleActionClient } from '../../src/adapters/stub/lifecycle-action-client.ts';

export const testDefinition: FormDefinition = { $formspec: '1.0', url: 'urn:test:form', version: '1.0.0', title: 'Test form',
  items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Answer' }] };

/** Test-owned empty ports. Each scenario supplies its own resources and policy. */
export function createTestComposition(options: Partial<Composition> & { definition?: FormDefinition } = {}): Composition {
  const { definition, ...overrides } = options;
  const base = createUnavailableComposition(definition?.url ?? 'urn:test:no-form');
  const definitionSource = stubDefinitionSource();
  if (definition) {
    definitionSource.registerDefinition(definition.url, definition, definition.version);
    definitionSource.registerDefinition(definition.url, definition);
  }
  const submitTransport = stubSubmitTransport();
  return freezeComposition({
    ...base, mode: 'demo',
    definitionSource, draftStore: stubDraftStore(),
    identityProvider: stubIdentityProvider(), submitTransport,
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: stubRespondentPlaceSource(), statusReader: stubStatusReader(),
    attachmentStore: stubAttachmentStore(), respondentHistorySource: stubRespondentHistorySource(),
    offlineSubmitQueue: stubOfflineSubmitQueue({ transport: submitTransport }),
    paymentRailAdapter: stubPaymentRailAdapter(), embedTransport: stubEmbedTransport({ embedded: false }),
    screenerDocumentSource: stubScreenerDocumentSource(),
    safeAddressDirectory: stubSafeAddressDirectory(), lifecycleActionClient: stubLifecycleActionClient(),
    instanceCapabilities: { ...base.instanceCapabilities,
      respondentPlace: 'demo-stub', status: 'demo-stub', fileUpload: 'demo-stub',
      crossIssuerHistory: 'demo-stub', offlineSubmit: 'demo-stub', payment: 'demo-stub',
      embed: 'demo-stub', screener: 'demo-stub', trustedReviewer: 'unavailable',
      safeAddress: 'demo-stub', recordLifecycle: 'demo-stub',
    },
    ...overrides,
  });
}
