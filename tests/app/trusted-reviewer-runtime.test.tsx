import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import type {
  FormDefinition,
  FormResponse,
} from '@formspec-org/types';
import { ReviewerRuntime } from '../../src/app/ReviewerRuntime.tsx';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import {
  reviewerDraftSnapshotForResponse,
  reviewerDraftRefForDraft,
  reviewerThreadIdForDraft,
  trustedReviewerPolicySnapshot,
  verifierReviewCapacityLine,
} from '../../src/app/trusted-reviewer.ts';
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
  resolveRuntimeFeatures,
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
      { key: 'protectedAddress', type: 'field', dataType: 'string', label: 'Protected address' },
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
    preparerFiling: 'unavailable',
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
      preparerFiling: 'allowed',
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

  it('respondent can revoke all active reviewer links with one gesture', async () => {
    const composition = buildComposition();
    await renderRespondent(composition);
    await waitForText('Share this draft');
    await clickButton('Create reviewer link');
    await waitForButtonCount('Revoke', 1);
    await clickButton('Create reviewer link');
    await waitForButtonCount('Revoke', 2);
    const threadId = latestReviewerThreadId();

    await waitForText('Stop sharing with everyone');
    await clickButton('Stop sharing with everyone');
    await waitForText('revoked');
    const thread = await composition.reviewThreadStore.read({
      threadId,
      sessionToken: respondentTokenForThread(threadId),
    });
    expect(thread.shares.every((share) => share.revokedAt)).toBe(true);
    expect(thread.events.filter((event) => (
      event.payload.type === 'share-revoked'
      && event.payload.reason === 'respondent panic revoked'
    ))).toHaveLength(2);
  });

  it('reviewer shell renders draft field context and anchors comments without submit or sign buttons', async () => {
    const composition = buildComposition();
    const policySnapshot: ReviewThreadPolicySnapshot = {
      posture: 'suggest-allowed',
      respondentOnlyFieldPointers: ['/data/protectedAddress'],
      reviewerSessionBindingRef: 'composition:reviewerSession',
      reviewThreadStoreBindingRef: 'composition:reviewThreadStore',
    };
    const response = reviewResponse({ fullName: 'Grace Hopper', protectedAddress: 'Hidden home' });
    const draftSnapshot = await reviewerDraftSnapshotForResponse({
      definition: reviewableForm(),
      policySnapshot,
      response,
    });
    await composition.reviewThreadStore.ensureThread({
      threadId: 'review-thread:test',
      draftRef: { formUrl: REVIEW_FORM_URL },
      draftSnapshot,
      policySnapshot,
    });
    const minted = await composition.reviewerSession.mintShare({
      threadId: 'review-thread:test',
      requestedScope: 'view+comment+suggest',
      respondentSessionToken: respondentTokenForThread('review-thread:test'),
    });

    await renderReviewer(composition, minted.capabilityUrl);
    await waitForText('Review draft');
    await waitForText('Grace Hopper');
    expect(container?.textContent).toContain('Full name');
    expect(container?.textContent).not.toContain('Hidden home');
    expect(container?.textContent).not.toContain('signed by respondent');
    expect(buttonLabels()).toContain('Add comment');
    expect(buttonLabels()).toContain('Add suggestion');
    expect(buttonLabels()).not.toContain('Submit');
    expect(buttonLabels()).not.toContain('Sign');

    const fieldSelector = container?.querySelector<HTMLSelectElement>('select');
    if (!fieldSelector) throw new Error('field selector not found');
    expect(Array.from(fieldSelector.options).map((option) => option.textContent))
      .toEqual(['Full name', 'Protected address']);

    const comment = container?.querySelector<HTMLTextAreaElement>('textarea');
    if (!comment) throw new Error('comment textarea not found');
    await act(async () => {
      fireEvent.change(comment, { target: { value: 'Check this field.' } });
      await tick();
    });
    await clickButton('Add comment');
    await waitForText('Review saved');
    const thread = await composition.reviewThreadStore.read({
      threadId: 'review-thread:test',
      sessionToken: respondentTokenForThread('review-thread:test'),
    });
    const commentEvent = thread.events.find((event) => event.payload.type === 'comment-added');
    expect(commentEvent?.payload.type).toBe('comment-added');
    if (commentEvent?.payload.type !== 'comment-added') throw new Error('comment event not found');
    expect(commentEvent.payload.anchor.fieldPointer).toBe('/data/fullName');
    expect(commentEvent.payload.anchor.valueHashAtAnchor).toBe(
      draftSnapshot.fields.find((field) => field.fieldPointer === '/data/fullName')?.valueHashAtSnapshot,
    );

    await act(async () => {
      fireEvent.change(fieldSelector, { target: { value: '/data/protectedAddress' } });
      await tick();
    });
    expect(container?.textContent).toContain('Respondent-only field. Value hidden from reviewers.');
    expect(buttonLabels()).not.toContain('Add suggestion');
  });

  it('reviewer shell hides suggestions for comment-only grants', async () => {
    const composition = buildComposition();
    const policySnapshot: ReviewThreadPolicySnapshot = {
      posture: 'suggest-allowed',
      respondentOnlyFieldPointers: [],
      reviewerSessionBindingRef: 'composition:reviewerSession',
      reviewThreadStoreBindingRef: 'composition:reviewThreadStore',
    };
    await composition.reviewThreadStore.ensureThread({
      threadId: 'review-thread:comment-only',
      draftRef: { formUrl: REVIEW_FORM_URL },
      draftSnapshot: await reviewerDraftSnapshotForResponse({
        definition: reviewableForm(),
        policySnapshot,
        response: reviewResponse({ fullName: 'Ada Lovelace' }),
      }),
      policySnapshot,
    });
    const minted = await composition.reviewerSession.mintShare({
      threadId: 'review-thread:comment-only',
      requestedScope: 'view+comment',
      respondentSessionToken: respondentTokenForThread('review-thread:comment-only'),
    });

    await renderReviewer(composition, minted.capabilityUrl, 'review-thread:comment-only');
    await waitForText('Ada Lovelace');
    expect(buttonLabels()).toContain('Add comment');
    expect(buttonLabels()).not.toContain('Add suggestion');
  });

  it('scopes review threads and draft refs by multi-party partyRef', () => {
    const base = {
      formUrl: REVIEW_FORM_URL,
      formVersion: '1.0.0',
      subjectRef: 'subject:demo',
    };

    expect(reviewerThreadIdForDraft({ ...base, partyRef: 'party-a' }))
      .not.toBe(reviewerThreadIdForDraft({ ...base, partyRef: 'party-b' }));
    expect(reviewerDraftRefForDraft({ ...base, partyRef: 'party-a' }).partyRef)
      .toBe('party-a');
  });

  it('auto-masks safe-address fields from reviewer snapshots without duplicated reviewer policy', async () => {
    const profile = resolveRuntimeFeatures({
      mode: 'demo',
      instance: {
        ...allUnavailableCapabilities(),
        safeAddress: 'demo-stub',
        trustedReviewer: 'demo-stub',
        preparerFiling: 'unavailable',
      },
      org: {
        features: {
          ...allAllowedFeatures(),
          safeAddress: 'allowed',
          trustedReviewer: 'allowed',
          preparerFiling: 'allowed',
        },
        limits: {
          safeAddress: {
            enabledClasses: ['safe-address'],
            acpJurisdictionsAccepted: ['CA-ACP'],
            authorizedAudiences: ['issuer-verification'],
            receiptPostureTier: 'phase-1-fallback',
          },
        },
      },
      form: {
        features: {
          safeAddress: 'required',
          trustedReviewer: 'optional',
        },
        limits: {
          safeAddress: {
            fields: [{ path: '/protectedAddress', accessClass: 'safe-address' }],
          },
          trustedReviewer: {
            posture: 'suggest-allowed',
            respondentOnlyFieldPointers: [],
          },
        },
      },
    });
    const policySnapshot = trustedReviewerPolicySnapshot(profile);
    expect(policySnapshot?.respondentOnlyFieldPointers).toContain('/data/protectedAddress');
    if (!policySnapshot) throw new Error('trusted reviewer policy missing');

    const draftSnapshot = await reviewerDraftSnapshotForResponse({
      definition: reviewableForm(),
      policySnapshot,
      response: reviewResponse({ fullName: 'Ada Lovelace', protectedAddress: 'Hidden home' }),
    });

    const protectedField = draftSnapshot.fields.find((field) => (
      field.fieldPointer === '/data/protectedAddress'
    ));
    expect(protectedField?.respondentOnly).toBe(true);
    expect(protectedField).not.toHaveProperty('value');
  });

  it('verifier capacity copy is silent until reviewer trace is attached', () => {
    expect(verifierReviewCapacityLine({ signerName: 'Jordan' })).toBe('signed by Jordan');
    expect(verifierReviewCapacityLine({ signerName: 'Jordan', reviewerCount: 2 }))
      .toBe('signed by Jordan');
    expect(verifierReviewCapacityLine({
      signerName: 'Jordan',
      reviewerCount: 2,
      reviewerTraceAttached: true,
    }))
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

async function renderReviewer(
  composition: Composition,
  capabilityUrl: string,
  threadId = 'review-thread:test',
): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ReviewerRuntime
        composition={composition}
        config={publicPortalProfile}
        route={{ threadId, capabilityUrl }}
      />,
    );
    await tick();
  });
}

function reviewResponse(data: Record<string, unknown>): FormResponse {
  return {
    $formspecResponse: '1.0',
    definitionUrl: REVIEW_FORM_URL,
    definitionVersion: '1.0.0',
    status: 'in-progress',
    data,
    authored: '2026-05-25T00:00:00.000Z',
  };
}

function allUnavailableCapabilities(): InstanceCapabilities {
  return {
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
    preparerFiling: 'unavailable',
    bringYourOwnAssistant: 'unavailable',
    safeAddress: 'unavailable',
    duressAware: 'unavailable',
    multiParty: 'unavailable',
    recordLifecycle: 'unavailable',
  };
}

function allAllowedFeatures(): OrgRuntimePolicy['features'] {
  return {
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
    preparerFiling: 'allowed',
    bringYourOwnAssistant: 'allowed',
    safeAddress: 'allowed',
    duressAware: 'allowed',
    multiParty: 'allowed',
    recordLifecycle: 'allowed',
  };
}

function respondentTokenForThread(threadId: string) {
  return respondentSessionToken(`test:thread=${encodeURIComponent(threadId)}`);
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

async function waitForButtonCount(label: string, expected: number, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (buttonLabels().filter((candidate) => candidate === label).length !== expected) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for ${expected} ${label} buttons\n\n${container?.textContent ?? ''}`);
    }
    await act(async () => {
      await tick();
    });
  }
}

function latestReviewerThreadId(): string {
  const reviewerLink = container?.querySelector<HTMLInputElement>(
    'input[aria-label="Reviewer link"]',
  )?.value;
  if (!reviewerLink) throw new Error('reviewer link not found');
  const url = new URL(reviewerLink);
  const segments = url.pathname.split('/').filter(Boolean);
  const threadId = segments[1] ? decodeURIComponent(segments[1]) : undefined;
  if (!threadId) throw new Error(`thread id not found in reviewer link: ${reviewerLink}`);
  return threadId;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
