import type { DraftKey, DraftStore, Response } from '../../ports/draft-store.ts';

/**
 * Stub DraftStore — in-memory; per-subject + per-form keying.
 * For tests + scaffold smoke test.
 */
export function stubDraftStore(): DraftStore {
  const store = new Map<string, Response>();
  const keyStr = (key: DraftKey): string =>
    `${key.subjectRef ?? '<anon>'}|${key.formUrl}|${key.formVersion ?? 'latest'}`;

  return {
    async load(key) {
      return store.get(keyStr(key));
    },
    async save(key, response) {
      store.set(keyStr(key), response);
    },
    async list(subjectRef) {
      const result: DraftKey[] = [];
      for (const k of store.keys()) {
        const [subject, formUrl, formVersion] = k.split('|');
        if (subject === subjectRef && formUrl !== undefined) {
          const entry: DraftKey = { formUrl, subjectRef };
          if (formVersion && formVersion !== 'latest') {
            entry.formVersion = formVersion;
          }
          result.push(entry);
        }
      }
      return result;
    },
    async delete(key) {
      store.delete(keyStr(key));
    },
    async invalidateSubject(subjectRef) {
      for (const k of Array.from(store.keys())) {
        if (k.startsWith(`${subjectRef}|`)) {
          store.delete(k);
        }
      }
    },
  };
}
