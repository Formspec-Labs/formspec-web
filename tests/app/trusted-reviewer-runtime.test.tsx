import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import type { FormDefinition } from '@formspec-org/types';
import { ReviewerRuntime } from '../../src/app/ReviewerRuntime.tsx';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { verifierReviewCapacityLine } from '../../src/app/trusted-reviewer.ts';
import { TrustedReviewerPolicyExtractor } from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubEmbedTransport } from '../../src/adapters/stub/embed-transport.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../../src/adapters/stub/payment-rail-adapter.ts';
import { stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { createStubTrustedReviewerAdapters } from '../../src/adapters/stub/review-thread-store.ts';
import { unavailablePreallocatedFeaturePorts } from '../../src/adapters/unavailable/preallocated-feature-port.ts';
import { unavailableScreenerDocumentSource } from '../../src/adapters/unavailable/screener-document-source.ts';
import type { Composition } from '../../src/composition/types.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../../src/policy/index.ts';
import { respondentSessionToken } from '../../src/ports/reviewer-session.ts';
import type { ReviewThreadPolicySnapshot } from '../../src/ports/review-thread-store.ts';

const REVIEW_FORM_URL = 'https://test.example/forms/reviewable';

function reviewableForm(): FormDefinition {
  return {
    $formspec: '1.0',
    url: REVIEW_FORM_URL,
    version: '1.0.0',
    title: 'Reviewable Form',
    items: [
      { key: 'fullName', type: 'field', dataType: 'string', label: 'Full name' },
    ],
    extensions: {
      'x-formspec-trusted-reviewer': {
        posture: 'suggest-allowed',
        maxActiveSharesPerDraft: 2,
        respondentOnlyFieldPointers: ['/data/protectedAddress'],
      },
    },
  } as FormDefinition;
}

function buildComposition(): Composition {
  const definition = reviewableForm();
  const definitionSource = stubDefinitionSource();
  definitionSource.registerDefinition(definition.url, definition, definition.version);
  definitionSource.registerDefinition(definition.url, definition);
  const submitTransport = stubSubmitTransport();
  const trustedReviewer = createStubTrustedReviewerAdapters({
    baseUrl: 'https://review.example.test',
  });
  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'demo-stub',
    status: 'demo-stub',
    documentPresentation: 'unavailable',
    fileUpload: 'demo-stub',
    crossIssuerHistory: 'demo-stub',
    offlineSubmit: 'demo-stub',
    payment: 'demo-stub',
    embed: 'demo-stub',
    screener: 'unavailable',
    trustedReviewer: 'demo-stub',
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
      trustedReviewer: 'allowed',
      bringYourOwnAssistant: 'allowed',
      safeAddress: 'allowed',
      duressAware: 'allowed',
      multiParty: 'allowed',
      recordLifecycle: 'allowed',
    },
    limits: { embed: { allowedOrigins: [] } },
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
    paymentRailAdapter: stubPaymentRailAdapter(),
    embedTransport: stubEmbedTransport({ embedded: false }),
    screenerDocumentSource: unavailableScreenerDocumentSource(),
    ...unavailablePreallocatedFeaturePorts(),
    ...trustedReviewer,
    instanceCapabilities,
    orgRuntimePolicy,
    formRuntimePolicyExtractor: new TrustedReviewerPolicyExtractor(),
  });
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('trusted reviewer runtime surfaces', () => {
  it('respondent can mint and revoke a reviewer link when trustedReviewer resolves on', async () => {
    const composition = buildComposition();
    await renderRespondent(composition);
    await waitForText('Share this draft');

    await clickButton('Create reviewer link');
    await waitForText('Revoke');
    const reviewerLink = container?.querySelector<HTMLInputElement>(
      'input[aria-label="Reviewer link"]',
    )?.value;
    expect(reviewerLink).toContain('/r/');

    await clickButton('Revoke');
    await waitForText('revoked');
  });

  it('reviewer shell renders comment/suggestion controls without submit or sign buttons', async () => {
    const composition = buildComposition();
    const policySnapshot: ReviewThreadPolicySnapshot = {
      posture: 'suggest-allowed',
      respondentOnlyFieldPointers: ['/data/protectedAddress'],
      reviewerSessionBindingRef: 'composition:reviewerSession',
      reviewThreadStoreBindingRef: 'composition:reviewThreadStore',
    };
    await composition.reviewThreadStore.ensureThread({
      threadId: 'review-thread:test',
      draftRef: { formUrl: REVIEW_FORM_URL },
      policySnapshot,
    });
    const minted = await composition.reviewerSession.mintShare({
      threadId: 'review-thread:test',
      requestedScope: 'view+comment+suggest',
      respondentSessionToken: respondentSessionToken('test'),
    });

    await renderReviewer(composition, minted.capabilityUrl);
    await waitForText('Review draft');
    expect(buttonLabels()).toContain('Add comment');
    expect(buttonLabels()).toContain('Add suggestion');
    expect(buttonLabels()).not.toContain('Submit');
    expect(buttonLabels()).not.toContain('Sign');

    const comment = container?.querySelector<HTMLTextAreaElement>('textarea');
    if (!comment) throw new Error('comment textarea not found');
    await act(async () => {
      fireEvent.change(comment, { target: { value: 'Check this field.' } });
      await tick();
    });
    await clickButton('Add comment');
    await waitForText('Review saved');
    const thread = await composition.reviewThreadStore.read({ threadId: 'review-thread:test' });
    expect(thread.events.some((event) => event.payload.type === 'comment-added')).toBe(true);
  });

  it('verifier capacity copy is silent until reviewer trace is attached', () => {
    expect(verifierReviewCapacityLine({ signerName: 'Jordan' })).toBe('signed by Jordan');
    expect(verifierReviewCapacityLine({ signerName: 'Jordan', reviewerCount: 2 }))
      .toBe('signed by Jordan · reviewed by 2 parties before signing');
  });
});

async function renderRespondent(composition: Composition): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<RespondentRuntime composition={composition} config={publicPortalProfile} />);
    await tick();
  });
}

async function renderReviewer(composition: Composition, capabilityUrl: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ReviewerRuntime
        composition={composition}
        config={publicPortalProfile}
        route={{ threadId: 'review-thread:test', capabilityUrl }}
      />,
    );
    await tick();
  });
}

async function clickButton(label: string): Promise<void> {
  const button = Array.from(container?.querySelectorAll('button') ?? [])
    .find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`button not found: ${label}`);
  await act(async () => {
    button.click();
    await tick();
  });
}

async function waitForText(expected: string, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (!(container?.textContent ?? '').includes(expected)) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for ${expected}\n\n${container?.textContent ?? ''}`);
    }
    await act(async () => {
      await tick();
    });
  }
}

function buttonLabels(): string[] {
  return Array.from(container?.querySelectorAll('button') ?? [])
    .map((button) => button.textContent ?? '');
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
