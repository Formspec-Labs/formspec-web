import type { WosResourceUrn } from './status-reader.ts';

/**
 * LifecycleActionClient port - FW-0038 / FW-0034.
 *
 * The respondent-facing vocabulary is intentionally small and distinct:
 * `correct`, `withdraw`, and `dispute`. Adapters may route a `correct`
 * action to a substrate correction or amendment, but the React shell does
 * not expose upstream event names or WOS kernel tokens to respondents.
 *
 * Production adapters are adopter-side until EXT-5 / EXT-35 / XS-5 harden.
 * The OSS reference composition wires the unavailable sentinel; the demo
 * composition wires an in-memory stub for the `/status` surface.
 */

export type LifecycleActionKind = 'correct' | 'withdraw' | 'dispute';

export type LifecycleActionWindow =
  | { readonly state: 'open' }
  | { readonly state: 'closes-at'; readonly closesAt: string }
  | { readonly state: 'closed'; readonly closedAt?: string };

export interface LifecycleActionAvailability {
  readonly action: LifecycleActionKind;
  readonly enabled: boolean;
  readonly window?: LifecycleActionWindow;
  readonly disabledReason?: string;
  readonly correctableFieldSet?: readonly string[];
  readonly requiresReason?: boolean;
  readonly requiresEvidence?: boolean;
  readonly signerOnly?: boolean;
  readonly partyScope?: 'any-party' | 'all-parties-must-agree';
}

export type LifecycleEventKind =
  | 'original-submission'
  | 'correction'
  | 'withdrawal'
  | 'dispute'
  | 'consent-revocation';

export interface LifecycleProtectedText {
  readonly text: string;
  /**
   * Omitted / `unclassified` renders openly. `safe-*` classes render masked
   * on public receipt/status/verifier surfaces per FW-0060.
   */
  readonly accessClass?: string;
}

export interface LifecycleChangedField {
  readonly path: string;
  readonly label: string;
  readonly originalValue?: LifecycleProtectedText;
  readonly correctedValue?: LifecycleProtectedText;
}

export interface LifecycleTimelineBase {
  readonly kind: LifecycleEventKind;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly verified: boolean;
  readonly actorLabel?: string;
  readonly partyRef?: string;
}

export interface OriginalSubmissionLifecycleEvent extends LifecycleTimelineBase {
  readonly kind: 'original-submission';
  readonly title: string;
}

export interface CorrectionLifecycleEvent extends LifecycleTimelineBase {
  readonly kind: 'correction';
  readonly recordedAs: 'correction' | 'amendment';
  readonly changedFields: readonly LifecycleChangedField[];
  readonly reason?: LifecycleProtectedText;
  readonly evidenceRefs?: readonly string[];
}

export interface WithdrawalLifecycleEvent extends LifecycleTimelineBase {
  readonly kind: 'withdrawal';
  readonly reason?: LifecycleProtectedText;
  readonly rescissionRequested?: boolean;
  readonly requiresIssuerAcceptance?: boolean;
}

export interface DisputeLifecycleEvent extends LifecycleTimelineBase {
  readonly kind: 'dispute';
  readonly disputedEventId?: string;
  readonly statement?: LifecycleProtectedText;
}

export interface ConsentRevocationLifecycleEvent extends LifecycleTimelineBase {
  readonly kind: 'consent-revocation';
  readonly consentRef?: string;
  readonly reason?: LifecycleProtectedText;
}

export type LifecycleTimelineEvent =
  | OriginalSubmissionLifecycleEvent
  | CorrectionLifecycleEvent
  | WithdrawalLifecycleEvent
  | DisputeLifecycleEvent
  | ConsentRevocationLifecycleEvent;

export interface LifecycleActionSnapshot {
  readonly caseUrn: WosResourceUrn;
  readonly actions: readonly LifecycleActionAvailability[];
  readonly events: readonly LifecycleTimelineEvent[];
  readonly updatedAt?: string;
}

export interface LifecycleActionRequest {
  readonly caseUrn: WosResourceUrn;
  readonly actorRef?: string;
  readonly partyRef?: string;
}

export interface LifecycleCorrectionRequest extends LifecycleActionRequest {
  readonly changedFields: readonly LifecycleChangedField[];
  readonly correctableFieldSet?: readonly string[];
  readonly caseDecisionReached?: boolean;
  readonly reason?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface LifecycleWithdrawalRequest extends LifecycleActionRequest {
  readonly reason?: string;
  readonly rescissionRequested?: boolean;
  readonly partyScope?: 'any-party' | 'all-parties-must-agree';
  readonly allPartiesApproved?: boolean;
}

export interface LifecycleDisputeRequest extends LifecycleActionRequest {
  readonly disputedEventId?: string;
  readonly statement: string;
}

export interface LifecycleActionReceipt {
  readonly action: LifecycleActionKind;
  readonly event: LifecycleTimelineEvent;
  readonly snapshot: LifecycleActionSnapshot;
  readonly supportRef?: string;
}

export interface LifecycleActionClient {
  readLifecycle(request: LifecycleActionRequest): Promise<LifecycleActionSnapshot | undefined>;

  submitCorrection(
    request: LifecycleCorrectionRequest,
    idempotencyKey: string,
  ): Promise<LifecycleActionReceipt>;

  submitWithdrawal(
    request: LifecycleWithdrawalRequest,
    idempotencyKey: string,
  ): Promise<LifecycleActionReceipt>;

  submitDispute(
    request: LifecycleDisputeRequest,
    idempotencyKey: string,
  ): Promise<LifecycleActionReceipt>;
}
