import { createBrowserScopedMetadataStore, type ScopedMetadataStore } from '../../shared/browser-scoped-metadata.ts';
import type { HttpClientConfig } from '../http/http-client.ts';

/** Tab-local credentials and server handles only. Response documents never enter this store. */
export type DraftResumeMetadataStore = ScopedMetadataStore;

export function createBrowserDraftResumeMetadataStore(
  config: Pick<HttpClientConfig, 'baseUrl' | 'tenantBinding'> & { identityContext?: { issuer: string; clientId: string } },
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): DraftResumeMetadataStore {
  const context = {
    endpoint: new URL(config.baseUrl).href.replace(/\/+$/, ''),
    ...(config.identityContext ? { identity: { issuer: config.identityContext.issuer, clientId: config.identityContext.clientId } } : {}),
    tenantBinding: config.tenantBinding ? {
      kind: config.tenantBinding.kind,
      scope: (() => {
        const scope = config.tenantBinding.kind === 'bound' ? config.tenantBinding.scope : config.tenantBinding.sentinelScope;
        return { tenant: scope.tenant, workspace: scope.workspace, environment: scope.environment, cell: scope.cell };
      })(),
      headerMode: config.tenantBinding.kind === 'implicit' ? config.tenantBinding.headerMode : null,
    } : null,
  };
  return createBrowserScopedMetadataStore({ namespace: 'formspec-web:draft-resume:v1', context }, storage);
}
