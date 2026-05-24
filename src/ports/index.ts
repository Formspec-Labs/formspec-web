/**
 * Port surface per web ADR-0009 and ADR-0010.
 *
 * The MVP inventory remains DefinitionSource, DraftStore, SubmitTransport,
 * IdentityProvider, and NotificationDelivery. Issuer resolution is engine-owned
 * (formspec-engine IssuerStore); composition wires a FetchIssuerFetcher, not a
 * port. ADR-0010 ratifies RespondentPlaceSource and StatusReader as active
 * respondent-place consumer ports.
 */

export type { DefinitionSource, FormDefinition } from './definition-source.ts';
export type { DraftStore, DraftKey, FormResponse } from './draft-store.ts';
export type { SubmitTransport, IntakeHandoff, SubmitConfirmation } from './submit-transport.ts';
export type {
  IdentityProvider,
  IdentityClaim,
  IdpOption,
  AssuranceLevel,
  Unsubscribe,
} from './identity-provider.ts';
export type {
  NotificationDelivery,
  NotificationMessage,
  NotificationChannel,
} from './notification-delivery.ts';
export type {
  StatusReader,
  StatusRequest,
  ApplicantAgentSummary,
  ApplicantAiInvolvementSummary,
  ApplicantStatusResource,
  ApplicantCaseSummary,
  ApplicantCaseDetail,
  ApplicantTaskSummary,
  ApplicantNotificationListItem,
  ApplicantStatusTimelineEntry,
  ApplicantTimelineEvent,
  WosResourceUrn,
} from './status-reader.ts';
export { WOS_APPLICANT_SCHEMA_ID } from './status-reader.ts';
export type {
  ApplicantStatusProjection,
  ApplicantStatusProjectionKind,
  RespondentPlaceSource,
  RespondentPlaceQuery,
  RespondentPlaceSnapshot,
  RespondentSubjectBinding,
  RespondentIssuerRef,
  RespondentDefinitionRef,
  RespondentObligation,
  RespondentDocumentRecord,
  RespondentSubmissionRecord,
  RespondentPresentationPolicy,
  RespondentTrustModel,
  RespondentDocumentKind,
} from './respondent-place-source.ts';
export type {
  AttachmentStore,
  AttachmentRef,
  AttachmentUploadMetadata,
} from './attachment-store.ts';
export { AttachmentUploadError } from './attachment-store.ts';
