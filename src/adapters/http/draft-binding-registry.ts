/**
 * Internal draft binding registry shared between HttpDraftStore and
 * HttpSubmitTransport via the cohort closure (FW-0064). Not a port. Adopters
 * who construct HttpDraftStore standalone (e.g. conformance tests) get a
 * private registry per store; cohort-wired adapters share one instance so
 * the submit transport can look up draft ids without reaching through a
 * public method on the draft store.
 */

import type { DraftKey, FormResponse } from '../../ports/draft-store.ts';

export interface DraftBindingSnapshot {
  draftId: string;
  draftVersion?: number;
  response: FormResponse;
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

export function createDraftBindingRegistry(): DraftBindingRegistry {
  const map = new Map<string, { key: DraftKey; snapshot: DraftBindingSnapshot }>();
  return {
    get(key) {
      return map.get(serializeKey(key))?.snapshot;
    },
    put(key, snapshot) {
      map.set(serializeKey(key), { key: { ...key }, snapshot });
    },
    delete(key) {
      map.delete(serializeKey(key));
    },
    entries() {
      return Array.from(map.values()).map(({ key, snapshot }) => ({ key: { ...key }, snapshot }));
    },
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
