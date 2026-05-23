/**
 * RespondentPlaceSource port — web ADR-0010 respondent-place DI boundary.
 *
 * Mirrors the Formspec Respondent Library sidecar for web consumers. The
 * normative contract lives in formspec/specs/respondent-library/library-spec.md.
 */

import type { WOS_APPLICANT_SCHEMA_ID } from './status-reader.ts';

export type RespondentPrivacyTier = 'anonymous' | 'pseudonymous' | 'verified';
export type RespondentAggregationMode = 'client-wallet';
export type ServerAggregationMode = 'forbidden';
export type StoragePosture = 'client-encrypted' | 'client-local-only' | 'export-snapshot';
export type IssuerIsolation = 'per-issuer' | 'per-program' | 'respondent-chosen';
export type PresentationDefault = 'explicit-consent' | 'deny-by-default';
export type ObligationState =
  | 'upcoming'
  | 'due'
  | 'overdue'
  | 'submitted'
  | 'satisfied'
  | 'closed'
  | 'unknown';
export type RespondentDocumentKind =
  | 'identity-proof'
  | 'income-proof'
  | 'proof-of-address'
  | 'proof-of-age'
  | 'eligibility-evidence'
  | 'form-attachment'
  | 'signed-receipt'
  | 'correspondence'
  | 'other';
export type PresentationScope = 'selected-documents' | 'all-documents' | 'metadata-only';
export type PresentationPurpose =
  | 'eligibility'
  | 'identity-proofing'
  | 'appeal'
  | 'renewal'
  | 'audit'
  | 'respondent-export'
  | 'other';
export type PresentationProtocolHint =
  | 'openid4vp'
  | 'w3c-vc-data-model-2.0'
  | 'download'
  | 'copy-link';

export type ApplicantStatusProjectionKind =
  | 'ApplicantCaseSummary'
  | 'ApplicantCaseDetail'
  | 'ApplicantTaskSummary'
  | 'ApplicantNotificationListItem'
  | 'ApplicantStatusTimelineEntry';

export interface ApplicantStatusProjection {
  sourceSchema: typeof WOS_APPLICANT_SCHEMA_ID;
  projectionKind: ApplicantStatusProjectionKind;
  resourceRef?: string;
  endpoint?: string;
  updatedAt: string;
  headline?: string;
  summary?: string;
  payloadDigest?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentSubjectBinding {
  subjectRef: string;
  privacyTier: RespondentPrivacyTier;
  assuranceRef?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentIssuerRef {
  name: string;
  url?: string;
  identifier?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentDefinitionRef {
  url: string;
  version?: string;
}

export interface RespondentObligation {
  id: string;
  issuer: RespondentIssuerRef;
  title: string;
  description?: string;
  state: ObligationState;
  dueAt?: string;
  formRef?: RespondentDefinitionRef;
  submissionRef?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentContentRef {
  uri: string;
  mediaType: string;
  sha256?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentDocumentRecord {
  id: string;
  kind: RespondentDocumentKind;
  displayName: string;
  issuer?: RespondentIssuerRef;
  capturedAt: string;
  expiresAt?: string;
  contentRef: RespondentContentRef;
  sourceSubmissionRef?: string;
  presentationPolicyRef?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentSubmissionRecord {
  id: string;
  issuer: RespondentIssuerRef;
  definitionRef: RespondentDefinitionRef;
  submittedAt: string;
  applicantStatus?: ApplicantStatusProjection;
  receiptRef?: string;
  documentRefs?: string[];
  extensions?: RespondentExtensions;
}

export interface RespondentPresentationPolicy {
  id: string;
  scope: PresentationScope;
  documentRefs?: string[];
  allowedPurposes: PresentationPurpose[];
  recipientIssuer?: RespondentIssuerRef;
  protocolHints?: PresentationProtocolHint[];
  expiresAt?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentTrustModel {
  storagePosture: StoragePosture;
  issuerIsolation: IssuerIsolation;
  serverAggregation: ServerAggregationMode;
  presentationDefault: PresentationDefault;
  extensions?: RespondentExtensions;
}

export interface RespondentEncryptionEnvelope {
  mode: 'none' | 'passkey-hpke';
  keyDerivation?: 'passkey-derived' | 'external-key';
  recipientKeyRef?: string;
  cipherSuite?: string;
  extensions?: RespondentExtensions;
}

export interface RespondentExportPackage {
  id: string;
  format: 'portable-json' | 'encrypted-portable-json';
  createdAt: string;
  includes: Array<'documents' | 'submissions' | 'obligations' | 'presentation-policies'>;
  encryption?: RespondentEncryptionEnvelope;
  extensions?: RespondentExtensions;
}

export interface RespondentPlaceSnapshot {
  $formspecRespondentLibrary: '1.0';
  version: string;
  libraryId: string;
  subject: RespondentSubjectBinding;
  aggregationMode: RespondentAggregationMode;
  trustModel: RespondentTrustModel;
  encryption?: RespondentEncryptionEnvelope;
  obligations?: RespondentObligation[];
  documents?: RespondentDocumentRecord[];
  submissions?: RespondentSubmissionRecord[];
  presentationPolicies?: RespondentPresentationPolicy[];
  export?: RespondentExportPackage;
  extensions?: RespondentExtensions;
}

export interface RespondentPlaceQuery {
  subjectRef?: string;
  issuerUrls?: string[];
}

export interface RespondentPlaceSource {
  readPlace(query: RespondentPlaceQuery): Promise<RespondentPlaceSnapshot>;
}

export type RespondentExtensions = Record<`x-${string}`, unknown>;
