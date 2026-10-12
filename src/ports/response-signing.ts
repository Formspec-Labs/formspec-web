import type { TaskDraftAssociation } from './task-draft.ts';
import type { FormDefinition, FormResponse, ResponseActionsDocument, SigningContent, SigningContentSource } from '@formspec-org/types';
import type { DraftKey } from './draft-store.ts';

export interface AdmittedResponseAction {
  document: ResponseActionsDocument;
  artifactRef: string;
  artifactDigest: string;
  actionRef: string;
  requestRef: string;
}

export interface SaveResponseDraftInput {
  /** Actual form_id from the qualified server publication. */
  formId: string;
  draftKey: DraftKey;
  definition: FormDefinition;
  formVersionId: string;
  response: FormResponse;
  operationId: string;
  action: Readonly<AdmittedResponseAction>;
}

/** Only checked fields of the actual owned DraftView, never an arbitrary provider body. */
export interface VerifiedDraftEvidence {
  readonly draft_id: string;
  readonly form_version_id: string;
  readonly subject_ref: string;
  readonly draft_version: number;
  readonly draft_state: Record<string, unknown>;
  readonly canonical_response: FormResponse;
  readonly status: 'in_progress';
  readonly taskDraft?: TaskDraftAssociation;
}

export interface SavedResponseDraft {
  readonly draftKey: Readonly<DraftKey>;
  readonly response: FormResponse;
  readonly draft: Readonly<{ id: string; version: number; responseHash: string }>;
  readonly actor: Readonly<{ id: string }>;
  readonly evidence: VerifiedDraftEvidence;
}

export interface PrepareResponseSigningInput {
  draftKey: DraftKey;
  definition: FormDefinition;
  /** Trusted server publication identity selected by the host. */
  formVersionId: string;
  response: FormResponse;
  source: SigningContentSource;
  locale: string;
  action: Readonly<AdmittedResponseAction>;
}

export interface PreparedResponseSigning extends SavedResponseDraft {
  readonly content: SigningContent;
}

export interface SignPreparedResponseInput {
  preparation: PreparedResponseSigning;
  assent: Readonly<{ signerName: string; consentAccepted: true }>;
  /** One host-generated UUIDv7 for this act; retries preserve it. */
  operationId: string;
  /** Exact admitted Response Actions artifact and mapped single-effect Action. */
  action: Readonly<AdmittedResponseAction>;
}

/** An exact saved commitment awaiting reconciliation; this grants no fresh signing act. */
export interface PendingResponseSigning extends PreparedResponseSigning {
  readonly operationId: string;
}

export interface SignedResponseSigning extends PreparedResponseSigning {
  /** Server-produced delegated evidence consistency; no claim of local cryptographic verification. */
  readonly verification: Readonly<{ mode: 'delegated-service-key'; provider: string; keyId: string }>;
}

export type RestoredPendingResponseSigning =
  | { readonly kind: 'prepared'; readonly preparation: PreparedResponseSigning; readonly operationId: string }
  | { readonly kind: 'signed'; readonly signed: SignedResponseSigning };

export interface ResponseSigning {
  saveDraft(input: SaveResponseDraftInput): Promise<SavedResponseDraft>;
  prepare(input: PrepareResponseSigningInput): Promise<PreparedResponseSigning>;
  sign(input: SignPreparedResponseInput): Promise<SignedResponseSigning>;
  restorePending?(input: PrepareResponseSigningInput & { readonly renewUnsignedRevision?: true }, operationId: string): Promise<RestoredPendingResponseSigning>;
}

export class ResponseSigningUnresolvedError extends Error {
  constructor() {
    super('A signing operation is unresolved. Restore its frozen act or explicitly clear this saved draft before starting another act.');
    this.name = 'ResponseSigningUnresolvedError';
  }
}
