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
import type { ApplicationCaseReceipt, ApplicationCaseLookupUnavailable } from './application-lifecycle.ts';
import type { SignedResponseSigning, PendingResponseSigning, SavedResponseDraft } from './response-signing.ts';

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

/** State qualified from the same owned draft read; submitted is the actual server draft status. */
export type DraftReadState = { kind: 'active'; response: FormResponse; savedDraft?: SavedResponseDraft; signed?: SignedResponseSigning; pendingSign?: PendingResponseSigning; application?: ApplicationCaseReceipt; applicationLookup?: ApplicationCaseLookupUnavailable } | {
  kind: 'submitted'; response: FormResponse; draft: { id: string; version: number };
  subjectRef: string; formVersionId: string; application?: ApplicationCaseReceipt; applicationLookup?: ApplicationCaseLookupUnavailable;
};

export type OwnedDraftResumeSelection = {
  readonly draftId: string;
  readonly expectedResponseId: string;
  readonly initializationOnly?: never;
} | {
  readonly draftId: string;
  readonly initializationOnly: true;
  readonly expectedResponseId?: never;
};

/** An initialized identity is separate from saved Response state. */
export type DraftResumeState = DraftReadState | {
  kind: 'initialized'; initialization: RecoveredDraftInitialization;
  application?: never; applicationLookup?: never;
};

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

/** Source-qualified draft identity; an initialization-only marker is not a Response or screening authority. */
export interface RecoveredDraftInitialization {
  draftId: string;
  draftVersion: number;
  formVersionId: string;
  subjectRef: string;
  isInitializationOnly: boolean;
  response?: FormResponse;
}

export interface DraftProgressSectionPlacement {
  readonly id?: string;
  readonly fields: readonly string[];
}

export interface DraftProgressSummaryInput {
  readonly sections: readonly DraftProgressSectionPlacement[];
  readonly progress: unknown;
}

export interface DraftProgressQueryInput {
  readonly key: string;
  readonly definitionUrl: string;
  readonly definitionVersion: string;
  readonly subject?: unknown;
  readonly draftId?: string;
  readonly sections: readonly DraftProgressSectionPlacement[];
}

export interface DraftSaveOptions {
  readonly assertBeforeDispatch?: () => void;
  readonly draftSnapshot?: Record<string, unknown>;
  readonly progressSummary?: DraftProgressSummaryInput | null;
  readonly draftFence?: { readonly revision: string };
}

export interface DraftRepinInstanceInput {
  readonly instance: string;
  readonly priorValueDigest: string;
  readonly priorRecords?: readonly {
    readonly responseId: string;
    readonly definitionVersion: string;
    readonly responseHash?: string;
  }[];
}

export interface DraftRepinOptions {
  readonly expectedDraftVersion?: number;
  readonly draftFence?: { readonly revision: string };
  readonly instances: readonly DraftRepinInstanceInput[];
  readonly refillFields?: readonly string[];
  readonly refillValues?: Readonly<Record<string, unknown>>;
  readonly refreshOptionSnapshot?: boolean;
  readonly assertBeforeDispatch?: () => void;
}

export interface DraftRepinOutcome {
  readonly draftId: string;
  readonly draftVersion: number;
  readonly response: FormResponse;
  readonly draftSnapshot?: Record<string, unknown>;
  readonly selectionPins?: Record<string, unknown>;
}

export interface DraftStore {
  load(key: DraftKey): Promise<FormResponse | undefined>;
  /** Optional owner-qualified terminal recovery; omission preserves legacy loading. */
  readState?(key: DraftKey): Promise<DraftReadState | undefined>;
  /** Explicit authenticated lookup of an existing draft; qualification must precede binding. */
  resumeState?(key: DraftKey, selection: OwnedDraftResumeSelection, assertCurrent?: () => void): Promise<DraftResumeState>;
  /** Initializes durable draft identity before Save or Sign per ADR 0168. */
  initializeDraft?(key: DraftKey, formVersionId?: string): Promise<{ draftId: string; isInitializationOnly: boolean; response?: FormResponse }>;
  /** Retry only an already retained initialization attempt; absence must never allocate a key or draft. */
  recoverInitialization?(key: DraftKey, formVersionId: string, assertCurrent?: () => void): Promise<RecoveredDraftInitialization | undefined>;
  /** Trusted synchronous guard checked immediately before persistence dispatch. */
  save(key: DraftKey, response: FormResponse, options?: DraftSaveOptions): Promise<void>;
  /** Explicit revision-checked re-pin for declared `at-open` response instances (Core §4260). */
  repinDraft?(key: DraftKey, options: DraftRepinOptions): Promise<DraftRepinOutcome>;
  /** No-create batch read of committed DraftProgressSummary rows. */
  readDraftProgress?(queries: readonly DraftProgressQueryInput[]): Promise<Record<string, unknown>>;
  list(subjectRef: string): Promise<DraftKey[]>;
  delete(key: DraftKey): Promise<void>;
  /** Called by the shell when identity changes (revoke / logout). */
  invalidateSubject(subjectRef: string): Promise<void>;
}
