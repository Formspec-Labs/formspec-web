import type { RespondentPlaceSnapshot } from '../ports/respondent-place-source.ts';
import type {
  ApplicantStatusProjection,
  ApplicantStatusProjectionKind,
} from '../ports/status-reader.ts';
import { WOS_APPLICANT_SCHEMA_ID } from '../ports/status-reader.ts';

const applicantProjectionKinds = new Set<ApplicantStatusProjectionKind>([
  'ApplicantCaseSummary',
  'ApplicantCaseDetail',
  'ApplicantTaskSummary',
  'ApplicantNotificationListItem',
  'ApplicantStatusTimelineEntry',
]);

const respondentDocumentKinds = new Set([
  'identity-proof',
  'income-proof',
  'proof-of-address',
  'proof-of-age',
  'eligibility-evidence',
  'form-attachment',
  'signed-receipt',
  'correspondence',
  'other',
]);
const obligationStates = new Set([
  'upcoming',
  'due',
  'overdue',
  'submitted',
  'satisfied',
  'closed',
  'unknown',
]);
const storagePostures = new Set(['client-encrypted', 'client-local-only', 'export-snapshot']);
const issuerIsolationModes = new Set(['per-issuer', 'per-program', 'respondent-chosen']);
const presentationDefaults = new Set(['explicit-consent', 'deny-by-default']);
const presentationScopes = new Set(['selected-documents', 'all-documents', 'metadata-only']);
const presentationPurposes = new Set([
  'eligibility',
  'identity-proofing',
  'appeal',
  'renewal',
  'audit',
  'respondent-export',
  'other',
]);
const presentationProtocols = new Set([
  'openid4vp',
  'w3c-vc-data-model-2.0',
  'download',
  'copy-link',
]);
const exportFormats = new Set(['portable-json', 'encrypted-portable-json']);
const exportIncludes = new Set(['documents', 'submissions', 'obligations', 'presentation-policies']);

export function isApplicantStatusProjection(value: unknown): value is ApplicantStatusProjection {
  if (!isRecord(value)) return false;
  return (
    value.sourceSchema === WOS_APPLICANT_SCHEMA_ID &&
    typeof value.projectionKind === 'string' &&
    applicantProjectionKinds.has(value.projectionKind as ApplicantStatusProjectionKind) &&
    typeof value.updatedAt === 'string'
  );
}

export function isRespondentPlaceSnapshot(value: unknown): value is RespondentPlaceSnapshot {
  if (!isRecord(value) || !isRecord(value.subject) || !isRecord(value.trustModel)) {
    return false;
  }
  if (
    value.$formspecRespondentLibrary !== '1.0' ||
    typeof value.version !== 'string' ||
    typeof value.libraryId !== 'string' ||
    value.aggregationMode !== 'client-wallet' ||
    !isRespondentTrustModel(value.trustModel) ||
    typeof value.subject.subjectRef !== 'string' ||
    typeof value.subject.privacyTier !== 'string'
  ) {
    return false;
  }
  if (value.encryption !== undefined && !isEncryptionEnvelope(value.encryption)) {
    return false;
  }
  if (value.export !== undefined && !isExportPackage(value.export)) {
    return false;
  }
  if (Array.isArray(value.obligations) && !value.obligations.every(isRespondentObligation)) {
    return false;
  }
  if (Array.isArray(value.documents) && !value.documents.every(isRespondentDocumentRecord)) {
    return false;
  }
  if (Array.isArray(value.submissions) && !value.submissions.every(isRespondentSubmissionRecord)) {
    return false;
  }
  if (
    Array.isArray(value.presentationPolicies) &&
    !value.presentationPolicies.every(isPresentationPolicy)
  ) {
    return false;
  }
  return true;
}

function isRespondentTrustModel(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.storagePosture === 'string' &&
    storagePostures.has(value.storagePosture) &&
    typeof value.issuerIsolation === 'string' &&
    issuerIsolationModes.has(value.issuerIsolation) &&
    value.serverAggregation === 'forbidden' &&
    typeof value.presentationDefault === 'string' &&
    presentationDefaults.has(value.presentationDefault)
  );
}

function isRespondentObligation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isIssuerRef(value.issuer) &&
    typeof value.title === 'string' &&
    typeof value.state === 'string' &&
    obligationStates.has(value.state)
  );
}

function isRespondentDocumentRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    respondentDocumentKinds.has(value.kind) &&
    typeof value.displayName === 'string' &&
    typeof value.capturedAt === 'string' &&
    isRecord(value.contentRef) &&
    typeof value.contentRef.uri === 'string' &&
    typeof value.contentRef.mediaType === 'string'
  );
}

function isRespondentSubmissionRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    isIssuerRef(value.issuer) &&
    isDefinitionRef(value.definitionRef) &&
    typeof value.submittedAt === 'string' &&
    (value.applicantStatus === undefined || isApplicantStatusProjection(value.applicantStatus))
  );
}

function isPresentationPolicy(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.scope !== 'string') {
    return false;
  }
  if (!presentationScopes.has(value.scope)) {
    return false;
  }
  if (!Array.isArray(value.allowedPurposes) || value.allowedPurposes.length === 0) {
    return false;
  }
  if (!value.allowedPurposes.every((purpose) => (
    typeof purpose === 'string' && presentationPurposes.has(purpose)
  ))) {
    return false;
  }
  if (value.scope === 'selected-documents') {
    return (
      Array.isArray(value.documentRefs) &&
      value.documentRefs.length > 0 &&
      value.documentRefs.every((documentRef) => typeof documentRef === 'string')
    );
  }
  if (value.protocolHints !== undefined) {
    return (
      Array.isArray(value.protocolHints) &&
      value.protocolHints.every((hint) => (
        typeof hint === 'string' && presentationProtocols.has(hint)
      ))
    );
  }
  return true;
}

function isEncryptionEnvelope(value: unknown): boolean {
  if (!isRecord(value) || (value.mode !== 'none' && value.mode !== 'passkey-hpke')) {
    return false;
  }
  if (value.mode === 'passkey-hpke') {
    return (
      (value.keyDerivation === 'passkey-derived' || value.keyDerivation === 'external-key') &&
      typeof value.recipientKeyRef === 'string'
    );
  }
  return true;
}

function isExportPackage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.format === 'string' &&
    exportFormats.has(value.format) &&
    typeof value.createdAt === 'string' &&
    Array.isArray(value.includes) &&
    value.includes.length > 0 &&
    value.includes.every((entry) => typeof entry === 'string' && exportIncludes.has(entry)) &&
    (value.encryption === undefined || isEncryptionEnvelope(value.encryption))
  );
}

function isIssuerRef(value: unknown): boolean {
  return isRecord(value) && typeof value.name === 'string';
}

function isDefinitionRef(value: unknown): boolean {
  return isRecord(value) && typeof value.url === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
