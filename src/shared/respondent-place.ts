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
    value.trustModel.serverAggregation !== 'forbidden' ||
    typeof value.subject.subjectRef !== 'string'
  ) {
    return false;
  }
  if (Array.isArray(value.documents) && !value.documents.every(isRespondentDocumentRecord)) {
    return false;
  }
  if (Array.isArray(value.submissions) && !value.submissions.every(isRespondentSubmissionRecord)) {
    return false;
  }
  return true;
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
    isRecord(value.issuer) &&
    isRecord(value.definitionRef) &&
    typeof value.submittedAt === 'string' &&
    (value.applicantStatus === undefined || isApplicantStatusProjection(value.applicantStatus))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
