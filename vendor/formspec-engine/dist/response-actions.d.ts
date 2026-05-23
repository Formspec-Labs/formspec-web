/** @filedesc Response Actions resolution helpers for renderers and hosts. */
import type { Action as ResponseAction, EffectRequest, Precondition, ResponseActionsDocument, ValidationOverride, ValidationProfile } from '@formspec-org/types';
export type { ResponseAction, ResponseActionsDocument, ValidationOverride as ResponseActionValidationTuple, };
export type StandardResponseActionIntent = 'save-draft' | 'autosave' | 'review' | 'submit' | 'request-evidence';
export interface ResponseActionsDocumentInput {
    actions?: ResponseAction[];
    [key: string]: unknown;
}
export interface ActionRefFinding {
    code: 'COMP-REFERENTIAL-INTEGRITY';
    severity: 'error';
    kind: 'actionRef';
    nodeId?: string;
    target: string;
    reason?: 'missing-actionRef' | 'no-response-actions-document' | 'missing-submit-action';
}
export interface ActionResolution {
    resolved: boolean;
    action: ResponseAction | null;
    finding?: ActionRefFinding;
}
export interface ResponseActionSubmitOptions {
    profile: ValidationProfile;
    validationTuple: ValidationOverride;
    emitEvent?: boolean;
}
export type ResponseActionPreconditionResult = boolean | {
    passed: boolean;
    reason?: string;
};
export type ResponseActionEffectStatus = 'succeeded' | 'failed' | 'deferred' | 'replayed' | 'not-invoked';
export interface ResponseActionEffectOutcome {
    type: EffectRequest['type'];
    status: ResponseActionEffectStatus;
    idempotencyKey?: string;
    outcomeRef?: string;
    reason?: string;
    replayToken?: string;
}
export interface ResponseActionIdempotencyKeyContext {
    effectIndex: number;
}
export interface ResponseActionEffectDispatchContext {
    effectIndex: number;
    attempt: number;
    idempotencyKey?: string;
}
/**
 * §11.3 / Ledger §8.5 published lifecycle event kinds. Authors MUST NOT
 * declare these as ledgerAppend effects; processors emit them outside the
 * declared effect chain.
 */
export type ResponseActionLifecycleKind = 'action.invoked' | 'action.failed' | 'action.deferred' | 'action.replayed';
/**
 * Payload bound to the four action.* lifecycle kinds. Schema-pinned shape:
 * respondent-ledger-event.schema.json#/$defs/ActionEventPayload owns the
 * authoritative byte form for Ledger storage; this TS shape mirrors the
 * fields the engine can deterministically supply from invocation state.
 * Hosts that persist to the Ledger MUST round-trip the payload through the
 * canonical schema before commit.
 */
export interface ResponseActionLifecyclePayload {
    /** Action.id from the Response Actions document. */
    actionId: string;
    /** Stable invocation identifier. */
    invocationId: string;
    /** 1 on first attempt; 2 on retry-once. */
    attempt: number;
    /** Present on action.failed and action.deferred. */
    terminal?: 'failed' | 'deferred' | 'replayed';
    /** Present on action.failed and action.deferred when an effect is the proximate cause. */
    effectIndex?: number;
    /** Present on action.deferred. */
    replayTokenRef?: string;
    /** Present on action.replayed. */
    priorInvocationRef?: string;
    /** Optional structured failure/deferral cause reference. */
    causeRef?: string;
}
/**
 * Optional invocation-scope context the host supplies once per
 * invokeResponseAction call. The engine uses `invocationId` and
 * `priorInvocationRef` (when present) to fill the lifecycle payload —
 * `priorInvocationRef` signals an action.replayed continuation.
 */
export interface ResponseActionInvocationContext {
    /** Stable invocation identifier; host-generated. Defaults to a synthesized id. */
    invocationId?: string;
    /** When set, marks the invocation as a replay of a prior invocation. */
    priorInvocationRef?: string;
}
export interface ResponseActionInvocationPorts<TDetail> {
    submit: (options: ResponseActionSubmitOptions) => TDetail | null;
    dispatchHostEvent: (eventName: string, detail: TDetail, action: ResponseAction) => void;
    dispatchEffect?: (effect: EffectRequest, detail: TDetail, action: ResponseAction, context: ResponseActionEffectDispatchContext) => ResponseActionEffectOutcome | void;
    resolveIdempotencyKey?: (effect: EffectRequest, action: ResponseAction, context: ResponseActionIdempotencyKeyContext) => string;
    evaluatePrecondition?: (precondition: Precondition, action: ResponseAction) => ResponseActionPreconditionResult;
    validationReportValid?: (detail: TDetail) => boolean | null | undefined;
    /**
     * Optional recorder for the four §11.3 / Ledger §8.5 action.* lifecycle
     * kinds. Called at the invocation begin/terminal boundaries — never as a
     * declared effect. Reference runtime emits in this order:
     *   - action.invoked|action.replayed at invocation start (the latter when
     *     `priorInvocationRef` is supplied via the invocation context)
     *   - action.failed when terminal is `failed`
     *   - action.deferred when terminal is `deferred`
     *   - action.replayed (begin only — completion of a replayed happy path
     *     emits no further action.* kind; response.completed covers that)
     */
    recordActionLifecycle?: (kind: ResponseActionLifecycleKind, payload: ResponseActionLifecyclePayload) => void;
}
export type ResponseActionInvocationStatus = 'unresolved' | 'blocked' | 'failed' | 'deferred' | 'completed';
export interface ResponseActionInvocationResult<TDetail> {
    status: ResponseActionInvocationStatus;
    resolution: ActionResolution;
    validationTuple: ValidationOverride | null;
    detail: TDetail | null;
    effectTrace: ResponseActionEffectOutcome[];
    finding?: ActionRefFinding;
    blockedCause?: 'validation' | 'precondition';
    blockedPreconditionId?: string;
    deferredPreconditionId?: string;
    failedPreconditionId?: string;
    failedEffectIndex?: number;
    deferredEffectIndex?: number;
    failureReason?: string;
    replayToken?: string;
}
/** Host finding when `onSubmit` is wired but no submit-intent Action is published. */
export declare function missingSubmitActionFinding(): ActionRefFinding;
export declare function resolveResponseAction(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, nodeId?: string): ActionResolution;
export declare function findResponseActionByIntent(document: ResponseActionsDocumentInput | null | undefined, intent: string): ResponseAction | null;
/**
 * Structured error thrown when an explicit `action.validation` override
 * fails the VM §6.3 closed-tuple predicate. The `code` mirrors the Rust
 * lint pass identifier (formspec-lint VMAP-INVALID-OVERRIDE) so runtime
 * findings line up with static-analysis output.
 */
export declare class InvalidValidationTupleError extends Error {
    readonly code = "VMAP-INVALID-OVERRIDE";
    readonly actionId: string;
    readonly override: Record<string, unknown>;
    constructor(actionId: string, override: Record<string, unknown>, message: string);
}
export declare function resolveResponseActionValidationTuple(action: ResponseAction): ValidationOverride;
export declare function validationProfileForAction(action: ResponseAction): ValidationProfile;
export declare function declaresHostEvent(action: ResponseAction, eventName: string): boolean;
export declare function invokeResponseAction<TDetail>(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, ports: ResponseActionInvocationPorts<TDetail>, nodeId?: string, invocationContext?: ResponseActionInvocationContext): ResponseActionInvocationResult<TDetail>;
