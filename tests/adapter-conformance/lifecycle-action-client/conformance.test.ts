// Thin wrapper by design - the executable conformance contract lives in
// `defineLifecycleActionClientConformance` so every adopter can run the same
// suite against their LifecycleActionClient implementation.
import { stubLifecycleActionClient } from '../../../src/adapters/stub/lifecycle-action-client.ts';
import { defineLifecycleActionClientConformance } from '../_framework/conformance.ts';

defineLifecycleActionClientConformance('stub LifecycleActionClient conformance', () => {
  const adapter = stubLifecycleActionClient();
  return {
    adapter,
    registerLifecycle: (snapshot) => adapter.registerLifecycle(snapshot),
  };
});
