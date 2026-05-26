/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import React from 'react';
import type { ActionRefFinding, ActionResolution, IFormEngine, IssuerFetcher, IssuerSource, ReadonlyEngineSignal, ResponseAction, ResponseActionEffectDispatchContext, ResponseActionEffectOutcome, ResponseActionIdempotencyKeyContext, ResponseActionInvocationPorts, ResponseActionInvocationResult, ResponseActionPreconditionResult, ResponseActionsDocumentInput } from '@formspec-org/engine';
import type { EffectRequest, FormResponse, Precondition, ValidationReport } from '@formspec-org/types';
import type { ComponentGraphProjectionContext, LayoutNode } from '@formspec-org/layout';
import type { ComponentMap } from './component-map';
export type ResponseActionsDocument = ResponseActionsDocumentInput;
export type { ActionRefFinding, ActionResolution, ResponseAction };
export interface ResponseActionInvokerInput<TDetail = SubmitResult> {
    document: ResponseActionsDocument | null | undefined;
    actionRef: string;
    nodeId?: string;
    ports: ResponseActionInvocationPorts<TDetail>;
}
export type ResponseActionInvokerResult<TDetail = SubmitResult> = ResponseActionInvocationResult<TDetail> | {
    invocation: ResponseActionInvocationResult<TDetail>;
};
export type ResponseActionInvoker<TDetail = SubmitResult> = (input: ResponseActionInvokerInput<TDetail>) => ResponseActionInvokerResult<TDetail> | Promise<ResponseActionInvokerResult<TDetail>>;
export interface SubmitResult {
    response: FormResponse;
    validationReport: ValidationReport | null;
}
export interface FormspecContextValue {
    engine: IFormEngine;
    layoutPlan: LayoutNode | null;
    components: ComponentMap;
    /** Theme document from the provider (used for container token emission). */
    themeDocument?: any;
    /** Component document from the provider (used for container token emission). */
    componentDocument?: any;
    /** Host-supplied Component graph projection context. Projection-only; no runtime authority. */
    componentGraph?: ComponentGraphProjectionContext | null;
    /** Response Actions document used by ActionButton actionRef resolution. */
    responseActionsDocument?: ResponseActionsDocument | null;
    /** Callback invoked on form submission. Absent means no built-in submit button. */
    onSubmit?: (result: SubmitResult) => void;
    /** Callback invoked for every declared hostEvent effect. */
    onHostEvent?: (eventName: string, result: SubmitResult, action: ResponseAction) => void;
    /** Callback invoked when ActionButton actionRef resolution produces a finding. */
    onActionFinding?: (finding: ActionRefFinding) => void;
    /** Callback invoked after every ActionButton invocation terminal. */
    onActionResult?: (result: ResponseActionInvocationResult<SubmitResult>) => void;
    /** Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing. */
    responseActionInvoker?: ResponseActionInvoker<SubmitResult> | null;
    /** Host precondition evaluator for Response Actions that declare FEL preconditions. */
    evaluateActionPrecondition?: (precondition: Precondition, action: ResponseAction) => ResponseActionPreconditionResult;
    /** Host durable-effect adapter for non-hostEvent Response Action effects. */
    dispatchActionEffect?: (effect: EffectRequest, result: SubmitResult, action: ResponseAction, context: ResponseActionEffectDispatchContext) => ResponseActionEffectOutcome | void;
    /** Host idempotency-key resolver for durable Response Action effects. */
    resolveActionIdempotencyKey?: (effect: EffectRequest, action: ResponseAction, context: ResponseActionIdempotencyKeyContext) => string;
    /** Resolve an ActionButton actionRef against the loaded Response Actions document. */
    resolveActionRef: (actionRef: string, nodeId?: string) => ActionResolution;
    /** Mark a field as touched (e.g., on blur). */
    touchField: (path: string) => void;
    /** Touch every field in the definition (e.g., before submit to reveal all errors). */
    touchAllFields: () => void;
    /** Signal that increments when touched set changes — subscribe for reactivity. */
    touchedVersion: ReadonlyEngineSignal<number>;
    /** Check if a field has been touched. Read touchedVersion.value first for reactivity. */
    isTouched: (path: string) => boolean;
    /** Registry entries for extension resolution. */
    registryEntries: Map<string, any>;
    /** Effective formPresentation (definition merged with component document). */
    formPresentation?: Record<string, unknown>;
}
export interface FormspecProviderProps {
    /** Pre-built FormEngine instance. Mutually exclusive with `definition`. */
    engine?: IFormEngine;
    /** Raw definition JSON. Will create a FormEngine internally. */
    definition?: any;
    /** Component document for layout planning. */
    componentDocument?: any;
    /** Host-supplied Component graph projection context for inert renderer metadata. */
    componentGraph?: ComponentGraphProjectionContext | null;
    /** Theme document for presentation cascade. */
    themeDocument?: any;
    /** Response Actions document for ActionButton actionRef resolution. */
    responseActionsDocument?: ResponseActionsDocument | null;
    /** Initial response data to pre-populate fields (for edit flows). */
    initialData?: Record<string, any>;
    /** Registry entries for extension field validation. */
    registryEntries?: any[];
    /** Runtime context for FEL today(), locale formatting, etc. */
    runtimeContext?: any;
    /** Optional fetcher for remote Issuer documents. */
    issuerFetcher?: IssuerFetcher;
    /** Host-supplied Issuer override. */
    issuerOverride?: IssuerSource;
    /** Component map overrides. */
    components?: ComponentMap;
    /** Callback for form submission. If provided, a submit button is rendered. */
    onSubmit?: (result: SubmitResult) => void;
    /** Callback invoked for every declared hostEvent effect. */
    onHostEvent?: (eventName: string, result: SubmitResult, action: ResponseAction) => void;
    /** Callback for ActionButton actionRef resolution findings. */
    onActionFinding?: (finding: ActionRefFinding) => void;
    /** Callback invoked after every ActionButton invocation terminal. */
    onActionResult?: (result: ResponseActionInvocationResult<SubmitResult>) => void;
    /** Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing. */
    responseActionInvoker?: ResponseActionInvoker<SubmitResult> | null;
    /** Host precondition evaluator for Response Actions that declare FEL preconditions. */
    evaluateActionPrecondition?: (precondition: Precondition, action: ResponseAction) => ResponseActionPreconditionResult;
    /** Host durable-effect adapter for non-hostEvent Response Action effects. */
    dispatchActionEffect?: (effect: EffectRequest, result: SubmitResult, action: ResponseAction, context: ResponseActionEffectDispatchContext) => ResponseActionEffectOutcome | void;
    /** Host idempotency-key resolver for durable Response Action effects. */
    resolveActionIdempotencyKey?: (effect: EffectRequest, action: ResponseAction, context: ResponseActionIdempotencyKeyContext) => string;
    children: React.ReactNode;
}
/**
 * Provides FormEngine and layout plan to descendant hooks and renderers.
 *
 * Accepts either a pre-built `engine` or a raw `definition` (creates engine internally).
 */
export declare function FormspecProvider(props: FormspecProviderProps): import("react/jsx-runtime").JSX.Element;
/** Access the FormspecContext. Throws if used outside FormspecProvider. */
export declare function useFormspecContext(): FormspecContextValue;
/**
 * Emit theme tokens as --formspec-* CSS custom properties.
 * Converts dotted token keys (e.g., `color.primary`) to `--formspec-color-primary`.
 * Defaults to `document.documentElement` when no target is provided.
 */
export declare function emitThemeTokens(tokens: Record<string, string | number>, target?: HTMLElement): void;
/** Recursive item lookup by dotted key path. */
export declare function findItemByKey(items: any[], key: string): any | null;
