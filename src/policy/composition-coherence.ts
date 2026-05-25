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
import { featurePortNames, type CompositionPortName } from './feature-port-map.ts';
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
  readonly [P in CompositionPortName]: unknown;
};

export type CompositionIncoherenceKind =
  | 'sentinel-without-unavailable-declaration'
  | 'unavailable-declaration-without-sentinel'
  | 'demo-stub-adapter-in-production-composition'
  | 'demo-stub-adapter-without-demo-stub-declaration'
  | 'demo-stub-declaration-without-demo-stub-adapter'
  | 'available-declaration-paired-with-marked-adapter'
  | 'shared-slot-declaration-conflict'
  | 'feature-without-port-binding';

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

/**
 * Composition-construction funnel: every composition root (stub, default
 * production, adopter forks) MUST funnel its constructed Composition through
 * this helper instead of returning a raw object literal. The helper enforces
 * ADR-0011 §Rationale #1 ("reference deployments must be honest") and is the
 * single point where coherence drift is caught at boot — no future adopter
 * can forget to call assertCompositionCoherence directly because the public
 * idiom IS the funnel.
 *
 * The returned composition is the SAME reference; we don't deep-freeze
 * because adapters need to remain mutable for hot-reload / replay scenarios.
 * The honesty contract is structural (declaration ↔ provenance), not
 * shape-immutability.
 */
export function freezeComposition<T extends CompositionLike>(composition: T): T {
  assertCompositionCoherence(composition);
  return composition;
}

export function assertCompositionCoherence(composition: CompositionLike): void {
  // Group keys by the port slot they map to. FW-0056 introduced shared slots
  // (respondentPlace + documentPresentation both → respondentPlaceSource);
  // every key on a shared slot declares independently. A key declaring
  // 'unavailable' opts out of the slot (the consumer short-circuits before
  // reading the adapter), so the adapter's marker only needs to satisfy the
  // keys that DO consume it.
  const portToKeys = new Map<string, readonly RuntimeFeatureKey[]>();
  for (const featureKey of RUNTIME_FEATURE_KEYS) {
    for (const portName of featurePortNames(featureKey)) {
      const existing = portToKeys.get(portName) ?? [];
      portToKeys.set(portName, [...existing, featureKey]);
    }
  }

  for (const featureKey of RUNTIME_FEATURE_KEYS) {
    const declared = composition.instanceCapabilities[featureKey];
    const portNames = featurePortNames(featureKey);
    if (portNames.length === 0) {
      if (declared !== 'unavailable') {
        throw new CompositionIncoherenceError(
          featureKey,
          'feature-without-port-binding',
          `instanceCapabilities declares "${featureKey}" ${declared}, but FEATURE_PORT_MAP has no backing port binding yet. Keep the capability "unavailable" until the feature build lands a concrete adapter-backed port contract.`,
        );
      }
      continue;
    }
    for (const portName of portNames) {
      const adapter = composition[portName];
      const adapterIsUnavailable = isUnavailableAdapter(adapter);
      const adapterIsDemoStub = isDemoStubAdapter(adapter);
      const slotKeys = portToKeys.get(portName) ?? [featureKey];
      const slotIsShared = slotKeys.length > 1;
      const slotHasNonUnavailableKey = slotKeys.some(
        (k) => composition.instanceCapabilities[k] !== 'unavailable',
      );
      // On a shared slot, an 'unavailable' declaration means the consumer for
      // that key short-circuits — the adapter's marker only needs to satisfy the
      // sibling key(s) that DO consume the slot. Skip per-key adapter checks for
      // this key when at least one sibling declaration keeps the slot live.
      if (slotIsShared && declared === 'unavailable' && slotHasNonUnavailableKey) {
        continue;
      }

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
          sharedSlotMessage(
            slotKeys,
            slotIsShared,
            composition,
            portName,
            `Adapter for "${featureKey}" (port "${portName}") is marked demo-stub, but instanceCapabilities declared "${declared}". The composition must declare "demo-stub".`,
          ),
        );
      }
      if (declared === 'demo-stub' && !adapterIsDemoStub) {
        throw new CompositionIncoherenceError(
          featureKey,
          'demo-stub-declaration-without-demo-stub-adapter',
          sharedSlotMessage(
            slotKeys,
            slotIsShared,
            composition,
            portName,
            `instanceCapabilities declares "${featureKey}" demo-stub, but the wired adapter at port "${portName}" carries no DEMO_STUB_ADAPTER marker. Wire a stub* adapter or change the declaration.`,
          ),
        );
      }

      if (declared === 'available' && (adapterIsUnavailable || adapterIsDemoStub)) {
        throw new CompositionIncoherenceError(
          featureKey,
          slotIsShared
            ? 'shared-slot-declaration-conflict'
            : 'available-declaration-paired-with-marked-adapter',
          sharedSlotMessage(
            slotKeys,
            slotIsShared,
            composition,
            portName,
            `instanceCapabilities declares "${featureKey}" available, but the wired adapter at port "${portName}" carries a provenance marker (${adapterIsUnavailable ? 'unavailable' : 'demo-stub'}). Wire a real production adapter or change the declaration.`,
          ),
        );
      }
    }
  }
}

/**
 * NIT-1 friendly-error UX: on a shared slot, name the conflict in
 * adopter-readable terms — list the keys, their declarations, the slot, and
 * the SC-4 transitional-clearance trigger so adopters who land a real wallet
 * but no VP stack land in the right doc instead of staring at a per-key
 * provenance error.
 */
function sharedSlotMessage(
  slotKeys: readonly RuntimeFeatureKey[],
  slotIsShared: boolean,
  composition: CompositionLike,
  portName: string,
  baseMessage: string,
): string {
  if (!slotIsShared) return baseMessage;
  const declarations = slotKeys
    .map((k) => `${k}=${composition.instanceCapabilities[k]}`)
    .join(', ');
  return [
    baseMessage,
    `Port "${portName}" is shared between [${slotKeys.join(', ')}]; their declarations [${declarations}] together require a different adapter marker than the one wired.`,
    'If you are an adopter with a real wallet but no Verifiable Presentation stack, this is the SC-4 transitional-clearance trigger — see thoughts/specs/2026-05-22-upstream-extension-queue.md SC-4.',
  ].join(' ');
}
