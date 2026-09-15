/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import React from 'react';
import type { ActionRefFinding, ActionResolution, IFormEngine, IssuerFetcher, IssuerSource, ReadonlyEngineSignal, ResponseAction, ResponseActionEffectDispatchContext, ResponseActionEffectOutcome, ResponseActionIdempotencyKeyContext, ResponseActionInvocationPorts, ResponseActionInvocationContext, ResponseActionInvocationResult, ResponseActionPreconditionResult, ResponseActionsDocumentInput } from '@formspec-org/engine';
import type { EffectRequest, FormResponse, Precondition, ThemeDocument as SchemaThemeDocument, ValidationReport } from '@formspec-org/types';
import type { ComponentGraphProjectionContext, LayoutHostEvidence, LayoutNode, ThemeDocument as LayoutThemeDocument } from '@formspec-org/layout';
import { admitFieldHelpUri } from '@formspec-org/layout';
import type { ComponentMap } from './component-map';
import type { SemanticControlScope, SemanticResponseBinding } from './semantic-controls';
export type ResponseActionsDocument = ResponseActionsDocumentInput;
export type { ActionRefFinding, ActionResolution, ResponseAction, ResponseActionInvocationResult, };
export interface ResponseActionInvokerInput<TDetail = SubmitResult> {
    document: ResponseActionsDocument | null | undefined;
    actionRef: string;
    nodeId?: string;
    ports: ResponseActionInvocationPorts<TDetail>;
    invocationContext?: ResponseActionInvocationContext;
}
export type ResponseActionInvokerResult<TDetail = SubmitResult> = ResponseActionInvocationResult<TDetail> | {
    invocation: ResponseActionInvocationResult<TDetail>;
};
export type ResponseActionInvoker<TDetail = SubmitResult> = (input: ResponseActionInvokerInput<TDetail>) => ResponseActionInvokerResult<TDetail> | Promise<ResponseActionInvokerResult<TDetail>>;
export interface SubmitResult {
    response: FormResponse;
    validationReport: ValidationReport | null;
}
/** Human-facing help resolved from manifested References sidecars. */
export interface FormspecHumanReference {
    id?: string;
    title: string;
    description?: string;
    content?: string;
    uri?: string;
    type?: string;
    /** Direct current Need anchors on this exact rendered reference. */
    needAnchors: readonly string[];
}
export type FormspecFieldHelpResolver = (path: string) => readonly FormspecHumanReference[];
/**
 * Host policy for turning a References URI into a browser destination.
 *
 * Returning `undefined` keeps the human-readable reference but renders its
 * title as text. A host may translate a non-browser scheme into a trusted
 * internal route; the default admits only HTTPS and same-app relative URIs.
 */
export type FormspecFieldHelpUriAdmission = (uri: string) => string | undefined;
/**
 * Fail-closed browser policy for human Reference links — the shared rule, so React and the webcomponent admit
 * exactly the same URIs (`admitFieldHelpUri` in `@formspec-org/layout`).
 */
export declare const admitDefaultFieldHelpUri: typeof admitFieldHelpUri;
export interface FormspecContextValue {
    engine: IFormEngine;
    layoutPlan: LayoutNode | null;
    components: ComponentMap;
    /** Theme document from the provider (used for container token emission). */
    themeDocument?: LayoutThemeDocument;
    /** Whether this tree owns theme-token emission. */
    emitThemeTokens: boolean;
    /** Component document from the provider (used for container token emission). */
    componentDocument?: any;
    /** Host-supplied Component graph projection context. Projection-only; no runtime authority. */
    componentGraph?: ComponentGraphProjectionContext | null;
    /** Host-supplied UI Graph Policy validation evidence. Projection-only; no runtime authority. */
    hostEvidence?: LayoutHostEvidence | null;
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
    /** Exact runtime identity used only by the public semantic-control seam. */
    semanticControlScope?: SemanticControlScope;
    currentSemanticResponseBinding: () => SemanticResponseBinding | null;
    advanceSemanticResponseRevision: () => SemanticResponseBinding | null;
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
    /** Human References for a field path. Agent-only context never enters this seam. */
    resolveFieldHelp?: FormspecFieldHelpResolver;
    /** Admit or translate a human Reference URI before it reaches an anchor. */
    admitFieldHelpUri: FormspecFieldHelpUriAdmission;
    /** Localizable disclosure label for resolved field help. */
    fieldHelpLabel: string;
    /** Effective formPresentation (definition merged with component document). */
    formPresentation?: Record<string, unknown>;
}
/** @internal The provider's value, or `null` outside one — read it through {@link useFormspecContext}. */
export declare const FormspecContext: React.Context<FormspecContextValue | null>;
export interface FormspecProviderProps {
    /** Pre-built FormEngine instance. Mutually exclusive with `definition`. */
    engine?: IFormEngine;
    /** Raw definition JSON. Will create a FormEngine internally. */
    definition?: any;
    /** Component document for layout planning. */
    componentDocument?: any;
    /** Host-supplied Component graph projection context for inert renderer metadata. */
    componentGraph?: ComponentGraphProjectionContext | null;
    /** Host-supplied UI Graph Policy validation evidence for inert renderer metadata. */
    hostEvidence?: LayoutHostEvidence | null;
    /** Theme document for presentation cascade. */
    themeDocument?: SchemaThemeDocument;
    /**
     * Emit theme tokens on provider and form-container elements. Default true.
     * Set false when an owning shell already emitted the effective token map.
     */
    emitThemeTokens?: boolean;
    /** Response Actions document for ActionButton actionRef resolution. */
    responseActionsDocument?: ResponseActionsDocument | null;
    /**
     * Exact artifact, render, and Response identity for renderer-owned
     * semantic controls. Omit for ordinary human-only rendering.
     */
    semanticControlScope?: SemanticControlScope;
    /** Response `data` to load for edit flows (`engine.loadResponseData`: every saved repeat row is kept). */
    initialData?: Record<string, any>;
    /** Registry entries for extension field validation. */
    registryEntries?: any[];
    /** Human References resolver for the active Definition. */
    resolveFieldHelp?: FormspecFieldHelpResolver;
    /** Host URI policy. Defaults to HTTPS and same-app relative destinations. */
    admitFieldHelpUri?: FormspecFieldHelpUriAdmission;
    /** Localizable disclosure label for resolved field help. */
    fieldHelpLabel?: string;
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
 *
 * `target` defaults to `document.documentElement` — a HOST may choose to paint
 * the document root, and the shipped examples do. `FormspecProvider` does not:
 * a renderer that writes tenant tokens to `<html>` makes a global mutation that
 * outlives the component and that a composing host can only clean up after,
 * never prevent. Always pass a target from inside a component.
 */
export declare function emitThemeTokens(tokens: Record<string, string | number>, target?: HTMLElement): void;
/** Recursive item lookup by dotted key path. */
export declare function findItemByKey(items: any[], key: string): any | null;
