import type {
  ApplicantAgentSummary,
  ApplicantAiInvolvementSummary,
  ApplicantCaseDetail,
  ApplicantCaseSummary,
  ApplicantCaseSummaryPage,
  ApplicantNotificationListItem,
  ApplicantNotificationPage,
  ApplicantStatusResource,
  ApplicantStatusTimelineEntry,
  ApplicantTaskPage,
  ApplicantTaskSummary,
} from '../ports/status-reader.ts';
import type {
  ApplicantStatusProjection,
  ApplicantStatusProjectionKind,
  RespondentPlaceSnapshot,
} from '../ports/respondent-place-source.ts';
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
const privacyTiers = new Set(['anonymous', 'pseudonymous', 'verified']);
const lifecycleStates = new Set([
  'active',
  'suspended',
  'migrating',
  'completed',
  'terminated',
  'stalled',
]);
const taskKinds = new Set(['intake', 'correspondence-response', 'signature', 'verification']);
const taskStatuses = new Set(['pending', 'drafted', 'submitted', 'dismissed', 'expired']);
const notificationKinds = new Set([
  'task-assigned',
  'task-deadline-approaching',
  'case-update',
  'correspondence-received',
  'decision-reached',
]);
const notificationStatuses = new Set(['unread', 'read', 'archived']);
const timelineEvents = new Set([
  'case-created',
  'lifecycle-changed',
  'applicant-task-assigned',
  'applicant-task-submitted',
  'decision-reached',
  'correspondence-sent',
  'correspondence-received',
]);
const agentRoles = new Set(['advisory', 'primary', 'fallback']);

export function isApplicantStatusProjection(value: unknown): value is ApplicantStatusProjection {
  if (!isRecord(value)) return false;
  return (
    value.sourceSchema === WOS_APPLICANT_SCHEMA_ID &&
    typeof value.projectionKind === 'string' &&
    applicantProjectionKinds.has(value.projectionKind as ApplicantStatusProjectionKind) &&
    typeof value.updatedAt === 'string'
  );
}

export function isApplicantStatusResource(value: unknown): value is ApplicantStatusResource {
  return (
    isApplicantCaseDetail(value) ||
    isApplicantCaseSummaryPage(value) ||
    isApplicantTaskPage(value) ||
    isApplicantNotificationPage(value) ||
    isApplicantCaseSummary(value) ||
    isApplicantTaskSummary(value) ||
    isApplicantNotificationListItem(value) ||
    isApplicantStatusTimelineEntry(value) ||
    isApplicantAiInvolvementSummary(value) ||
    isApplicantAgentSummary(value)
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
    typeof value.subject.privacyTier !== 'string' ||
    !privacyTiers.has(value.subject.privacyTier)
  ) {
    return false;
  }
  if (value.encryption !== undefined && !isEncryptionEnvelope(value.encryption)) {
    return false;
  }
  if (value.export !== undefined && !isExportPackage(value.export)) {
    return false;
  }
  if (!isOptionalArray(value.obligations, isRespondentObligation)) {
    return false;
  }
  if (!isOptionalArray(value.documents, isRespondentDocumentRecord)) {
    return false;
  }
  if (!isOptionalArray(value.submissions, isRespondentSubmissionRecord)) {
    return false;
  }
  if (
    !isOptionalArray(value.presentationPolicies, isPresentationPolicy)
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
  if (value.protocolHints !== undefined) {
    if (
      !Array.isArray(value.protocolHints) ||
      !value.protocolHints.every((hint) => (
        typeof hint === 'string' && presentationProtocols.has(hint)
      ))
    ) {
      return false;
    }
  }
  if (value.recipientIssuer !== undefined && !isIssuerRef(value.recipientIssuer)) {
    return false;
  }
  if (value.scope === 'selected-documents') {
    return (
      Array.isArray(value.documentRefs) &&
      value.documentRefs.length > 0 &&
      value.documentRefs.every((documentRef) => typeof documentRef === 'string')
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

function isApplicantCaseDetail(value: unknown): value is ApplicantCaseDetail {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['summary', 'openTasks', 'recentNotifications', 'statusTimeline', 'aiInvolvement']) &&
    isApplicantCaseSummary(value.summary) &&
    Array.isArray(value.openTasks) &&
    value.openTasks.every(isApplicantTaskSummary) &&
    Array.isArray(value.recentNotifications) &&
    value.recentNotifications.every(isApplicantNotificationListItem) &&
    Array.isArray(value.statusTimeline) &&
    value.statusTimeline.every(isApplicantStatusTimelineEntry) &&
    (value.aiInvolvement === undefined || isApplicantAiInvolvementSummary(value.aiInvolvement))
  );
}

function isApplicantCaseSummary(value: unknown): value is ApplicantCaseSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'workflowUrl',
      'lifecycleState',
      'actionNeeded',
      'title',
      'continuationOfServicesActive',
      'continuationOfServicesEndsAt',
      'createdAt',
      'updatedAt',
    ]) &&
    typeof value.id === 'string' &&
    typeof value.workflowUrl === 'string' &&
    typeof value.lifecycleState === 'string' &&
    lifecycleStates.has(value.lifecycleState) &&
    typeof value.actionNeeded === 'boolean' &&
    (value.title === undefined || typeof value.title === 'string') &&
    (
      value.continuationOfServicesActive === undefined ||
      typeof value.continuationOfServicesActive === 'boolean'
    ) &&
    (
      value.continuationOfServicesEndsAt === undefined ||
      typeof value.continuationOfServicesEndsAt === 'string'
    ) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isApplicantCaseSummaryPage(value: unknown): value is ApplicantCaseSummaryPage {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['items', 'cursor', 'hasMore']) &&
    Array.isArray(value.items) &&
    value.items.every(isApplicantCaseSummary) &&
    (value.cursor === undefined || typeof value.cursor === 'string') &&
    typeof value.hasMore === 'boolean'
  );
}

function isApplicantTaskSummary(value: unknown): value is ApplicantTaskSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'processId',
      'kind',
      'status',
      'title',
      'deadline',
      'createdAt',
      'updatedAt',
    ]) &&
    typeof value.id === 'string' &&
    typeof value.processId === 'string' &&
    typeof value.kind === 'string' &&
    isReservedOrExtension(value.kind, taskKinds) &&
    typeof value.status === 'string' &&
    isReservedOrExtension(value.status, taskStatuses) &&
    typeof value.title === 'string' &&
    (value.deadline === undefined || typeof value.deadline === 'string') &&
    typeof value.createdAt === 'string'
    && (value.updatedAt === undefined || typeof value.updatedAt === 'string')
  );
}

function isApplicantTaskPage(value: unknown): value is ApplicantTaskPage {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['items', 'cursor', 'hasMore']) &&
    Array.isArray(value.items) &&
    value.items.every(isApplicantTaskSummary) &&
    (value.cursor === undefined || typeof value.cursor === 'string') &&
    typeof value.hasMore === 'boolean'
  );
}

function isApplicantNotificationListItem(value: unknown): value is ApplicantNotificationListItem {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'kind',
      'status',
      'title',
      'body',
      'processId',
      'taskId',
      'createdAt',
      'readAt',
    ]) &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    isReservedOrExtension(value.kind, notificationKinds) &&
    typeof value.status === 'string' &&
    notificationStatuses.has(value.status) &&
    typeof value.title === 'string' &&
    typeof value.body === 'string' &&
    (value.processId === undefined || typeof value.processId === 'string') &&
    (value.taskId === undefined || typeof value.taskId === 'string') &&
    typeof value.createdAt === 'string' &&
    (value.readAt === undefined || typeof value.readAt === 'string')
  );
}

function isApplicantNotificationPage(value: unknown): value is ApplicantNotificationPage {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['items', 'cursor', 'hasMore']) &&
    Array.isArray(value.items) &&
    value.items.every(isApplicantNotificationListItem) &&
    (value.cursor === undefined || typeof value.cursor === 'string') &&
    typeof value.hasMore === 'boolean'
  );
}

function isApplicantStatusTimelineEntry(value: unknown): value is ApplicantStatusTimelineEntry {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['event', 'occurredAt', 'summary', 'newLifecycleState', 'taskId']) &&
    typeof value.event === 'string' &&
    isReservedOrExtension(value.event, timelineEvents) &&
    typeof value.occurredAt === 'string' &&
    (value.summary === undefined || typeof value.summary === 'string') &&
    (
      value.newLifecycleState === undefined ||
      (typeof value.newLifecycleState === 'string' && lifecycleStates.has(value.newLifecycleState))
    ) &&
    (value.taskId === undefined || typeof value.taskId === 'string')
  );
}

function isApplicantAiInvolvementSummary(value: unknown): value is ApplicantAiInvolvementSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'agentsInvolved',
      'narrativeRecordCount',
      'humanReviewedAllAgentDecisions',
    ]) &&
    Array.isArray(value.agentsInvolved) &&
    value.agentsInvolved.every(isApplicantAgentSummary) &&
    typeof value.narrativeRecordCount === 'number' &&
    Number.isInteger(value.narrativeRecordCount) &&
    value.narrativeRecordCount >= 0 &&
    typeof value.humanReviewedAllAgentDecisions === 'boolean'
  );
}

function isApplicantAgentSummary(value: unknown): value is ApplicantAgentSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['displayName', 'roleInDecision', 'confidence']) &&
    typeof value.displayName === 'string' &&
    typeof value.roleInDecision === 'string' &&
    agentRoles.has(value.roleInDecision) &&
    (
      value.confidence === undefined ||
      (typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1)
    )
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

function isReservedOrExtension(value: string, reserved: Set<string>): boolean {
  return reserved.has(value) || /^x-[a-z][a-z0-9-]*$/.test(value);
}

function isOptionalArray(
  value: unknown,
  itemGuard: (item: unknown) => boolean,
): boolean {
  return value === undefined || (Array.isArray(value) && value.every(itemGuard));
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
