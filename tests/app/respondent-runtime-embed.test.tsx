import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FormDefinition } from '@formspec-org/types';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubEmbedTransport } from '../../src/adapters/stub/embed-transport.ts';
import { unavailablePaymentRailAdapter } from '../../src/adapters/unavailable/payment-rail-adapter.ts';
import { unavailablePreallocatedFeaturePorts } from '../../src/adapters/unavailable/preallocated-feature-port.ts';
import { unavailableScreenerDocumentSource } from '../../src/adapters/unavailable/screener-document-source.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../../src/policy/index.ts';
import {
  CompositeFormRuntimePolicyExtractor,
  EmbeddableExtractor,
} from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import type { Composition } from '../../src/composition/types.ts';

const FORM_URL = 'https://test.example/forms/embed-demo';
const ALLOWED_ORIGIN = 'https://allowed.example.test';
const ATTACKER_ORIGIN = 'https://attacker.example.test';

function embeddableFormDefinition(): FormDefinition {
  return {
    $formspec: '1.0',
    url: FORM_URL,
    version: '1.0.0',
    title: 'Embed Demo',
    items: [
      {
        key: 'observation',
        type: 'field',
        dataType: 'string',
        label: 'Your observation',
      },
    ],
    extensions: {
      'x-formspec-embeddable': true,
    },
  };
}

interface BuildOptions {
  embedded: boolean;
  hostOrigin?: string;
  allowedOrigins: readonly string[];
  formIsEmbeddable?: boolean;
}

function buildComposition(args: BuildOptions): Composition {
  const definition = args.formIsEmbeddable === false
    ? { ...embeddableFormDefinition(), extensions: {} }
    : embeddableFormDefinition();
  const definitionSource = stubDefinitionSource();
  definitionSource.registerDefinition(definition.url, definition, definition.version);
  definitionSource.registerDefinition(definition.url, definition);

  const submitTransport = stubSubmitTransport();
  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'demo-stub',
    status: 'demo-stub',
    documentPresentation: 'unavailable',
    fileUpload: 'demo-stub',
    crossIssuerHistory: 'demo-stub',
    offlineSubmit: 'demo-stub',
    payment: 'unavailable',
    embed: 'demo-stub',
    screener: 'unavailable',
    trustedReviewer: 'unavailable',
    bringYourOwnAssistant: 'unavailable',
    safeAddress: 'unavailable',
    duressAware: 'unavailable',
    multiParty: 'unavailable',
    recordLifecycle: 'unavailable',
  };
  const orgRuntimePolicy: OrgRuntimePolicy = {
    features: {
      respondentPlace: 'allowed',
      status: 'allowed',
      documentPresentation: 'allowed',
      fileUpload: 'allowed',
      crossIssuerHistory: 'allowed',
      offlineSubmit: 'allowed',
      payment: 'allowed',
      embed: 'allowed',
      screener: 'allowed',
    },
    limits: { embed: { allowedOrigins: args.allowedOrigins } },
  };

  return freezeComposition({
    mode: 'demo',
    initialDefinitionUrl: definition.url,
    definitionSource,
    draftStore: stubDraftStore(),
    submitTransport,
    identityProvider: stubIdentityProvider(),
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: stubRespondentPlaceSource(),
    statusReader: stubStatusReader(),
    attachmentStore: stubAttachmentStore(),
    respondentHistorySource: stubRespondentHistorySource(),
    offlineSubmitQueue: stubOfflineSubmitQueue({ transport: submitTransport }),
    paymentRailAdapter: unavailablePaymentRailAdapter(),
    embedTransport: stubEmbedTransport({
      embedded: args.embedded,
      hostOrigin: args.hostOrigin,
    }),
    screenerDocumentSource: unavailableScreenerDocumentSource(),
    ...unavailablePreallocatedFeaturePorts(),
    instanceCapabilities,
    orgRuntimePolicy,
    formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
      new EmbeddableExtractor(),
    ]),
  });
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = undefined;
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
    container = undefined;
  }
});

async function renderRuntime(composition: Composition): Promise<void> {
  await act(async () => {
    root!.render(
      <RespondentRuntime
        composition={composition}
        config={departmentAppProfile}
      />,
    );
  });
  // Wait for the React effect chain to settle (form load, identity boot).
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (
      container?.textContent?.includes('Embed Demo') ||
      container?.textContent?.includes('cannot be loaded') ||
      container?.textContent?.includes('Your observation')
    ) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

describe('RespondentRuntime — iframe-context gate (FW-0040)', () => {
  it('mounts the form when loaded as the top-level window (not embedded)', async () => {
    const composition = buildComposition({
      embedded: false,
      allowedOrigins: [],
    });
    await renderRuntime(composition);
    expect(container?.textContent ?? '').toContain('Your observation');
    expect(container?.textContent ?? '').not.toContain('cannot be loaded');
  });

  it('mounts the form when embedded with an allowed host origin', async () => {
    const composition = buildComposition({
      embedded: true,
      hostOrigin: ALLOWED_ORIGIN,
      allowedOrigins: [ALLOWED_ORIGIN],
    });
    await renderRuntime(composition);
    expect(container?.textContent ?? '').toContain('Your observation');
  });

  it('mounts when embedded with a wildcard allow-list', async () => {
    const composition = buildComposition({
      embedded: true,
      hostOrigin: ATTACKER_ORIGIN,
      allowedOrigins: ['*'],
    });
    await renderRuntime(composition);
    expect(container?.textContent ?? '').toContain('Your observation');
  });

  it('fails-load with the plain-language unavailable copy when embedded with a disallowed origin', async () => {
    const composition = buildComposition({
      embedded: true,
      hostOrigin: ATTACKER_ORIGIN,
      allowedOrigins: [ALLOWED_ORIGIN],
    });
    await renderRuntime(composition);
    expect(container?.textContent ?? '').toContain('cannot be loaded');
    expect(container?.textContent ?? '').toContain(
      'This form is not set up to be shown on this site.',
    );
    expect(container?.textContent ?? '').toContain('Support reference: EmbedOriginNotAllowed');
  });

  it('fails-load with the same copy when embedded but the host origin is unknown (null)', async () => {
    const composition = buildComposition({
      embedded: true,
      allowedOrigins: [ALLOWED_ORIGIN],
    });
    await renderRuntime(composition);
    expect(container?.textContent ?? '').toContain(
      'This form is not set up to be shown on this site.',
    );
  });

  it('mounts when embedded and the form is not embeddable (resolver disables embed; gate no-ops)', async () => {
    const composition = buildComposition({
      embedded: true,
      hostOrigin: ATTACKER_ORIGIN,
      allowedOrigins: [],
      formIsEmbeddable: false,
    });
    await renderRuntime(composition);
    // Form opts out of embed; resolver records 'not-requested' and the gate
    // no-ops because `runtimeProfile.enabled` does not contain 'embed'.
    expect(container?.textContent ?? '').toContain('Your observation');
  });

  it('rendered DOM does not contain internal embed-transport jargon (vocabulary firewall)', async () => {
    const composition = buildComposition({
      embedded: true,
      hostOrigin: ATTACKER_ORIGIN,
      allowedOrigins: [ALLOWED_ORIGIN],
    });
    await renderRuntime(composition);
    const text = container?.textContent ?? '';
    const forbidden = [
      'EmbedTransport',
      'embedTransport',
      'allowedOrigins',
      'hostOrigin',
      'host-handshake',
      'postMessage',
      'iframe',
      'embed-transport',
      'EmbedMessage',
      'EmbedMessageFromHost',
      'Unsubscribe',
      'EmbedLimits',
      'subscribeFromHost',
    ];
    for (const token of forbidden) {
      expect(text).not.toContain(token);
    }
  });
});
