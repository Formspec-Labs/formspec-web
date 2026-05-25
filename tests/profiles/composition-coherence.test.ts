import { describe, expect, it } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import {
  createRouteNarrowedComposition,
  type RouteNarrowing,
  type RouteNarrowingMode,
} from '../../src/composition/route-narrowing.ts';
import { DOCUMENTS_ROUTE_NARROWING } from '../../src/app/documents-route.ts';
import { OBLIGATIONS_ROUTE_NARROWING } from '../../src/app/obligations-route.ts';
import { STATUS_ROUTE_NARROWING } from '../../src/app/status-route.ts';
import {
  assertCompositionCoherence,
  type CompositionLike,
} from '../../src/policy/composition-coherence.ts';
import {
  isUnavailableAdapter,
  markUnavailableAdapter,
} from '../../src/policy/sentinel.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { unavailableAttachmentStore } from '../../src/adapters/unavailable/attachment-store.ts';
import { unavailableRespondentHistorySource } from '../../src/adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';
import { unavailableEmbedTransport } from '../../src/adapters/unavailable/embed-transport.ts';
import { unavailableOfflineSubmitQueue } from '../../src/adapters/unavailable/offline-submit-queue.ts';
import { unavailablePaymentRailAdapter } from '../../src/adapters/unavailable/payment-rail-adapter.ts';
import { unavailablePreallocatedFeaturePorts } from '../../src/adapters/unavailable/preallocated-feature-port.ts';
import { unavailableScreenerDocumentSource } from '../../src/adapters/unavailable/screener-document-source.ts';
import { unavailableReviewerSession } from '../../src/adapters/unavailable/reviewer-session.ts';
import { unavailableReviewThreadStore } from '../../src/adapters/unavailable/review-thread-store.ts';
import { HISTORY_ROUTE_NARROWING } from '../../src/app/history-route.ts';
import { SCREENER_ROUTE_NARROWING } from '../../src/app/screener-route.ts';
import type { ReviewerSession } from '../../src/ports/reviewer-session.ts';
import type { ReviewThreadStore } from '../../src/ports/review-thread-store.ts';

// Build a minimal production-mode CompositionLike directly. `createDefaultComposition()`
// short-circuits to the demo composition when no formspecServerUrl is configured, which
// would let the demo-mode tests below pass for the wrong reason.
function productionCompositionLike(overrides: Partial<CompositionLike> = {}): CompositionLike {
  return {
    mode: 'production',
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
      // FW-0056: transitional port mapping (see feature-port-map.ts) — the
      // same respondentPlaceSource slot satisfies both keys. Same unavailable
      // declaration on both keys lets the unavailable sentinel cohere for
      // both at once.
      documentPresentation: 'unavailable',
      // FW-0033: closed-taxonomy key paired with the unavailable
      // attachmentStore sentinel.
      fileUpload: 'unavailable',
      // FW-0057: closed-taxonomy key paired with the unavailable
      // respondentHistorySource sentinel.
      crossIssuerHistory: 'unavailable',
      // FW-0044: closed-taxonomy key paired with the unavailable
      // offlineSubmitQueue sentinel.
      offlineSubmit: 'unavailable',
      // FW-0027: closed-taxonomy key paired with the unavailable
      // paymentRailAdapter sentinel.
      payment: 'unavailable',
      // FW-0040: closed-taxonomy key paired with the unavailable
      // embedTransport sentinel.
      embed: 'unavailable',
      screener: 'unavailable',
      trustedReviewer: 'unavailable',
      preparerFiling: 'unavailable',
      bringYourOwnAssistant: 'unavailable',
      safeAddress: 'unavailable',
      duressAware: 'unavailable',
      multiParty: 'unavailable',
      recordLifecycle: 'unavailable',
    },
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    attachmentStore: unavailableAttachmentStore(),
    respondentHistorySource: unavailableRespondentHistorySource(),
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    paymentRailAdapter: unavailablePaymentRailAdapter(),
    embedTransport: unavailableEmbedTransport(),
    screenerDocumentSource: unavailableScreenerDocumentSource(),
    ...unavailablePreallocatedFeaturePorts(),
    ...overrides,
  };
}

// FW-0070: programmatic generator replaces 9 explicit narrowed-factory cases.
// Adding a new descriptor adds its coherence coverage automatically; the
// matrix no longer scales linearly with the file body.
const NARROWED_DESCRIPTORS: ReadonlyArray<readonly [string, RouteNarrowing]> = [
  ['STATUS_ROUTE_NARROWING (FW-0068)', STATUS_ROUTE_NARROWING],
  ['OBLIGATIONS_ROUTE_NARROWING (FW-0055)', OBLIGATIONS_ROUTE_NARROWING],
  ['DOCUMENTS_ROUTE_NARROWING (FW-0056)', DOCUMENTS_ROUTE_NARROWING],
  ['HISTORY_ROUTE_NARROWING (FW-0057)', HISTORY_ROUTE_NARROWING],
  ['SCREENER_ROUTE_NARROWING (FW-0046)', SCREENER_ROUTE_NARROWING],
];
const NARROWED_MODES: readonly RouteNarrowingMode[] = ['default', 'stub'];

function* narrowedCompositionCoherenceCases(): Generator<{
  name: string;
  build: () => ReturnType<typeof createRouteNarrowedComposition>;
}> {
  for (const [label, route] of NARROWED_DESCRIPTORS) {
    for (const mode of NARROWED_MODES) {
      yield {
        name: `${mode} mode × ${label} is coherent`,
        build: () => createRouteNarrowedComposition({ mode, route }),
      };
    }
  }
}

describe('Composition coherence — provenance ↔ instanceCapabilities (ADR-0011 §Rationale #1)', () => {
  it('stub composition is coherent (demo mode + demo-stub adapters + demo-stub declarations)', () => {
    expect(() => assertCompositionCoherence(createStubComposition())).not.toThrow();
  });

  it('default composition is coherent (production mode + unavailable sentinels + unavailable declarations)', () => {
    expect(() => assertCompositionCoherence(createDefaultComposition())).not.toThrow();
  });

  describe('narrowed-route compositions cohere across every (mode, descriptor) combo (FW-0070)', () => {
    for (const testCase of narrowedCompositionCoherenceCases()) {
      it(testCase.name, () => {
        expect(() => assertCompositionCoherence(testCase.build())).not.toThrow();
      });
    }
  });

  it('flags an adapter marked unavailable but declared anything other than unavailable', () => {
    const composition = createStubComposition();
    const replacement = {
      readPlace: async () => {
        throw new Error('forced');
      },
    };
    markUnavailableAdapter(replacement, {
      featureKey: 'respondentPlace',
      reason: 'forced for test',
    });
    (composition as { respondentPlaceSource: unknown }).respondentPlaceSource = replacement;
    expect(() => assertCompositionCoherence(composition)).toThrow(/respondentPlace/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/unavailable/);
  });

  it('flags an unavailable declaration with no matching sentinel adapter', () => {
    const composition = createStubComposition();
    (composition.instanceCapabilities as Record<string, unknown>).status = 'unavailable';
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/sentinel|unavailable/);
  });

  it('flags a demo-stub adapter wired in a production-mode composition', () => {
    const composition = productionCompositionLike({
      instanceCapabilities: {
        respondentPlace: 'unavailable',
        status: 'available',
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
      },
      statusReader: stubStatusReader(),
    });
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/demo-stub|production/);
  });

  it('flags a demo-stub declaration with no matching demo-stub-marked adapter', () => {
    const composition = productionCompositionLike({
      instanceCapabilities: {
        respondentPlace: 'unavailable',
        status: 'demo-stub',
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
      },
    });
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/demo-stub/);
  });

  it('flags an adapter that is neither unavailable-marked nor demo-stub-marked when the declaration says demo-stub', () => {
    const composition = createStubComposition();
    (composition as { statusReader: unknown }).statusReader = {
      readStatus: async () => ({}) as never,
    };
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
  });

  it('does not crash when a real (unmarked) adapter is paired with declaration "available"', () => {
    const composition = createDefaultComposition();
    (composition as { statusReader: unknown }).statusReader = {
      readStatus: async () => ({}) as never,
    };
    (composition.instanceCapabilities as Record<string, unknown>).status = 'available';
    expect(() => assertCompositionCoherence(composition)).not.toThrow();
    expect(isUnavailableAdapter(composition.statusReader)).toBe(false);
  });

  it('requires both trustedReviewer ports when the feature is declared available', () => {
    const composition = productionCompositionLike({
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
        trustedReviewer: 'available',
        preparerFiling: 'unavailable',
        bringYourOwnAssistant: 'unavailable',
        safeAddress: 'unavailable',
        duressAware: 'unavailable',
        multiParty: 'unavailable',
        recordLifecycle: 'unavailable',
      },
      reviewerSession: unmarkedReviewerSession(),
      reviewThreadStore: unavailableReviewThreadStore(),
    });
    expect(() => assertCompositionCoherence(composition)).toThrow(/reviewThreadStore/);
  });

  it('does not accept a one-port trustedReviewer shortcut', () => {
    const composition = productionCompositionLike({
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
        trustedReviewer: 'available',
        preparerFiling: 'unavailable',
        bringYourOwnAssistant: 'unavailable',
        safeAddress: 'unavailable',
        duressAware: 'unavailable',
        multiParty: 'unavailable',
        recordLifecycle: 'unavailable',
      },
      reviewerSession: unavailableReviewerSession(),
      reviewThreadStore: unmarkedReviewThreadStore(),
    });
    expect(() => assertCompositionCoherence(composition)).toThrow(/reviewerSession/);
  });

  it('keeps preparerFiling unavailable-only until a concrete FW-0037 port lands', () => {
    const composition = productionCompositionLike({
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
        preparerFiling: 'available',
        bringYourOwnAssistant: 'unavailable',
        safeAddress: 'unavailable',
        duressAware: 'unavailable',
        multiParty: 'unavailable',
        recordLifecycle: 'unavailable',
      },
    });
    expect(() => assertCompositionCoherence(composition)).toThrow(/preparerFiling/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/no backing port binding/);
  });
});

function unmarkedReviewerSession(): ReviewerSession {
  return {
    async mintShare() {
      return { shareId: 'share:test', capabilityUrl: 'https://review.example.test/r/thread/token' };
    },
    async redeem() {
      return {
        shareId: 'share:test',
        threadId: 'thread:test',
        grantedScope: 'view+comment',
        threadPolicySnapshot: {
          posture: 'comment-allowed',
          respondentOnlyFieldPointers: [],
        },
        sessionToken: 'capability:test',
      };
    },
    async revoke() {},
    async listShares() {
      return [];
    },
  };
}

function unmarkedReviewThreadStore(): ReviewThreadStore {
  return {
    async ensureThread(args) {
      return {
        $formspecReviewThread: '1.0',
        threadId: args.threadId,
        draftRef: args.draftRef,
        policySnapshot: args.policySnapshot,
        shares: [],
        events: [],
        createdAt: '2026-05-25T00:00:00.000Z',
      };
    },
    async read() {
      throw new Error('not used');
    },
    async appendEvent() {
      throw new Error('not used');
    },
    async pinForReceipt() {
      return { threadHash: 'sha256:test', bindingArtifactRef: 'review-thread:test' };
    },
  };
}

// FW-0056 arch-review MED-1: when two RuntimeFeatureKeys map to the same
// port slot (today: respondentPlace + documentPresentation both → the
// respondentPlaceSource slot, per feature-port-map.ts), each key's
// declaration is independent. A key declaring 'unavailable' opts out of the
// slot — the consumer short-circuits before reading the adapter — so the
// adapter's marker only needs to satisfy the keys that DO consume it. The
// adapter must satisfy the union of non-unavailable declarations; if every
// declaration on the shared slot is 'unavailable', the adapter itself must
// be unavailable-marked.
describe('Composition coherence — shared-slot independent declarations (FW-0056 MED-1)', () => {
  function sharedSlotCompositionLike(
    overrides: Pick<CompositionLike, 'mode' | 'instanceCapabilities' | 'respondentPlaceSource'>,
  ): CompositionLike {
    return {
      statusReader: unavailableStatusReader(),
      attachmentStore: unavailableAttachmentStore(),
      respondentHistorySource: unavailableRespondentHistorySource(),
      offlineSubmitQueue: unavailableOfflineSubmitQueue(),
      paymentRailAdapter: unavailablePaymentRailAdapter(),
      embedTransport: unavailableEmbedTransport(),
      screenerDocumentSource: unavailableScreenerDocumentSource(),
      ...unavailablePreallocatedFeaturePorts(),
      ...overrides,
    };
  }

  it('accepts respondentPlace=demo-stub + documentPresentation=unavailable on a demo-stub-marked place adapter (the post-MED-1 demo stance)', () => {
    const composition = sharedSlotCompositionLike({
      mode: 'demo',
      instanceCapabilities: {
        respondentPlace: 'demo-stub',
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
      },
      respondentPlaceSource: stubRespondentPlaceSource(),
    });
    expect(() => assertCompositionCoherence(composition)).not.toThrow();
  });

  it('accepts respondentPlace=unavailable + documentPresentation=unavailable on the unavailable place adapter (production posture)', () => {
    const composition = sharedSlotCompositionLike({
      mode: 'production',
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
        preparerFiling: 'unavailable',
        bringYourOwnAssistant: 'unavailable',
        safeAddress: 'unavailable',
        duressAware: 'unavailable',
        multiParty: 'unavailable',
        recordLifecycle: 'unavailable',
      },
      respondentPlaceSource: unavailableRespondentPlaceSource(),
    });
    expect(() => assertCompositionCoherence(composition)).not.toThrow();
  });

  it('accepts respondentPlace=demo-stub + documentPresentation=demo-stub on the demo-stub-marked place adapter (today\'s demo stance pre-MED-1)', () => {
    const composition = sharedSlotCompositionLike({
      mode: 'demo',
      instanceCapabilities: {
        respondentPlace: 'demo-stub',
        status: 'unavailable',
        documentPresentation: 'demo-stub',
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
      },
      respondentPlaceSource: stubRespondentPlaceSource(),
    });
    expect(() => assertCompositionCoherence(composition)).not.toThrow();
  });

  it('accepts respondentPlace=available + documentPresentation=unavailable on an unmarked place adapter (the wallet-but-no-VP scenario the design promised would trigger SC-4)', () => {
    const realPlaceAdapter = { readPlace: async () => ({}) as never };
    const composition = sharedSlotCompositionLike({
      mode: 'production',
      instanceCapabilities: {
        respondentPlace: 'available',
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
      },
      respondentPlaceSource: realPlaceAdapter as never,
    });
    expect(() => assertCompositionCoherence(composition)).not.toThrow();
  });

  it('rejects respondentPlace=demo-stub + documentPresentation=available on a demo-stub-marked place adapter (claiming production VP availability while substrate is demo-only)', () => {
    const composition = sharedSlotCompositionLike({
      mode: 'demo',
      instanceCapabilities: {
        respondentPlace: 'demo-stub',
        status: 'unavailable',
        documentPresentation: 'available',
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
      },
      respondentPlaceSource: stubRespondentPlaceSource(),
    });
    expect(() => assertCompositionCoherence(composition)).toThrow(
      /documentPresentation|available|demo-stub/,
    );
  });

  it('names the shared slot, both keys, and the SC-4 transitional clearance trigger when the union fails (NIT-1 friendly-error UX)', () => {
    const composition = sharedSlotCompositionLike({
      mode: 'demo',
      instanceCapabilities: {
        respondentPlace: 'demo-stub',
        status: 'unavailable',
        documentPresentation: 'available',
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
      },
      respondentPlaceSource: stubRespondentPlaceSource(),
    });
    try {
      assertCompositionCoherence(composition);
      throw new Error('expected assertCompositionCoherence to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/respondentPlaceSource/);
      expect(message).toMatch(/respondentPlace/);
      expect(message).toMatch(/documentPresentation/);
      expect(message).toMatch(/SC-4/);
      expect(message).toMatch(/upstream-extension-queue/);
    }
  });
});
