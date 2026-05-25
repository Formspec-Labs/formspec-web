import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FormDefinition } from '@formspec-org/types';
import {
  PAYMENT_AUTHORIZING_TITLE,
  PAYMENT_CAPTURE_FAILED_TITLE,
  PAYMENT_DEFERRED_CAPABILITY_COPY,
  PAYMENT_RECEIVED_TITLE,
  PAYMENT_REQUIRES_ONLINE_COPY,
  PAYMENT_VOIDED_AFTER_SUBMIT_FAILURE_TITLE,
  RespondentRuntime,
} from '../../src/app/RespondentRuntime.tsx';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import {
  stubPaymentRailAdapter,
  type StubPaymentRailAdapter,
} from '../../src/adapters/stub/payment-rail-adapter.ts';
import { unavailableAttachmentStore } from '../../src/adapters/unavailable/attachment-store.ts';
import { unavailableOfflineSubmitQueue } from '../../src/adapters/unavailable/offline-submit-queue.ts';
import { unavailableEmbedTransport } from '../../src/adapters/unavailable/embed-transport.ts';
import { unavailablePaymentRailAdapter } from '../../src/adapters/unavailable/payment-rail-adapter.ts';
import { unavailablePreallocatedFeaturePorts } from '../../src/adapters/unavailable/preallocated-feature-port.ts';
import { unavailableScreenerDocumentSource } from '../../src/adapters/unavailable/screener-document-source.ts';
import { unavailableRespondentHistorySource } from '../../src/adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../../src/policy/index.ts';
import {
  CompositeFormRuntimePolicyExtractor,
  OfflineSubmitRequirementExtractor,
  PaymentRequirementExtractor,
} from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import type { Composition } from '../../src/composition/types.ts';

const FORM_URL = 'https://test.example/forms/payment-demo';

function paymentRequiredFormDefinition(): FormDefinition {
  return {
    $formspec: '1.0',
    url: FORM_URL,
    version: '1.0.0',
    title: 'Fee-bearing application',
    items: [
      {
        key: 'applicant',
        type: 'field',
        dataType: 'string',
        label: 'Your name',
      },
    ],
    extensions: {
      'x-formspec-payment-required': true,
      'x-formspec-payment-amount': { amountMinorUnits: 4500, currency: 'USD' },
    },
  } as FormDefinition;
}

type CompositionWithStubRail = Composition & {
  paymentRailAdapter: StubPaymentRailAdapter;
};

function buildPaymentComposition(args: {
  paymentAvailable: 'demo-stub' | 'unavailable';
}): CompositionWithStubRail | Composition {
  const definitionSource = stubDefinitionSource();
  const definition = paymentRequiredFormDefinition();
  definitionSource.registerDefinition(definition.url, definition, definition.version);
  definitionSource.registerDefinition(definition.url, definition);
  const submitTransport = stubSubmitTransport();

  const paymentRailAdapter =
    args.paymentAvailable === 'demo-stub'
      ? stubPaymentRailAdapter({ railLabel: 'Card' })
      : unavailablePaymentRailAdapter();

  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'demo-stub',
    status: 'demo-stub',
    documentPresentation: 'unavailable',
    fileUpload: 'demo-stub',
    crossIssuerHistory: 'demo-stub',
    offlineSubmit: 'unavailable',
    payment: args.paymentAvailable,
    // FW-0040 sibling-row coordination: this test does not exercise the
    // embed path; the runtime composition needs the closed-taxonomy key
    // declared for resolver input validity.
    embed: 'unavailable',
    // FW-0046 sibling-row coordination: this test does not exercise the
    // pre-flight screener path; declare 'unavailable' for resolver
    // input validity.
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
    // Pair with declared 'unavailable' offlineSubmit so the coherence
    // assertion accepts the slot regardless of payment availability.
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    paymentRailAdapter,
    // FW-0040 sibling-row coordination: declare the embedTransport slot so
    // the closed-taxonomy contract is satisfied. The fail-closed default
    // never fires because this test never mounts in an iframe.
    embedTransport: unavailableEmbedTransport(),
    // FW-0046: declare the screener slot so the closed-taxonomy contract
    // is satisfied. The runtime never reads it on the in-form payment path.
    screenerDocumentSource: unavailableScreenerDocumentSource(),
    ...unavailablePreallocatedFeaturePorts(),
    instanceCapabilities,
    orgRuntimePolicy,
    formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
      new PaymentRequirementExtractor(),
    ]),
  });
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

async function renderRuntime(
  composition: Composition,
  config = publicPortalProfile,
): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<RespondentRuntime composition={composition} config={config} />);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out\n\nDOM:\n${container?.textContent ?? ''}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function typeApplicant(): Promise<void> {
  const input = container?.querySelector('input[type="text"]') as HTMLInputElement | null;
  if (!input) throw new Error('applicant input not found');
  await act(async () => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, 'Ada Lovelace');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function clickSubmit(): Promise<void> {
  const button = Array.from(container!.querySelectorAll('button')).find(
    (b) => (b.textContent || '').toLowerCase().includes('submit'),
  );
  if (!button) throw new Error('submit button not found');
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('RespondentRuntime payment integration (FW-0027)', () => {
  it('authorizes, submits, and captures on the happy path; renders payment receipt', async () => {
    const composition = buildPaymentComposition({
      paymentAvailable: 'demo-stub',
    }) as CompositionWithStubRail;

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    await typeApplicant();
    await clickSubmit();

    await waitFor(() => (container?.textContent ?? '').includes('Submission received'));
    expect(container?.textContent).toContain(PAYMENT_RECEIVED_TITLE);
    expect(container?.textContent).toContain('$45.00');
    expect(container?.textContent).toContain('Card');
    const states = composition.paymentRailAdapter._internalAuthorizationStates();
    expect([...states.values()][0]?.status).toBe('captured');
  });

  it('voids the authorization and surfaces user-protection copy when submit fails', async () => {
    const composition = buildPaymentComposition({
      paymentAvailable: 'demo-stub',
    }) as CompositionWithStubRail;
    vi.spyOn(composition.submitTransport, 'submit').mockRejectedValueOnce(
      new Error('intake unreachable'),
    );

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    await typeApplicant();
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes(PAYMENT_VOIDED_AFTER_SUBMIT_FAILURE_TITLE));

    const states = composition.paymentRailAdapter._internalAuthorizationStates();
    expect([...states.values()][0]?.status).toBe('voided');
  });

  it('surfaces capture-failed copy that names the reference number when settlement throws', async () => {
    const composition = buildPaymentComposition({
      paymentAvailable: 'demo-stub',
    }) as CompositionWithStubRail;
    composition.paymentRailAdapter.failNextCapture(new Error('settlement service down'));

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    await typeApplicant();
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes(PAYMENT_CAPTURE_FAILED_TITLE));

    // Reference number from stub transport (RECORD-…); the copy must include it.
    expect(container?.textContent ?? '').toMatch(/reference\b/i);
    // FW-0027 M-3: the capture-failed panel carries the deferred-capability
    // reassurance the void-failed panel already has — the user must learn
    // any pending charge will release automatically.
    expect(container?.textContent ?? '').toContain(PAYMENT_DEFERRED_CAPABILITY_COPY);
  });

  it('fails-load with the plain-language unavailable copy when payment is required but instance unavailable', async () => {
    // Composition declares payment 'unavailable' but the form requires it →
    // resolver throws UnsupportedRequiredFeatureError → RuntimePolicyErrorPage.
    // Use demo mode so the auth surface short-circuits (demo identity boots
    // anonymous automatically when no picker is needed). Every gated
    // capability is wired as the unavailable sentinel to satisfy the
    // coherence assertion; the form's payment requirement still drives
    // the resolver throw.
    const definitionSource = stubDefinitionSource();
    const definition = paymentRequiredFormDefinition();
    definitionSource.registerDefinition(definition.url, definition, definition.version);
    definitionSource.registerDefinition(definition.url, definition);
    const composition = freezeComposition({
      mode: 'demo' as const,
      initialDefinitionUrl: definition.url,
      definitionSource,
      draftStore: stubDraftStore(),
      submitTransport: stubSubmitTransport(),
      identityProvider: stubIdentityProvider(),
      notificationDelivery: stubNotificationDelivery(),
      respondentPlaceSource: unavailableRespondentPlaceSource(),
      statusReader: unavailableStatusReader(),
      attachmentStore: unavailableAttachmentStore(),
      respondentHistorySource: unavailableRespondentHistorySource(),
      offlineSubmitQueue: unavailableOfflineSubmitQueue(),
      paymentRailAdapter: unavailablePaymentRailAdapter(),
      // FW-0040 sibling-row coordination: closed-taxonomy slot.
      embedTransport: unavailableEmbedTransport(),
      // FW-0046 sibling-row coordination: closed-taxonomy slot.
      screenerDocumentSource: unavailableScreenerDocumentSource(),
      ...unavailablePreallocatedFeaturePorts(),
      instanceCapabilities: {
        respondentPlace: 'unavailable',
        status: 'unavailable',
        documentPresentation: 'unavailable',
        fileUpload: 'unavailable',
        crossIssuerHistory: 'unavailable',
        offlineSubmit: 'unavailable',
        payment: 'unavailable',
        embed: 'unavailable',
        screener: 'unavailable',
        trustedReviewer: 'unavailable',
        bringYourOwnAssistant: 'unavailable',
        safeAddress: 'unavailable',
        duressAware: 'unavailable',
        multiParty: 'unavailable',
        recordLifecycle: 'unavailable',
      } as InstanceCapabilities,
      orgRuntimePolicy: {
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
      } satisfies OrgRuntimePolicy,
      formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
        new PaymentRequirementExtractor(),
      ]),
    });

    await renderRuntime(composition);
    await waitFor(() => (container?.textContent ?? '').includes('cannot be loaded'));
    expect(container?.textContent).toContain(
      'This form requires payment, but this site is not set up to accept payments.',
    );
    expect(container?.textContent).toContain('UnsupportedRequiredFeature');
  });

  it('vocabulary firewall: rendered DOM has no internal payment-jargon substrings', async () => {
    const composition = buildPaymentComposition({
      paymentAvailable: 'demo-stub',
    }) as CompositionWithStubRail;

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    await typeApplicant();
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes('Submission received'));

    const text = (container?.textContent ?? '').toLowerCase();
    // Spec-internal terms — the user must never see these.
    expect(text).not.toContain('authorize');
    expect(text).not.toContain('voidauthorization');
    expect(text).not.toContain('paymentrailadapter');
    expect(text).not.toContain('methodtoken');
    expect(text).not.toContain('minor units');
    expect(text).not.toContain('idempotency');
    expect(text).not.toContain('uuidv7');
    expect(text).not.toContain('iso-4217');
    expect(text).not.toContain('payment-rail');
  });

  it('FW-0027 M-1: hard-rejects at form load with the unavailable banner when payment-required form loads offline AND offlineSubmit is enabled', async () => {
    // The prior submit-time check let the user fill the entire fee-bearing
    // form offline and learn at Submit time that it could not go through.
    // The hoist puts the gate at form load — the user sees the banner
    // BEFORE filling.
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });
    const definitionSource = stubDefinitionSource();
    // Form opts into BOTH offline-submit AND payment-required so the M-1
    // hard-reject condition (`payment.enabled && offlineSubmit.enabled &&
    // !navigator.onLine`) actually fires.
    const definition: FormDefinition = {
      ...paymentRequiredFormDefinition(),
      extensions: {
        ...paymentRequiredFormDefinition().extensions,
        'x-formspec-offline-submit': true,
      },
    } as FormDefinition;
    definitionSource.registerDefinition(definition.url, definition, definition.version);
    definitionSource.registerDefinition(definition.url, definition);
    const submitTransport = stubSubmitTransport();
    const composition = freezeComposition({
      mode: 'demo' as const,
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
      paymentRailAdapter: stubPaymentRailAdapter({ railLabel: 'Card' }),
      embedTransport: unavailableEmbedTransport(),
      screenerDocumentSource: unavailableScreenerDocumentSource(),
      ...unavailablePreallocatedFeaturePorts(),
      instanceCapabilities: {
        respondentPlace: 'demo-stub',
        status: 'demo-stub',
        documentPresentation: 'unavailable',
        fileUpload: 'demo-stub',
        crossIssuerHistory: 'demo-stub',
        offlineSubmit: 'demo-stub',
        payment: 'demo-stub',
        embed: 'unavailable',
        screener: 'unavailable',
        trustedReviewer: 'unavailable',
        bringYourOwnAssistant: 'unavailable',
        safeAddress: 'unavailable',
        duressAware: 'unavailable',
        multiParty: 'unavailable',
        recordLifecycle: 'unavailable',
      } as InstanceCapabilities,
      orgRuntimePolicy: {
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
      } satisfies OrgRuntimePolicy,
      formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
        new PaymentRequirementExtractor(),
        new OfflineSubmitRequirementExtractor(),
      ]),
    });

    await renderRuntime(composition);
    await waitFor(() => (container?.textContent ?? '').includes('cannot be loaded'));
    expect(container?.textContent).toContain(PAYMENT_REQUIRES_ONLINE_COPY);
    // Typed code lands in the support reference; telemetry-friendly.
    expect(container?.textContent).toContain('PaymentRequiresOnline');
  });

  it('shows the authorizing-payment intermediate state while the rail call is in flight', async () => {
    const composition = buildPaymentComposition({
      paymentAvailable: 'demo-stub',
    }) as CompositionWithStubRail;
    let resolveAuth: ((value: never) => void) | undefined;
    const originalAuthorize = composition.paymentRailAdapter.authorize.bind(
      composition.paymentRailAdapter,
    );
    vi.spyOn(composition.paymentRailAdapter, 'authorize').mockImplementation(
      async (amount, methodToken, key) => {
        await new Promise<never>((resolve) => {
          resolveAuth = resolve as (value: never) => void;
        });
        return originalAuthorize(amount, methodToken, key);
      },
    );

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    await typeApplicant();
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes(PAYMENT_AUTHORIZING_TITLE));

    expect(container?.textContent).toContain('$45.00 pending');
    expect(container?.textContent).toContain("You haven't been charged yet.");
    // Wait until the spy actually entered the in-flight Promise (which is
    // when `resolveAuth` becomes set). The "Authorizing payment…" panel
    // renders before `submitWithPayment` awaits the three rail-key
    // derivations (FW-0027 H-1+H-2 deterministic-derivation pushed the
    // rail call past the panel render), so the panel visibility no longer
    // co-implies the rail call is in flight.
    await waitFor(() => resolveAuth !== undefined);
    resolveAuth?.(undefined as never);
    await waitFor(() => (container?.textContent ?? '').includes('Submission received'));
  });
});
