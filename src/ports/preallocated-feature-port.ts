import type { RuntimeFeatureKey } from '../policy/feature-keys.ts';

/**
 * Placeholder slot used only for preallocated FEATURE_PORT_MAP entries whose
 * real port interface lands with the feature build. It is never consumed by
 * runtime code; the unavailable sentinel marker lets composition coherence
 * keep those future capabilities unavailable until their real adapters exist.
 */
export interface PreallocatedFeaturePort {
  readonly featureKey: RuntimeFeatureKey;
  readonly portName: string;
}
