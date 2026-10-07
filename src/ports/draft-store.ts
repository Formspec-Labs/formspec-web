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
  /**
   * FW-0061: optional party-scoped draft slice. Single-party flows leave this
   * unset; multi-party flows bind saves/loads to the active Definition role
   * slot without adding a new DraftStore method.
   */
  partyRef?: string;
}

/** A retained draft cannot be resumed against a different immutable form version. */
export class DraftVersionConflictError extends Error {
  readonly currentDraftKey: Readonly<DraftKey>;
  readonly retainedVersion: string | undefined;

  constructor(currentDraftKey: DraftKey, retainedVersion?: string) {
    super('A saved draft belongs to another form version. Open its original package or explicitly clear the saved draft before starting this version.');
    this.name = 'DraftVersionConflictError';
    this.currentDraftKey = Object.freeze({
      formUrl: currentDraftKey.formUrl,
      ...(currentDraftKey.formVersion !== undefined ? { formVersion: currentDraftKey.formVersion } : {}),
      ...(currentDraftKey.subjectRef !== undefined ? { subjectRef: currentDraftKey.subjectRef } : {}),
      ...(currentDraftKey.partyRef !== undefined ? { partyRef: currentDraftKey.partyRef } : {}),
    });
    this.retainedVersion = retainedVersion;
  }
}

export interface DraftStore {
  load(key: DraftKey): Promise<FormResponse | undefined>;
  save(key: DraftKey, response: FormResponse): Promise<void>;
  list(subjectRef: string): Promise<DraftKey[]>;
  delete(key: DraftKey): Promise<void>;
  /** Called by the shell when identity changes (revoke / logout). */
  invalidateSubject(subjectRef: string): Promise<void>;
}
