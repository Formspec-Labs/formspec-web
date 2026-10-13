import type { SavedResponseDraft } from './response-signing.ts';

/** Exact public Source selection; all values come from operator-qualified publication pins. */
export interface ScreenerSelection {
  readonly evaluationSelection: {
    readonly scope: SourceScope;
    readonly formId: string;
    readonly formVersionId: string;
    readonly definitionUrl: string;
    readonly definitionVersion: string;
    readonly definitionHash: string;
    readonly requiredSources: readonly string[];
  };
  readonly formVersionHash: string;
  readonly sourceRef: string;
  readonly screenerUrl: string;
  readonly screenerVersion: string;
  readonly screenerRawHash: string;
  readonly screenerHash: string;
  readonly allowedTargets: readonly string[];
  readonly qualificationProfile: 'flat-first-match-v1';
  /** Original Source mapping policy pin, when selected before proof issuance. Absence stays absent. */
  readonly instanceMappingHash?: string;
}
export interface SourceScope {
  readonly tenant_id: string;
  readonly workspace_id: string;
  readonly environment_id: string;
  readonly cell_id: string;
}
/** Source assigns these opaque identifiers. Browser OIDC subjects are not aliases for them. */
export interface ScreenerOwner {
  readonly sessionId: string;
  readonly subjectRef: string;
  readonly authenticated: {
    readonly issuer: string;
    readonly subject: string;
    readonly principalId: string;
    readonly profile: string;
    readonly actorRef: string;
    readonly subjectRef: string;
    readonly sessionId: string;
    readonly clientId: string | null;
  };
}
export type ScreenerAnswer = { readonly state: 'answered'; readonly value: string | number | boolean }
  | { readonly state: 'declined' | 'not-presented'; readonly value: null };
export type ScreenerQualification = { readonly status: 'ready'; readonly target: string }
  | { readonly status: 'pending'; readonly reason: string };
export interface RetainedScreenerRun {
  readonly version: 1;
  readonly scope: SourceScope;
  readonly runId: string;
  readonly revision: number;
  readonly selectionHash: string;
  readonly owner: ScreenerOwner;
  readonly answers: Readonly<Record<string, ScreenerAnswer>>;
  readonly answersHash: string;
  readonly evaluatedAt: string;
  readonly determination: Readonly<Record<string, unknown>>;
  readonly determinationHash: string;
  readonly qualification: ScreenerQualification;
  readonly evidenceRef: string;
  readonly evidenceHash: string;
}
export interface ScreenerRunView {
  readonly version: 1;
  readonly purpose: 'formspec.screener.run';
  readonly selection: ScreenerSelection;
  readonly run: RetainedScreenerRun;
  readonly acceptance: { readonly checkedAt: string; readonly qualification: ScreenerQualification } | null;
}
export interface ScreenerAssociation {
  readonly scope: SourceScope;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly candidateHash: string;
  readonly selectionHash: string;
  readonly owner: ScreenerOwner;
  readonly runId: string;
  readonly runRevision: number;
  readonly evidenceHash: string;
  readonly associatedAt: string;
}
export interface ScreenerOperationContext {
  /** Current authenticated browser identity, frozen for this operation by the host. */
  readonly identity: { readonly issuer: string; readonly subject: string; readonly clientId: string | null };
  readonly signal: AbortSignal;
  /** Must fence owner/session revision, publication, route and engine generation. */
  readonly assertCurrent: () => void;
}
export interface RetainScreenerCompletion extends ScreenerOperationContext {
  readonly completionId: string;
  readonly document: Readonly<Record<string, unknown>>;
  readonly screenerRef: { readonly url: string; readonly version: string };
  readonly answers: Readonly<Record<string, string | number | boolean>>;
  readonly target: string;
}
export interface AssociateScreenerCandidate extends ScreenerOperationContext {
  readonly run: ScreenerRunView;
  /** Result of the maintained authenticated save and custody checks. */
  readonly saved: SavedResponseDraft;
}
export interface AssociateRecovery extends ScreenerOperationContext {
  readonly saved: SavedResponseDraft;
}
export interface RefreshScreenerRun extends ScreenerOperationContext {
  /** Exact port-issued history. Refresh preserves its original answers and owner. */
  readonly run: ScreenerRunView;
}
/** Retention only. This port never turns a target into eligibility or an instance value. */
export interface ScreenerRetention {
  retain(request: RetainScreenerCompletion): Promise<ScreenerRunView>;
  recover?(request: AssociateRecovery): Promise<ScreenerRunView>;
  refresh?(request: RefreshScreenerRun): Promise<ScreenerRunView>;
  load?(request: RefreshScreenerRun): Promise<ScreenerRunView>;
  associate(request: AssociateScreenerCandidate): Promise<ScreenerAssociation>;
}

/** Source-owned explicit run selector; the command grants no evaluation authority. */
export interface NativeCurrentCheck {
  readonly selectionHash: string;
  readonly runId: string;
  readonly runRevision: number;
}
