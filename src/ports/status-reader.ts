/**
 * StatusReader port — web ADR-0010 respondent-place DI boundary.
 *
 * Returns a WOS applicant API projection reference/cache. The status
 * vocabulary is owned by work-spec's applicant API, not formspec-web.
 */

export const WOS_APPLICANT_SCHEMA_ID = 'https://schemas.formspec.io/wos-api/applicant/v1' as const;

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
  extensions?: Record<`x-${string}`, unknown>;
}

export interface StatusRequest {
  subjectRef?: string;
  submissionId?: string;
  resourceRef?: string;
  trackingUri?: string;
}

export interface StatusReader {
  readStatus(request: StatusRequest): Promise<ApplicantStatusProjection | undefined>;
}
