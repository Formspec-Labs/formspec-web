import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type { RuntimeFeatureKey } from '../../policy/feature-keys.ts';
import type { PreallocatedFeaturePort } from '../../ports/preallocated-feature-port.ts';
import { unavailableReviewerSession } from './reviewer-session.ts';
import { unavailableReviewThreadStore } from './review-thread-store.ts';
import { unavailableLifecycleActionClient } from './lifecycle-action-client.ts';
import { unavailableSafeAddressDirectory } from './safe-address-directory.ts';

export function unavailablePreallocatedFeaturePort(
  featureKey: RuntimeFeatureKey,
  portName: string,
  message = `${portName} adapter is preallocated but not configured for this deployment.`,
): PreallocatedFeaturePort {
  const adapter: PreallocatedFeaturePort = { featureKey, portName };
  return markUnavailableAdapter(adapter, {
    featureKey,
    reason: message,
  });
}

export function unavailablePreallocatedFeaturePorts() {
  return {
    reviewerSession: unavailableReviewerSession(),
    reviewThreadStore: unavailableReviewThreadStore(),
    safeAddressDirectory: unavailableSafeAddressDirectory(),
    // Kept here as a test/composition convenience: recordLifecycle now has a
    // real port, so this entry delegates to the real unavailable sentinel.
    lifecycleActionClient: unavailableLifecycleActionClient(),
  };
}
