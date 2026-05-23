/**
 * DraftStore port — web ADR-0009 §MVP port inventory.
 *
 * Conformance invariant: round-trips a `Response` per
 * `formspec/schemas/response.schema.json`.
 *
 * Statefulness (web ADR-0009 §Composition lifecycle): DraftStore may maintain
 * per-subject caches and listens for identity-change events forwarded by the
 * React shell (cleared on `IdentityProvider.revoke()`).
 */

import type { FormResponse } from '@formspec-org/types';

export type { FormResponse } from '@formspec-org/types';

/** Opaque identifier scoping drafts (form + user/subject). */
export interface DraftKey {
  formUrl: string;
  formVersion?: string;
  subjectRef?: string;
}

export interface DraftStore {
  load(key: DraftKey): Promise<FormResponse | undefined>;
  save(key: DraftKey, response: FormResponse): Promise<void>;
  list(subjectRef: string): Promise<DraftKey[]>;
  delete(key: DraftKey): Promise<void>;
  /** Called by the shell when identity changes (revoke / logout). */
  invalidateSubject(subjectRef: string): Promise<void>;
}
