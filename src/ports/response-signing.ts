import type { FormDefinition, FormResponse, ResponseActionsDocument, SigningContent, SigningContentSource } from '@formspec-org/types';
import type { DraftKey } from './draft-store.ts';

export interface PrepareResponseSigningInput {
  draftKey: DraftKey;
  definition: FormDefinition;
  /** Trusted server publication identity selected by the host. */
  formVersionId: string;
  response: FormResponse;
  source: SigningContentSource;
  locale: string;
}

export interface PreparedResponseSigning {
  readonly draftKey: Readonly<DraftKey>;
  readonly response: FormResponse;
  readonly draft: Readonly<{ id: string; version: number; responseHash: string }>;
  readonly actor: Readonly<{ id: string }>;
  readonly content: SigningContent;
}

export interface SignPreparedResponseInput {
  preparation: PreparedResponseSigning;
  assent: Readonly<{ signerName: string; consentAccepted: true }>;
  /** One host-generated UUIDv7 for this act; retries preserve it. */
  operationId: string;
  /** Exact admitted Response Actions artifact and mapped single-effect Action. */
  action: Readonly<{ document: ResponseActionsDocument; artifactRef: string; artifactDigest: string; actionRef: string; requestRef: string }>;
}

export interface SignedResponseSigning extends PreparedResponseSigning {
  /** Server-produced delegated evidence consistency; no claim of local cryptographic verification. */
  readonly verification: Readonly<{ mode: 'delegated-service-key'; provider: string; keyId: string }>;
}

export interface ResponseSigning {
  prepare(input: PrepareResponseSigningInput): Promise<PreparedResponseSigning>;
  sign(input: SignPreparedResponseInput): Promise<SignedResponseSigning>;
}

export class ResponseSigningUnresolvedError extends Error {
  constructor() {
    super('A signing operation is unresolved. Restore its frozen act or explicitly clear this saved draft before starting another act.');
    this.name = 'ResponseSigningUnresolvedError';
  }
}
