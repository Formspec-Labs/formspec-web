/** @filedesc Response Actions resolution helpers for renderers and hosts. */
import type { Action as ResponseAction, ActionInvocationStatus, EffectRequest, EffectOutcomeStatus, Precondition, ResponseActionsDocument, ValidationOverride, ValidationProfile } from '@formspec-org/types';
export type { ResponseAction, ResponseActionsDocument, ValidationOverride as ResponseActionValidationTuple, };
export type StandardResponseActionIntent = 'save-draft' | 'autosave' | 'review' | 'submit' | 'request-evidence';
/**
 * The only validation tuple an app-scoped Action may declare.
 *
 * App actions have no Response to validate or persist. Keeping this predicate
 * next to the executor prevents build-time gates from restating a runtime
 * invariant with subtly different defaults.
 */
export declare const APP_ACTION_VALIDATION_TUPLE: Readonly<ValidationOverride>;
export declare function isAppActionValidationTuple(value: unknown): value is ValidationOverride;
/**
 * The document accepted by the engine.
 *
 * The generated schema type is authoritative at this package boundary. Keep
 * smaller, read-only views in the caller that needs them rather than widening
 * this type and making schema-invalid documents appear supported.
 */
export type ResponseActionsDocumentInput = ResponseActionsDocument;
export interface ActionRefFinding {
    code: 'COMP-REFERENTIAL-INTEGRITY';
    severity: 'error';
    kind: 'actionRef';
    nodeId?: string;
    target: string;
    reason?: 'missing-actionRef' | 'no-response-actions-document' | 'missing-submit-action' | 'ambiguous-actionRef';
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
/** Schema-owned closed vocabulary for one declared effect's outcome. */
export type ResponseActionEffectStatus = EffectOutcomeStatus;
export interface ResponseActionEffectOutcome {
    type: EffectRequest['type'];
    status: ResponseActionEffectStatus;
    idempotencyKey?: string;
    outcomeRef?: string;
    reason?: string;
    replayToken?: string;
}
/**
 * Host adapter result for one effect. Only allowlisted transition strings may
 * cross into a completed invocation result; adapter-private data is ignored.
 */
export interface ResponseActionEffectDispatchResult {
    outcome: ResponseActionEffectOutcome;
    transitionBindings?: Readonly<Record<string, string>>;
}
export type ResponseActionEffectDispatchValue = ResponseActionEffectOutcome | ResponseActionEffectDispatchResult | void;
export interface ResponseActionIdempotencyKeyContext {
    effectIndex: number;
}
export interface ResponseActionEffectDispatchContext {
    effectIndex: number;
    attempt: number;
    idempotencyKey?: string;
}
export type ResponseActionEffectClass = 'transient' | 'browser-local' | 'durable';
export interface PlannedResponseActionEffect {
    /** Zero-based declaration order. */
    effectIndex: number;
    /** Exact authored effect. No copy or interpretation replaces owner data. */
    effect: EffectRequest;
    effectClass: ResponseActionEffectClass;
    durable: boolean;
}
/**
 * Pure owner classification used by executors and admission gates.
 *
 * Unknown effect types are treated as durable. That fail-closed default means
 * a schema-bypassing caller cannot obtain side effects merely by inventing a
 * new transient-looking type.
 */
export declare function classifyResponseActionEffect(effect: EffectRequest): ResponseActionEffectClass;
export declare function isDurableResponseActionEffect(effect: EffectRequest): boolean;
/** Pure, ordered effect plan. It never evaluates, dispatches, or authorizes. */
export declare function planResponseActionEffects(action: ResponseAction): readonly PlannedResponseActionEffect[];
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
    /**
     * Exact loaded Response Actions artifact identity. The engine adds the
     * resolved Action id; renderers and runners must not infer this identity
     * from projection metadata or visible copy.
     */
    actionArtifact?: {
        artifactRef: string;
        artifactDigest: string;
    };
}
export interface ResponseActionInvocationPorts<TDetail> {
    /**
     * Definition-scoped response submission. Required at runtime when the
     * document scope is `response` (or omitted); never called for `app`.
     */
    submit?: ((options: ResponseActionSubmitOptions) => TDetail | null) | undefined;
    /**
     * Application action input. Required at runtime for `scope: app`; this
     * replaces form submission and gives effect adapters validated structured
     * input without manufacturing a Response.
     */
    prepareAppAction?: ((action: ResponseAction) => TDetail | null) | undefined;
    dispatchHostEvent: (eventName: string, detail: TDetail, action: ResponseAction) => void;
    dispatchEffect?: (effect: EffectRequest, detail: TDetail, action: ResponseAction, context: ResponseActionEffectDispatchContext) => ResponseActionEffectDispatchValue;
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
/** Async counterpart whose effect adapter may return a Promise. */
export type ResponseActionAsyncInvocationPorts<TDetail> = Omit<ResponseActionInvocationPorts<TDetail>, 'dispatchEffect'> & {
    dispatchEffect?: (effect: EffectRequest, detail: TDetail, action: ResponseAction, context: ResponseActionEffectDispatchContext) => ResponseActionEffectDispatchValue | PromiseLike<ResponseActionEffectDispatchValue>;
};
/** Schema-owned complete invocation-status vocabulary. */
export type ResponseActionInvocationStatus = ActionInvocationStatus;
export interface ResponseActionOwnerFacts {
    artifactRef: string;
    artifactDigest: string;
    subjectKind: 'response-action';
    subjectRef: string;
}
export interface ResponseActionInvocationResult<TDetail> {
    status: ResponseActionInvocationStatus;
    /** Present once an Action resolves and invocation begins. */
    invocationId?: string;
    /** Caller-paired artifact identity plus the engine-resolved Action id. */
    actionOwner?: ResponseActionOwnerFacts;
    resolution: ActionResolution;
    validationTuple: ValidationOverride | null;
    detail: TDetail | null;
    effectTrace: ResponseActionEffectOutcome[];
    /** Present only on completed invocations with declared transition outputs. */
    transitionBindings?: Readonly<Record<string, string>>;
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
export interface ResponseActionInvocationPlan {
    resolution: ActionResolution;
    effects: readonly PlannedResponseActionEffect[];
}
/**
 * Resolve an Action and expose its complete effect plan without executing it.
 * Admission layers use this before activation so all possible durable effects
 * can be authorized as one fail-closed decision.
 */
export declare function planResponseActionInvocation(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, nodeId?: string): ResponseActionInvocationPlan;
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
/** Invoke an Action with synchronous effect adapters. Promise outcomes fail fast. */
export declare function invokeResponseAction<TDetail>(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, ports: ResponseActionInvocationPorts<TDetail>, nodeId?: string, invocationContext?: ResponseActionInvocationContext): ResponseActionInvocationResult<TDetail>;
/** Invoke an Action while awaiting effect adapters in strict declaration order. */
export declare function invokeResponseActionAsync<TDetail>(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, ports: ResponseActionAsyncInvocationPorts<TDetail>, nodeId?: string, invocationContext?: ResponseActionInvocationContext): Promise<ResponseActionInvocationResult<TDetail>>;
