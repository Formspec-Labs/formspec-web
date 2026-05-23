/**
 * Asserts the load-bearing honesty invariants of ADR-0011 §Instance capabilities
 * (per §Rationale #1 "reference deployments must be honest"). The composition
 * mode + each wired adapter's provenance marker + the instanceCapabilities
 * declaration must all agree.
 *
 * Rules:
 *   - Adapter marked unavailable  ↔  declaration 'unavailable'.
 *   - Adapter marked demo-stub    ↔  declaration 'demo-stub' AND composition.mode === 'demo'.
 *   - Declaration 'available' may pair only with an adapter that carries NEITHER provenance marker.
 *
 * Codex red-team finding addressed: checking only the unavailable sentinel
 * lets a production composition wire a demo stub and declare 'available' —
 * the exact production-stubs-must-not-satisfy-production violation ADR-0011
 * §Instance capabilities forbids.
 *
 * Call this from every composition smoke test. Production-mode composition
 * roots MUST also call it at boot.
 */
import { RUNTIME_FEATURE_KEYS, type RuntimeFeatureKey } from './feature-keys.ts';
import { FEATURE_PORT_MAP } from './feature-port-map.ts';
import { isDemoStubAdapter, isUnavailableAdapter } from './sentinel.ts';
import type { InstanceCapabilities } from './policy-shapes.ts';

/**
 * Structural minimum the assertion needs from a Composition: the mode flag,
 * the declared capabilities, and the wired adapter slot named by
 * FEATURE_PORT_MAP for each key. Concrete `Composition` (composition/types.ts)
 * satisfies this shape; tests can pass in synthetic CompositionLike literals.
 */
export type CompositionLike = {
  readonly mode: 'demo' | 'production';
  readonly instanceCapabilities: InstanceCapabilities;
} & {
  readonly [P in (typeof FEATURE_PORT_MAP)[RuntimeFeatureKey]]: unknown;
};

export type CompositionIncoherenceKind =
  | 'sentinel-without-unavailable-declaration'
  | 'unavailable-declaration-without-sentinel'
  | 'demo-stub-adapter-in-production-composition'
  | 'demo-stub-adapter-without-demo-stub-declaration'
  | 'demo-stub-declaration-without-demo-stub-adapter'
  | 'available-declaration-paired-with-marked-adapter';

export class CompositionIncoherenceError extends Error {
  constructor(
    readonly featureKey: RuntimeFeatureKey,
    readonly kind: CompositionIncoherenceKind,
    message: string,
  ) {
    super(message);
    this.name = 'CompositionIncoherenceError';
  }
}

export function assertCompositionCoherence(composition: CompositionLike): void {
  for (const featureKey of RUNTIME_FEATURE_KEYS) {
    const portName = FEATURE_PORT_MAP[featureKey];
    const adapter = composition[portName];
    const declared = composition.instanceCapabilities[featureKey];
    const adapterIsUnavailable = isUnavailableAdapter(adapter);
    const adapterIsDemoStub = isDemoStubAdapter(adapter);

    if (adapterIsUnavailable && declared !== 'unavailable') {
      throw new CompositionIncoherenceError(
        featureKey,
        'sentinel-without-unavailable-declaration',
        `Adapter for "${featureKey}" (port "${portName}") is marked unavailable, but instanceCapabilities declared "${declared}". The composition must declare "unavailable".`,
      );
    }
    if (declared === 'unavailable' && !adapterIsUnavailable) {
      throw new CompositionIncoherenceError(
        featureKey,
        'unavailable-declaration-without-sentinel',
        `instanceCapabilities declares "${featureKey}" unavailable, but the wired adapter at port "${portName}" carries no UNAVAILABLE_ADAPTER sentinel. Wire an unavailable* adapter or change the declaration.`,
      );
    }

    if (adapterIsDemoStub && composition.mode === 'production') {
      throw new CompositionIncoherenceError(
        featureKey,
        'demo-stub-adapter-in-production-composition',
        `Adapter for "${featureKey}" (port "${portName}") is marked demo-stub, but the composition is in production mode. Demo stubs MUST NOT back production capabilities (ADR-0011 §Instance capabilities).`,
      );
    }
    if (adapterIsDemoStub && declared !== 'demo-stub') {
      throw new CompositionIncoherenceError(
        featureKey,
        'demo-stub-adapter-without-demo-stub-declaration',
        `Adapter for "${featureKey}" (port "${portName}") is marked demo-stub, but instanceCapabilities declared "${declared}". The composition must declare "demo-stub".`,
      );
    }
    if (declared === 'demo-stub' && !adapterIsDemoStub) {
      throw new CompositionIncoherenceError(
        featureKey,
        'demo-stub-declaration-without-demo-stub-adapter',
        `instanceCapabilities declares "${featureKey}" demo-stub, but the wired adapter at port "${portName}" carries no DEMO_STUB_ADAPTER marker. Wire a stub* adapter or change the declaration.`,
      );
    }

    if (declared === 'available' && (adapterIsUnavailable || adapterIsDemoStub)) {
      throw new CompositionIncoherenceError(
        featureKey,
        'available-declaration-paired-with-marked-adapter',
        `instanceCapabilities declares "${featureKey}" available, but the wired adapter at port "${portName}" carries a provenance marker (${adapterIsUnavailable ? 'unavailable' : 'demo-stub'}). Wire a real production adapter or change the declaration.`,
      );
    }
  }
}
