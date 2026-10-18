import { createBrowserScopedMetadataStore, type ScopedMetadataStore } from '../../shared/browser-scoped-metadata.ts';
import type { HttpClientConfig } from '../http/http-client.ts';

/** Tab-local credentials and server handles only. Response documents never enter this store. */
export type DraftResumeMetadataStore = ScopedMetadataStore;

export function createBrowserDraftResumeMetadataStore(
  config: Pick<HttpClientConfig, 'baseUrl' | 'scopeKey'> & { identityContext?: { issuer: string; clientId: string }; taskContext?: { taskId: string; expectedTaskRevision: string } },
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): DraftResumeMetadataStore {
  if (config.taskContext && (typeof config.taskContext.taskId !== 'string' || !config.taskContext.taskId.trim()
    || typeof config.taskContext.expectedTaskRevision !== 'string' || !config.taskContext.expectedTaskRevision.trim())) {
    throw new Error('Task draft resume metadata requires an exact task and revision');
  }
  const context = {
    endpoint: new URL(config.baseUrl).href.replace(/\/+$/, ''),
    ...(config.identityContext ? { identity: { issuer: config.identityContext.issuer, clientId: config.identityContext.clientId } } : {}),
    ...(config.taskContext ? { task: { taskId: config.taskContext.taskId, expectedTaskRevision: config.taskContext.expectedTaskRevision } } : {}),
    scopeKey: config.scopeKey ?? null,
  };
  return createBrowserScopedMetadataStore({ namespace: 'formspec-web:draft-resume:v1', context }, storage);
}
