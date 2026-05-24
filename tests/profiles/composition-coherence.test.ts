import { describe, expect, it } from 'vitest';
import { createStubComposition, createStubStatusRouteComposition } from '../../src/composition/stub.ts';
import {
  createDefaultComposition,
  createDefaultStatusRouteComposition,
} from '../../src/composition/default.ts';
import { createDemoStatusRouteComposition } from '../../src/composition/demo.ts';
import {
  assertCompositionCoherence,
  type CompositionLike,
} from '../../src/policy/composition-coherence.ts';
import {
  isUnavailableAdapter,
  markUnavailableAdapter,
} from '../../src/policy/sentinel.ts';
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
