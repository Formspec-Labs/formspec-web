import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type { RuntimeFeatureKey } from '../../policy/feature-keys.ts';
import type { PreallocatedFeaturePort } from '../../ports/preallocated-feature-port.ts';

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
    reviewerSession: unavailablePreallocatedFeaturePort('trustedReviewer', 'ReviewerSession'),
    reviewThreadStore: unavailablePreallocatedFeaturePort('trustedReviewer', 'ReviewThreadStore'),
    safeAddressDirectory: unavailablePreallocatedFeaturePort('safeAddress', 'SafeAddressDirectory'),
    lifecycleActionClient: unavailablePreallocatedFeaturePort(
      'recordLifecycle',
      'LifecycleActionClient',
    ),
  };
}
