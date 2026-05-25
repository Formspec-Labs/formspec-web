import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type { RuntimeFeatureKey } from '../../policy/feature-keys.ts';
import type { PreallocatedFeaturePort } from '../../ports/preallocated-feature-port.ts';
import { unavailableReviewerSession } from './reviewer-session.ts';
import { unavailableReviewThreadStore } from './review-thread-store.ts';

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
    safeAddressDirectory: unavailablePreallocatedFeaturePort('safeAddress', 'SafeAddressDirectory'),
    lifecycleActionClient: unavailablePreallocatedFeaturePort(
      'recordLifecycle',
      'LifecycleActionClient',
    ),
  };
}
