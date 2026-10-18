import { deriveScopeKey } from '../../src/shared/scope-key.ts';

/** The scope formspec-server's producer fixtures carry: `Scope::fixture("tenant-test", "workspace-test", Some("environment-test"))`. */
export const testScopeKey = deriveScopeKey({ tenant: 'tenant-test', workspace: 'workspace-test', environment: 'environment-test' });

/** Another tenant's scope, for refusal controls. */
export const otherScopeKey = deriveScopeKey({ tenant: 'tenant-other', workspace: 'workspace-test', environment: 'environment-test' });
