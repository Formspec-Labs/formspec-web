/**
 * Internal draft binding registry shared between HttpDraftStore and
 * HttpSubmitTransport via the cohort closure (FW-0064). Not a port. Adopters
 * who construct HttpDraftStore standalone (e.g. conformance tests) get a
 * private registry per store; cohort-wired adapters share one instance so
 * the submit transport can look up draft ids without reaching through a
 * public method on the draft store.
 */

import type { DraftKey, FormResponse } from '../../ports/draft-store.ts';
import type { DraftResumeMetadataStore } from '../browser/draft-resume-metadata.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';

export interface DraftBindingSnapshot {
  draftId: string;
  draftVersion?: number;
  response?: FormResponse;
}

export interface DraftBindingRegistry {
  get(key: DraftKey): DraftBindingSnapshot | undefined;
  put(key: DraftKey, snapshot: DraftBindingSnapshot): void;
  delete(key: DraftKey): void;
  // Materializes to array (not iterator) — call sites are low-frequency
  // (list / invalidateSubject), so allocation is acceptable vs the
  // ergonomic win of array iteration patterns.
  entries(): Array<{ key: DraftKey; snapshot: DraftBindingSnapshot }>;
}

export function createDraftBindingRegistry(options: {
  resumeMetadata?: DraftResumeMetadataStore;
  formIdResolver?: FormIdResolver;
} = {}): DraftBindingRegistry {
  const map = new Map<string, { key: DraftKey; snapshot: DraftBindingSnapshot }>();
  const resolveFormId = options.formIdResolver ?? defaultFormIdResolver;
  let restored = false;
  const restore = () => {
    if (restored) return;
    const saved = options.resumeMetadata?.read('draft-handles');
    if (saved !== undefined) {
      if (!Array.isArray(saved)) throw new Error('Stored draft handles are invalid');
      for (const entry of saved) {
        const key = entry?.key;
        if (!key || typeof key.formUrl !== 'string' || !key.formUrl
          || (key.formVersion !== undefined && typeof key.formVersion !== 'string')
          || (key.subjectRef !== undefined && typeof key.subjectRef !== 'string')
          || (key.partyRef !== undefined && typeof key.partyRef !== 'string')
          || typeof entry.draftId !== 'string' || !entry.draftId
          || !Number.isInteger(entry.draftVersion) || entry.draftVersion < 0
          || entry.formId !== resolveFormId(key.formUrl, key.formVersion)) {
          throw new Error('Stored draft handle does not match its form context');
        }
        map.set(serializeKey(key), { key: copyKey(key), snapshot: { draftId: entry.draftId, draftVersion: entry.draftVersion } });
      }
    }
    restored = true;
  };
  const persist = () => {
    const handles = [...map.values()].map(({ key, snapshot }) => ({
      key, formId: resolveFormId(key.formUrl, key.formVersion),
      draftId: snapshot.draftId, draftVersion: snapshot.draftVersion,
    }));
    if (handles.length) options.resumeMetadata?.write('draft-handles', handles);
    else options.resumeMetadata?.remove('draft-handles');
  };
  const sameScope = (left: DraftKey, right: DraftKey) => (
    resolveFormId(left.formUrl, left.formVersion) === resolveFormId(right.formUrl, right.formVersion)
    && (left.subjectRef ?? null) === (right.subjectRef ?? null)
    && (left.partyRef ?? null) === (right.partyRef ?? null)
  );
  return {
    get(key) {
      restore();
      const matching = map.get(serializeKey(key));
      if (matching) return matching.snapshot;
      for (const retained of map.values()) {
        if (sameScope(retained.key, key)
          && (retained.key.formVersion ?? null) !== (key.formVersion ?? null)) {
          throw new Error('A saved draft belongs to another form version. Open its original package or explicitly clear the saved draft before starting this version.');
        }
      }
      return undefined;
    },
    put(key, snapshot) {
      restore();
      map.set(serializeKey(key), { key: copyKey(key), snapshot });
      persist();
    },
    delete(key) {
      try { restore(); } catch {
        // Explicit clear may discard corrupt locators; reading them still fails closed.
        options.resumeMetadata?.remove('draft-handles');
        map.clear();
        restored = true;
        return;
      }
      // Explicit clear also removes an older-version handle that refused resume.
      for (const [serialized, entry] of map) {
        if (sameScope(entry.key, key)) map.delete(serialized);
      }
      persist();
    },
    entries() {
      restore();
      return Array.from(map.values()).map(({ key, snapshot }) => ({ key: { ...key }, snapshot }));
    },
  };
}

function copyKey(key: DraftKey): DraftKey {
  return { formUrl: key.formUrl,
    ...(key.formVersion !== undefined ? { formVersion: key.formVersion } : {}),
    ...(key.subjectRef !== undefined ? { subjectRef: key.subjectRef } : {}),
    ...(key.partyRef !== undefined ? { partyRef: key.partyRef } : {}),
  };
}

function serializeKey(key: DraftKey): string {
  return JSON.stringify({
    formUrl: key.formUrl,
    formVersion: key.formVersion ?? null,
    subjectRef: key.subjectRef ?? null,
    partyRef: key.partyRef ?? null,
  });
}
