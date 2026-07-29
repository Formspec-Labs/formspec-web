import { unavailableSurfaceBundleSource } from './surface-bundle-source.ts';
import { unavailableSurfaceBundleVerifier } from './surface-bundle-verifier.ts';

/** Shared fixture/default wiring for the deferred Verifying Surface Shell. */
export function unavailableSurfaceBundlePorts() {
  return {
    surfaceBundleSource: unavailableSurfaceBundleSource(),
    surfaceBundleVerifier: unavailableSurfaceBundleVerifier(),
  };
}
