import canonicalize from 'canonicalize';
import type { FormDefinition } from '@formspec-org/types';
import type { DraftStore } from '../../ports/draft-store.ts';

/** Keep local package answers bound to the exact current server definition. */
export function publishedDefinitionDraftStore(
  store: DraftStore,
  authored: () => Promise<FormDefinition>,
  published: () => Promise<FormDefinition>,
): DraftStore {
  return {
    load: key => store.load(key),
    list: subject => store.list(subject),
    delete: key => store.delete(key),
    invalidateSubject: subject => store.invalidateSubject(subject),
    ...(store.initializeDraft ? { initializeDraft: (key, versionId) => store.initializeDraft!(key, versionId) } : {}),
    async save(key, response, options) {
      const guard = options?.assertBeforeDispatch?.bind(options);
      const [local, server] = await Promise.all([authored(), published()]);
      if (local.url !== server.url || local.version !== server.version || canonicalize(local) !== canonicalize(server)) {
        throw new Error('This preview differs from the published form. Reload the current package before sending.');
      }
      await store.save(key, response, guard ? { assertBeforeDispatch: guard } : undefined);
    },
  };
}
