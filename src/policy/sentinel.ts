/**
 * Adapter provenance markers per web ADR-0011 §Instance capabilities.
 *
 * Two parallel markers describe how an adapter satisfies a runtime feature:
 *   - UNAVAILABLE_ADAPTER  — production "known absent" sentinel
 *   - DEMO_STUB_ADAPTER    — demo-only fixture; MUST NOT back a production capability
 *
 * Both let the composition coherence assertion detect drift between adapter
 * provenance and instanceCapabilities declarations. Markers are mutually
 * exclusive on a single adapter.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export const UNAVAILABLE_ADAPTER = Symbol.for('formspec-web/unavailable-adapter');
export const DEMO_STUB_ADAPTER = Symbol.for('formspec-web/demo-stub-adapter');

export interface AdapterProvenanceMeta {
  readonly featureKey: RuntimeFeatureKey;
  readonly reason: string;
}

export type UnavailableAdapterMeta = AdapterProvenanceMeta;
export type DemoStubAdapterMeta = AdapterProvenanceMeta;

export type Unavailable<T> = T & {
  readonly [UNAVAILABLE_ADAPTER]: UnavailableAdapterMeta;
};
export type DemoStub<T> = T & { readonly [DEMO_STUB_ADAPTER]: DemoStubAdapterMeta };

function assertNotAlreadyMarked(adapter: object): void {
  if (UNAVAILABLE_ADAPTER in adapter || DEMO_STUB_ADAPTER in adapter) {
    throw new Error('Adapter is already marked with a provenance symbol');
  }
}

export function markUnavailableAdapter<T extends object>(
  adapter: T,
  meta: UnavailableAdapterMeta,
): Unavailable<T> {
  assertNotAlreadyMarked(adapter);
  Object.defineProperty(adapter, UNAVAILABLE_ADAPTER, {
    value: meta,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return adapter as Unavailable<T>;
}

export function markDemoStubAdapter<T extends object>(
  adapter: T,
  meta: DemoStubAdapterMeta,
): DemoStub<T> {
  assertNotAlreadyMarked(adapter);
  Object.defineProperty(adapter, DEMO_STUB_ADAPTER, {
    value: meta,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return adapter as DemoStub<T>;
}

export function isUnavailableAdapter(value: unknown): value is Unavailable<object> {
  return (
    typeof value === 'object' &&
    value !== null &&
    UNAVAILABLE_ADAPTER in value &&
    typeof (value as Record<symbol, unknown>)[UNAVAILABLE_ADAPTER] === 'object'
  );
}

export function isDemoStubAdapter(value: unknown): value is DemoStub<object> {
  return (
    typeof value === 'object' &&
    value !== null &&
    DEMO_STUB_ADAPTER in value &&
    typeof (value as Record<symbol, unknown>)[DEMO_STUB_ADAPTER] === 'object'
  );
}
