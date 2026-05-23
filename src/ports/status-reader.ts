/**
 * StatusReader port — web ADR-0010 respondent-place DI boundary.
 *
 * Returns WOS applicant API resource shapes. The status vocabulary is owned by
 * work-spec's applicant API, not formspec-web.
 */

export const WOS_APPLICANT_SCHEMA_ID = 'https://schemas.formspec.io/wos-api/applicant/v1' as const;

export type WosResourceUrn = string;
export type WorkflowUrl = string;

export type ApplicantLifecycleState =
  | 'active'
  | 'suspended'
  | 'migrating'
  | 'completed'
  | 'terminated'
  | 'stalled';

export type ApplicantTaskKind =
  | 'intake'
  | 'correspondence-response'
  | 'signature'
  | 'verification'
  | `x-${string}`;

export type ApplicantTaskStatus =
  | 'pending'
  | 'drafted'
  | 'submitted'
  | 'dismissed'
  | 'expired'
  | `x-${string}`;

export type ApplicantNotificationKind =
  | 'task-assigned'
  | 'task-deadline-approaching'
  | 'case-update'
  | 'correspondence-received'
  | 'decision-reached'
  | `x-${string}`;

export type ApplicantNotificationStatus = 'unread' | 'read' | 'archived';

export type ApplicantTimelineEvent =
  | 'case-created'
  | 'lifecycle-changed'
  | 'applicant-task-assigned'
  | 'applicant-task-submitted'
  | 'decision-reached'
  | 'correspondence-sent'
  | 'correspondence-received'
  | `x-${string}`;

export interface ApplicantTaskSummary {
  id: WosResourceUrn;
  processId: WosResourceUrn;
  kind: ApplicantTaskKind;
  status: ApplicantTaskStatus;
  title: string;
  deadline?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ApplicantNotificationListItem {
  id: WosResourceUrn;
  kind: ApplicantNotificationKind;
  status: ApplicantNotificationStatus;
  title: string;
  body: string;
  processId?: WosResourceUrn;
  taskId?: WosResourceUrn;
  createdAt: string;
  readAt?: string;
}

export interface ApplicantAgentSummary {
  displayName: string;
  roleInDecision: 'advisory' | 'primary' | 'fallback';
  confidence?: number;
}

export interface ApplicantAiInvolvementSummary {
  agentsInvolved: ApplicantAgentSummary[];
  narrativeRecordCount: number;
  humanReviewedAllAgentDecisions: boolean;
}

export interface ApplicantStatusTimelineEntry {
  event: ApplicantTimelineEvent;
  occurredAt: string;
  summary?: string;
  newLifecycleState?: ApplicantLifecycleState;
  taskId?: WosResourceUrn;
}

export interface ApplicantCaseSummary {
  id: WosResourceUrn;
  workflowUrl: WorkflowUrl;
  lifecycleState: ApplicantLifecycleState;
  actionNeeded: boolean;
  title?: string;
  continuationOfServicesActive?: boolean;
  continuationOfServicesEndsAt?: string | 'never';
  createdAt: string;
  updatedAt: string;
}

export interface ApplicantCaseDetail {
  summary: ApplicantCaseSummary;
  openTasks: ApplicantTaskSummary[];
  recentNotifications: ApplicantNotificationListItem[];
  statusTimeline: ApplicantStatusTimelineEntry[];
  aiInvolvement?: ApplicantAiInvolvementSummary;
}

export interface ApplicantCaseSummaryPage {
  items: ApplicantCaseSummary[];
  cursor?: string;
  hasMore: boolean;
}

export interface ApplicantTaskPage {
  items: ApplicantTaskSummary[];
  cursor?: string;
  hasMore: boolean;
}

export interface ApplicantNotificationPage {
  items: ApplicantNotificationListItem[];
  cursor?: string;
  hasMore: boolean;
}

export type ApplicantStatusResource =
  | ApplicantCaseSummary
  | ApplicantCaseDetail
  | ApplicantCaseSummaryPage
  | ApplicantTaskSummary
  | ApplicantTaskPage
  | ApplicantNotificationListItem
  | ApplicantNotificationPage
  | ApplicantStatusTimelineEntry
  | ApplicantAiInvolvementSummary
  | ApplicantAgentSummary;

export interface StatusRequest {
  subjectRef?: string;
  submissionId?: string;
  resourceRef?: string;
  trackingUri?: string;
}

export interface StatusReader {
  readStatus(request: StatusRequest): Promise<ApplicantStatusResource | undefined>;
}
