/** @filedesc Exact, renderer-owned semantic control lookup and activation. */
import type { ResponseActionInvocationContext, ResponseActionInvocationResult } from '@formspec-org/engine';
export type SemanticControlSubjectKind = 'definition-item' | 'response-action';
/**
 * Portable owner identity. This deliberately contains no DOM selector,
 * generated layout-node id, visible label, or projection metadata.
 */
export interface QualifiedSemanticSubjectRef {
    artifactRef: string;
    artifactDigest: string;
    subjectKind: SemanticControlSubjectKind;
    subjectRef: string;
}
export interface SemanticArtifactIdentity {
    artifactRef: string;
    artifactDigest: string;
}
export interface SemanticResponseBinding {
    responseId: string;
    responseRevision: number;
}
export interface SemanticControlTarget {
    renderInstanceId: string;
    control: QualifiedSemanticSubjectRef;
}
/**
 * Host-paired runtime identity for one mounted Definition renderer.
 * Artifact digests and Response identity are required: omission means the
 * renderer simply does not publish semantic controls.
 */
export interface SemanticControlScope {
    registry: SemanticControlRegistry;
    renderInstanceId: string;
    definitionArtifact: SemanticArtifactIdentity;
    responseActionsArtifact?: SemanticArtifactIdentity;
    responseId: string;
    initialResponseRevision?: number;
}
export type SemanticControlRefusalReason = 'unresolved' | 'ambiguous' | 'stale' | 'unmounted' | 'disabled' | 'unsupported' | 'operation-failed' | 'invocation-mismatch' | 'owner-mismatch' | 'response-mismatch';
export interface SemanticControlRefusal {
    status: 'refused';
    reason: SemanticControlRefusalReason;
    target: SemanticControlTarget;
    message: string;
}
export interface SemanticSetItemSuccess {
    status: 'set';
    target: SemanticControlTarget;
    responseBinding: SemanticResponseBinding;
}
export type SemanticSetItemResult = SemanticSetItemSuccess | SemanticControlRefusal;
export interface SemanticControlActivation<TDetail = unknown> {
    invocation: ResponseActionInvocationResult<TDetail>;
    responseBinding: SemanticResponseBinding;
}
export interface SemanticActivateControlContext extends ResponseActionInvocationContext {
    invocationId: string;
    /** Exact prior set-item binding named by the activation step. */
    responseBinding: SemanticResponseBinding;
}
export interface SemanticActivateControlSuccess<TDetail = unknown> {
    status: 'activated';
    target: SemanticControlTarget;
    invocationId: string;
    actionOwner: QualifiedSemanticSubjectRef & {
        subjectKind: 'response-action';
    };
    responseBinding: SemanticResponseBinding;
    invocation: ResponseActionInvocationResult<TDetail>;
}
export type SemanticActivateControlResult<TDetail = unknown> = SemanticActivateControlSuccess<TDetail> | SemanticControlRefusal;
interface SemanticControlRegistrationBase {
    renderInstanceId: string;
    /** Exact owner Response for this mounted control instance. */
    responseId: string;
    control: QualifiedSemanticSubjectRef;
    disabled: () => boolean;
}
export interface SemanticSetItemControlRegistration extends SemanticControlRegistrationBase {
    capability: 'set-item';
    setItem: (value: unknown) => SemanticResponseBinding;
}
export interface SemanticActivateControlRegistration<TDetail = unknown> extends SemanticControlRegistrationBase {
    capability: 'activate-control';
    activate: (context: ResponseActionInvocationContext) => SemanticControlActivation<TDetail> | Promise<SemanticControlActivation<TDetail>>;
}
export type SemanticControlRegistration = SemanticSetItemControlRegistration | SemanticActivateControlRegistration;
export interface SemanticControlRegistry {
    /**
     * Registers one mounted control. The returned cleanup is idempotent and
     * must run on unmount.
     */
    register(registration: SemanticControlRegistration): () => void;
    setItem(target: SemanticControlTarget, value: unknown): SemanticSetItemResult;
    activateControl<TDetail = unknown>(target: SemanticControlTarget, context: SemanticActivateControlContext): Promise<SemanticActivateControlResult<TDetail>>;
}
/**
 * Creates one aggregation domain. A Surface normally supplies one registry to
 * every mounted route/slot renderer, so exact lookup works across generic
 * Definition forms without querying the DOM.
 */
export declare function createSemanticControlRegistry(): SemanticControlRegistry;
export {};
