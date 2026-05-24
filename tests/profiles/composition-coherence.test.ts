import { describe, expect, it } from 'vitest';
import {
  createStubComposition,
  createStubDocumentsRouteComposition,
  createStubObligationsRouteComposition,
  createStubStatusRouteComposition,
} from '../../src/composition/stub.ts';
import {
  createDefaultComposition,
  createDefaultDocumentsRouteComposition,
  createDefaultObligationsRouteComposition,
  createDefaultStatusRouteComposition,
} from '../../src/composition/default.ts';
import {
  createDemoDocumentsRouteComposition,
  createDemoObligationsRouteComposition,
  createDemoStatusRouteComposition,
} from '../../src/composition/demo.ts';
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
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';

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
    },
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    ...overrides,
  };
}

describe('Composition coherence — provenance ↔ instanceCapabilities (ADR-0011 §Rationale #1)', () => {
  it('stub composition is coherent (demo mode + demo-stub adapters + demo-stub declarations)', () => {
    expect(() => assertCompositionCoherence(createStubComposition())).not.toThrow();
  });

  it('default composition is coherent (production mode + unavailable sentinels + unavailable declarations)', () => {
    expect(() => assertCompositionCoherence(createDefaultComposition())).not.toThrow();
  });

  it('default status-route composition is coherent (FW-0068)', () => {
    expect(() => assertCompositionCoherence(createDefaultStatusRouteComposition())).not.toThrow();
  });

  it('stub status-route composition is coherent (FW-0068)', () => {
    expect(() => assertCompositionCoherence(createStubStatusRouteComposition())).not.toThrow();
  });

  it('demo status-route composition is coherent (FW-0068)', () => {
    expect(() => assertCompositionCoherence(createDemoStatusRouteComposition())).not.toThrow();
  });

  it('default obligations-route composition is coherent (FW-0055)', () => {
    expect(() => assertCompositionCoherence(createDefaultObligationsRouteComposition())).not.toThrow();
  });

  it('stub obligations-route composition is coherent (FW-0055)', () => {
    expect(() => assertCompositionCoherence(createStubObligationsRouteComposition())).not.toThrow();
  });

  it('demo obligations-route composition is coherent (FW-0055)', () => {
    expect(() => assertCompositionCoherence(createDemoObligationsRouteComposition())).not.toThrow();
  });

  it('default documents-route composition is coherent (FW-0056)', () => {
    expect(() => assertCompositionCoherence(createDefaultDocumentsRouteComposition())).not.toThrow();
  });

  it('stub documents-route composition is coherent (FW-0056)', () => {
    expect(() => assertCompositionCoherence(createStubDocumentsRouteComposition())).not.toThrow();
  });

  it('demo documents-route composition is coherent (FW-0056)', () => {
    expect(() => assertCompositionCoherence(createDemoDocumentsRouteComposition())).not.toThrow();
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
});

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
