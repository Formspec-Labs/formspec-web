/**
 * @filedesc Runtime delivery discipline for one widget-emitted action.
 *
 * Widgets never call this module. They receive only `emitAction(outputName)`.
 * The Surface binding resolves the output, allocates the invocation identity,
 * and uses this delivery controller to ensure one executor call for one logical
 * invocation. A host outcome store can replay an already-recorded terminal.
 */
import type { ResponseActionInvocationResult, ResponseActionInvokerResult } from '@formspec-org/react';
import type { ResponseActionsDocument } from '@formspec-org/types';
import type { SurfaceWidgetActionExecutor, SurfaceWidgetActionDetail, SurfaceWidgetActionExecutorInput, SurfaceWidgetActionOutcomeStore, SurfaceWidgetActionInput, SurfaceWidgetStoredActionOutcome } from './widget-api.js';
export type SurfaceWidgetActionInputAdmission = {
    accepted: true;
    input?: SurfaceWidgetActionInput | undefined;
} | {
    accepted: false;
    reason: string;
};
/**
 * Admit detached JSON data without invoking getters or following prototypes.
 * This is a data boundary, not a serializer: invalid values fail closed.
 */
export declare function admitSurfaceWidgetActionInput(candidate: unknown): SurfaceWidgetActionInputAdmission;
/** Shell-owned identity. Widgets and executors cannot choose it. */
export declare function allocateWidgetActionInvocationId(): string;
export declare function normalizeWidgetActionResult(result: ResponseActionInvokerResult<SurfaceWidgetActionDetail>): ResponseActionInvocationResult<SurfaceWidgetActionDetail>;
/**
 * Select the document only when one exact loaded action declaration exists.
 * Repeated ids across or within documents are ambiguous and resolve to none.
 */
export declare function responseActionsDocumentForAction(documents: readonly ResponseActionsDocument[], actionRef: string): ResponseActionsDocument | undefined;
export interface DeliverWidgetActionRequest extends SurfaceWidgetActionExecutorInput {
    generation: string;
    executor: SurfaceWidgetActionExecutor;
}
export interface WidgetActionDelivery {
    deliver(request: DeliverWidgetActionRequest): Promise<ResponseActionInvocationResult<SurfaceWidgetActionDetail>>;
}
/**
 * One in-memory delivery domain, normally one mounted widget slot. Duplicate
 * delivery with the same generation/slot/output/invocation shares a Promise;
 * later duplicates replay the terminal. Different invocation ids remain
 * distinct user emissions.
 */
export declare function createWidgetActionDelivery(): WidgetActionDelivery;
export interface EmitWidgetActionRequest {
    generation: string;
    document: ResponseActionsDocument;
    actionRef: string;
    source: SurfaceWidgetActionExecutorInput['source'];
    input?: SurfaceWidgetActionInput | undefined;
    executor: SurfaceWidgetActionExecutor;
    outcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
}
export interface CoordinatedWidgetActionResult extends SurfaceWidgetStoredActionOutcome {
    replayed: boolean;
}
export interface CoordinatedWidgetActionEmission {
    /** False only for a duplicate call while this logical output is in flight. */
    started: boolean;
    completion: Promise<CoordinatedWidgetActionResult>;
}
export interface WidgetActionCoordinator {
    emit(request: EmitWidgetActionRequest): CoordinatedWidgetActionEmission;
}
/**
 * Shell-owned logical invocation coordinator.
 *
 * - Two calls for the same generation/slot/output before terminal share one
 *   invocation, executor call and Promise.
 * - A durable outcome returned after remount carries and reuses its original
 *   invocation id.
 * - Once this coordinator has observed a terminal, a later call is a genuinely
 *   new emission and receives a new id even if a simple store still returns its
 *   last recorded terminal.
 */
export declare function createWidgetActionCoordinator(): WidgetActionCoordinator;
