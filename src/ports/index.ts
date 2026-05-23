/**
 * MVP port surface per web ADR-0009 §MVP port inventory.
 *
 * Five ports total. Issuer resolution is engine-owned (formspec-engine
 * IssuerStore); composition wires a FetchIssuerFetcher, not a port.
 * Post-MVP ports are ratified per-port when consumer code lands. ADR-0010
 * adds respondent-place ports for stub-backed consumer surfaces.
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
  ApplicantStatusResource,
  ApplicantCaseSummary,
  ApplicantCaseDetail,
  ApplicantTaskSummary,
  ApplicantNotificationListItem,
  ApplicantStatusTimelineEntry,
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
