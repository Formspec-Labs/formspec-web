import { stubIdentityProvider } from '../../../src/adapters/stub/identity-provider.ts';
import { defineIdentityProviderConformance } from '../_framework/conformance.ts';

defineIdentityProviderConformance('stub IdentityProvider conformance', () => ({
  adapter: stubIdentityProvider(),
}));
