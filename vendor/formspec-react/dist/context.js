'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import { createContext, useContext, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { signal } from '@preact/signals-core';
import { ActionFeedbackProvider, useActionFeedbackStore } from './action-feedback.js';
import { generationNeedAnchors } from './projection-metadata.js';
import { autoPlacedDefinitionActions, createFormEngine, findResponseActionByIntent, invokeResponseActionAsync, isValidDefinitionResponseActionsDocument, missingSubmitActionFinding, resolveResponseAction, createResponseActionAutosaveController, } from '@formspec-org/engine';
import { buildPlatformTheme, mergePlatformAndTenantTheme, extractBreakpointEntries, matchBreakpoint, planDefinitionLayout, mergeFormPresentationForPlanning, admitFieldHelpUri, } from '@formspec-org/layout';
import { useSignal } from './use-signal';
import { chromeText } from './use-chrome-text';
import { useSubmitEvaluation } from './explanation-state';
const platformTheme = buildPlatformTheme();
/**
 * Fail-closed browser policy for human Reference links — the shared rule, so React and the webcomponent admit
 * exactly the same URIs (`admitFieldHelpUri` in `@formspec-org/layout`).
 */
export const admitDefaultFieldHelpUri = admitFieldHelpUri;
/** @internal The provider's value, or `null` outside one — read it through {@link useFormspecContext}. */
export const FormspecContext = createContext(null);
/**
 * Provides FormEngine and layout plan to descendant hooks and renderers.
 *
 * Accepts either a pre-built `engine` or a raw `definition` (creates engine internally).
 */
export function FormspecProvider(props) {
    const { engine: externalEngine, definition, componentDocument, componentGraph, hostEvidence, themeDocument, responseActionsDocument, semanticControlScope, initialData, registryEntries, resolveFieldHelp, admitFieldHelpUri = admitDefaultFieldHelpUri, runtimeContext, issuerFetcher, issuerOverride, components = {}, onSubmit, showValidationSummary = false, onHostEvent, onActionFinding, onActionResult, onControlActionResult, responseActionInvoker, evaluateActionPrecondition, evaluateActionEffectExpression, dispatchActionEffect, resolveActionIdempotencyKey, children, } = props;
    const shouldEmitThemeTokens = props.emitThemeTokens ?? true;
    const semanticResponseState = useMemo(() => ({
        responseRevision: semanticControlScope?.initialResponseRevision ?? 0,
    }), [
        semanticControlScope?.renderInstanceId,
        semanticControlScope?.responseId,
        semanticControlScope?.initialResponseRevision,
    ]);
    const currentSemanticResponseBinding = useCallback(() => semanticControlScope
        ? {
            responseId: semanticControlScope.responseId,
            responseRevision: semanticResponseState.responseRevision,
        }
        : null, [semanticControlScope, semanticResponseState]);
    const advanceSemanticResponseRevision = useCallback(() => {
        if (!semanticControlScope)
            return null;
        semanticResponseState.responseRevision += 1;
        return {
            responseId: semanticControlScope.responseId,
            responseRevision: semanticResponseState.responseRevision,
        };
    }, [semanticControlScope, semanticResponseState]);
    const hasIssuerOverrideProp = Object.prototype.hasOwnProperty.call(props, 'issuerOverride');
    const effectiveThemeDocument = useMemo(() => themeDocument
        ? mergePlatformAndTenantTheme(platformTheme, themeDocument)
        : mergePlatformAndTenantTheme(platformTheme), [themeDocument]);
    /**
     * The element the provider's theme tokens are written to.
     *
     * The provider used to call `emitThemeTokens(themeDocument.tokens)` with no
     * target, which defaults to `document.documentElement`, and never cleaned
     * up. One mount of a tenant-themed tree left that tenant's tokens inline on
     * `<html>` for the life of the page: they survived unmount, survived
     * client-side navigation to a route whose `routeClass` refuses tenant
     * theming, and reached everything outside a `.formspec-container` — host
     * chrome, a second embedded renderer, any skin that paints the brand token.
     * A host composing this provider could clean up after it but never prevent
     * it, which is the runtime hole under ADR 0161's theme-authority promise.
     *
     * `display: contents` is inline rather than in a stylesheet so the element
     * generates no box even when the default skin is not loaded. Custom
     * properties inherit through it regardless of `display`, so the tokens
     * reach exactly the subtree the provider owns and nothing above it.
     */
    const themeScopeRef = useRef(null);
    const engine = useMemo(() => {
        if (externalEngine)
            return externalEngine;
        if (!definition)
            throw new Error('FormspecProvider requires either engine or definition');
        const eng = createFormEngine(definition, {
            runtimeContext,
            registryEntries,
            issuerFetcher,
            issuerOverride,
            responseData: initialData,
        });
        return eng;
    }, [externalEngine, definition, registryEntries, runtimeContext, initialData, issuerFetcher]);
    useEffect(() => {
        if (hasIssuerOverrideProp) {
            engine.setIssuerOverride(issuerOverride);
        }
    }, [engine, hasIssuerOverrideProp, issuerOverride]);
    // Locale §3.1.10: the renderer's own words for the help link, unless the host names its own.
    useSignal(engine.localeSignal);
    const fieldHelpLabel = props.fieldHelpLabel ?? chromeText(engine, 'fieldHelp.label');
    // Build registry entry map for extension resolution
    const registryMap = useMemo(() => {
        const map = new Map();
        if (registryEntries) {
            for (const doc of (Array.isArray(registryEntries) ? registryEntries : [registryEntries])) {
                if (!doc?.entries)
                    continue;
                for (const entry of doc.entries) {
                    if (entry.name)
                        map.set(entry.name, entry);
                }
            }
        }
        return map;
    }, [registryEntries]);
    // Responsive breakpoint detection — match merged Theme + Component breakpoints via matchMedia
    const [activeBreakpoint, setActiveBreakpoint] = useState(() => detectBreakpoint(effectiveThemeDocument?.breakpoints, componentDocument?.breakpoints));
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
            return;
        const entries = extractBreakpointEntries(effectiveThemeDocument?.breakpoints, componentDocument?.breakpoints);
        const update = () => {
            const next = detectBreakpoint(effectiveThemeDocument?.breakpoints, componentDocument?.breakpoints);
            setActiveBreakpoint((prev) => (prev === next ? prev : next));
        };
        update();
        if (entries.length === 0)
            return;
        const queries = entries.map(([name, minWidth]) => ({
            name,
            mql: window.matchMedia(`(min-width: ${minWidth}px)`),
        }));
        for (const { mql } of queries)
            mql.addEventListener('change', update);
        return () => { for (const { mql } of queries)
            mql.removeEventListener('change', update); };
    }, [effectiveThemeDocument, componentDocument]);
    const mergedFormPresentation = useMemo(() => engine
        ? mergeFormPresentationForPlanning(engine.getDefinition().formPresentation, componentDocument?.formPresentation)
        : undefined, [engine, componentDocument]);
    const [showValidationSummaryAttr, setShowValidationSummaryAttr] = useState(false);
    const effectiveShowValidationSummary = showValidationSummary || showValidationSummaryAttr;
    const activeDefinition = engine ? engine.getDefinition() : definition;
    const admittedResponseActionsDocument = useMemo(() => (activeDefinition && isValidDefinitionResponseActionsDocument(responseActionsDocument, activeDefinition))
        ? responseActionsDocument
        : null, [activeDefinition, responseActionsDocument]);
    const { root: layoutPlan, workspace } = useMemo(() => {
        if (!engine)
            return { root: null, workspace: undefined };
        const def = engine.getDefinition();
        const autoPlaceControls = onSubmit
            ? 'always'
            : responseActionInvoker
                ? 'when-unauthored'
                : 'never';
        const autoPlacedActionRefs = autoPlaceControls !== 'never'
            ? autoPlacedDefinitionActions(admittedResponseActionsDocument, def).map((action) => action.id)
            : [];
        return planDefinitionLayout({
            definition: def,
            componentDocument,
            themeDocument: effectiveThemeDocument,
            activeBreakpoint,
            componentGraph: componentGraph ?? undefined,
            hostEvidence: hostEvidence ?? undefined,
            autoPlacedActionRefs,
            autoPlaceControls,
            showValidationSummary: effectiveShowValidationSummary,
        });
    }, [engine, componentDocument, componentGraph, hostEvidence, effectiveThemeDocument, activeBreakpoint, onSubmit, responseActionInvoker, effectiveShowValidationSummary, admittedResponseActionsDocument]);
    // §10: surface a finding when the host wires onSubmit but no submit Action
    // is published — otherwise auto-inject silently no-ops.
    useEffect(() => {
        if (!onSubmit || !onActionFinding)
            return;
        if (findResponseActionByIntent(admittedResponseActionsDocument, 'submit'))
            return;
        onActionFinding(missingSubmitActionFinding());
    }, [onSubmit, onActionFinding, admittedResponseActionsDocument]);
    // Touched tracking — stable across re-renders
    const touchedFieldsRef = useRef(new Set());
    const touchedVersionSignal = useMemo(() => signal(0), []);
    const latestSubmitSignal = useMemo(() => signal(null), []);
    const recordSubmit = useCallback((result) => { latestSubmitSignal.value = result; }, [latestSubmitSignal]);
    const { submitEvaluation, explanationState } = useSubmitEvaluation(engine, latestSubmitSignal);
    const fieldJumpHandlerRef = useRef(null);
    const registerFieldJump = useCallback((handler) => {
        fieldJumpHandlerRef.current = handler;
    }, []);
    const jumpToField = useCallback((path, options) => {
        return fieldJumpHandlerRef.current ? fieldJumpHandlerRef.current(path, options) : false;
    }, []);
    const touchField = useCallback((path) => {
        if (!touchedFieldsRef.current.has(path)) {
            touchedFieldsRef.current.add(path);
            touchedVersionSignal.value += 1;
        }
    }, [touchedVersionSignal]);
    // Every rendered instance path the engine validates (repeat rows included, e.g. `rows[1].name`),
    // not Definition template paths. Same key set as webcomponent submit touchAllFields.
    const touchAllFields = useCallback(() => {
        let touchedAny = false;
        for (const path of [...Object.keys(engine.errorSignals), ...Object.keys(engine.validationResults)]) {
            if (touchedFieldsRef.current.has(path))
                continue;
            touchedFieldsRef.current.add(path);
            touchedAny = true;
        }
        if (touchedAny)
            touchedVersionSignal.value += 1;
    }, [engine, touchedVersionSignal]);
    const isTouched = useCallback((path) => {
        return touchedFieldsRef.current.has(path);
    }, []);
    const resolveActionRef = useCallback((actionRef, nodeId) => resolveResponseAction(admittedResponseActionsDocument, actionRef, nodeId), [admittedResponseActionsDocument]);
    // Auto-emit theme tokens as CSS custom properties onto the provider's OWN
    // element — never the document root. See `themeScopeRef` below for why.
    useEffect(() => {
        if (!shouldEmitThemeTokens)
            return;
        const el = themeScopeRef.current;
        if (!el)
            return;
        const tokens = effectiveThemeDocument.tokens;
        if (!tokens)
            return;
        emitThemeTokens(tokens, el);
        return () => {
            for (let i = el.style.length - 1; i >= 0; i--) {
                const property = el.style[i];
                if (property.startsWith('--formspec-'))
                    el.style.removeProperty(property);
            }
        };
    }, [effectiveThemeDocument, shouldEmitThemeTokens]);
    useEffect(() => {
        // Only dispose if we created the engine internally
        if (!externalEngine && engine) {
            return () => engine.dispose();
        }
    }, [engine, externalEngine]);
    const { activeSection, focusField, onActiveSectionChange, sectionNavigationActive, hrefForSection, acknowledgementLink, onSectionTitleChange, updateDocumentTitle, } = props;
    const controlledSection = Object.prototype.hasOwnProperty.call(props, 'activeSection');
    const workspaceNavigation = useMemo(() => ({
        ...(controlledSection && { activeSection }),
        ...(focusField !== undefined && { focusField }),
        onActiveSectionChange, sectionNavigationActive, hrefForSection, acknowledgementLink, onSectionTitleChange, updateDocumentTitle,
    }), [controlledSection, activeSection, focusField, onActiveSectionChange, sectionNavigationActive, hrefForSection,
        acknowledgementLink, onSectionTitleChange, updateDocumentTitle]);
    const value = useMemo(() => ({
        engine,
        layoutPlan,
        workspacePages: workspace,
        workspaceNavigation,
        components,
        themeDocument: effectiveThemeDocument,
        emitThemeTokens: shouldEmitThemeTokens,
        componentDocument,
        componentGraph,
        hostEvidence,
        responseActionsDocument: admittedResponseActionsDocument,
        semanticControlScope,
        onSubmit,
        onHostEvent,
        onActionFinding,
        onActionResult,
        onControlActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        resolveActionRef,
        currentSemanticResponseBinding,
        advanceSemanticResponseRevision,
        touchField,
        touchAllFields,
        touchedVersion: touchedVersionSignal,
        isTouched,
        latestSubmit: latestSubmitSignal,
        submitEvaluation,
        explanationState,
        recordSubmit,
        registryEntries: registryMap,
        resolveFieldHelp,
        admitFieldHelpUri,
        fieldHelpLabel,
        formPresentation: mergedFormPresentation,
        setShowValidationSummaryAttr,
        registerFieldJump,
        jumpToField,
    }), [engine, layoutPlan, workspace, workspaceNavigation, components, effectiveThemeDocument, shouldEmitThemeTokens, componentDocument, componentGraph, hostEvidence, admittedResponseActionsDocument, semanticControlScope, onSubmit, onHostEvent, onActionFinding, onActionResult, onControlActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, resolveActionRef, currentSemanticResponseBinding, advanceSemanticResponseRevision, touchField, touchAllFields, touchedVersionSignal, isTouched, latestSubmitSignal, submitEvaluation, explanationState, recordSubmit, registryMap, resolveFieldHelp, admitFieldHelpUri, fieldHelpLabel, mergedFormPresentation, setShowValidationSummaryAttr, registerFieldJump, jumpToField]);
    return (_jsx(FormspecContext.Provider, { value: value, children: _jsxs(ActionFeedbackProvider, { engine: engine, responseId: semanticControlScope?.responseId, renderInstanceId: semanticControlScope?.renderInstanceId, draftSaveFeedback: props.draftSaveFeedback, submitFeedback: props.submitFeedback, children: [_jsx(FormspecAutosaveEffect, { draftSaveFeedback: props.draftSaveFeedback }), _jsx("div", { ref: themeScopeRef, className: "formspec-theme-scope", style: THEME_SCOPE_STYLE, children: children })] }) }));
}
function FormspecAutosaveEffect({ draftSaveFeedback }) {
    const { engine, responseActionsDocument, semanticControlScope, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, evaluateActionEffectExpression, dispatchActionEffect, resolveActionIdempotencyKey, } = useFormspecContext();
    const feedbackStore = useActionFeedbackStore();
    const latestRef = useRef({
        semanticControlScope,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        feedbackStore,
        responseActionsDocument,
    });
    latestRef.current = {
        semanticControlScope,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        feedbackStore,
        responseActionsDocument,
    };
    const controllerRef = useRef(null);
    useEffect(() => {
        if (draftSaveFeedback === 'external' || !engine) {
            return;
        }
        const activeTickets = new Set();
        let settledTicket;
        const cancelActiveTickets = () => {
            for (const pendingTicket of activeTickets) {
                latestRef.current.feedbackStore?.cancel(pendingTicket);
            }
            activeTickets.clear();
        };
        const cancelSettledTicket = () => {
            if (settledTicket) {
                latestRef.current.feedbackStore?.cancel(settledTicket);
                settledTicket = undefined;
            }
        };
        const controller = createResponseActionAutosaveController({
            engine,
            document: latestRef.current.responseActionsDocument,
            onFinding: (finding) => {
                latestRef.current.onActionFinding?.(finding);
            },
            onDocumentChange: ({ equivalentAction }) => {
                cancelActiveTickets();
                if (!equivalentAction) {
                    cancelSettledTicket();
                }
            },
            invoke: async (action, context) => {
                const invokedDoc = context.document;
                const current = latestRef.current;
                const outletId = context.isCurrent() ? current.feedbackStore?.primaryOutlet() : undefined;
                const ticket = outletId
                    ? current.feedbackStore?.start(outletId, action.intent, generationNeedAnchors(action))
                    : undefined;
                if (ticket) {
                    settledTicket = undefined;
                    activeTickets.add(ticket);
                }
                const captureAutosaveSnapshot = ({ profile, validationTuple, }) => engine.getResponseSnapshot({
                    profile: validationTuple?.persistence === 'complete-response' ? 'on-submit' : 'off',
                    ...(current.semanticControlScope ? { id: current.semanticControlScope.responseId } : {}),
                }, profile);
                const ports = {
                    submit: captureAutosaveSnapshot,
                    dispatchHostEvent: (eventName, detail, invokedAction) => {
                        current.onHostEvent?.(eventName, detail, invokedAction);
                    },
                    ...(current.evaluateActionPrecondition
                        ? { evaluatePrecondition: current.evaluateActionPrecondition }
                        : {}),
                    ...(current.evaluateActionEffectExpression
                        ? { evaluateEffectExpression: current.evaluateActionEffectExpression }
                        : {}),
                    ...(current.dispatchActionEffect
                        ? { dispatchEffect: current.dispatchActionEffect }
                        : {}),
                    ...(current.resolveActionIdempotencyKey
                        ? { resolveIdempotencyKey: current.resolveActionIdempotencyKey }
                        : {}),
                };
                const finish = (result) => {
                    if (ticket) {
                        activeTickets.delete(ticket);
                    }
                    if (context.isCurrent()) {
                        current.feedbackStore?.settle(ticket, result.status);
                        if (ticket) {
                            settledTicket = ticket;
                        }
                    }
                    current.onActionResult?.(result);
                    if (result.finding) {
                        current.onActionFinding?.(result.finding);
                    }
                    return result;
                };
                try {
                    if (current.responseActionInvoker && invokedDoc) {
                        const syncPorts = {
                            submit: captureAutosaveSnapshot,
                            dispatchHostEvent: (eventName, detail, invokedAction) => {
                                current.onHostEvent?.(eventName, detail, invokedAction);
                            },
                            ...(current.evaluateActionPrecondition
                                ? { evaluatePrecondition: current.evaluateActionPrecondition }
                                : {}),
                            ...(current.evaluateActionEffectExpression
                                ? { evaluateEffectExpression: current.evaluateActionEffectExpression }
                                : {}),
                            ...(current.dispatchActionEffect
                                ? { dispatchEffect: current.dispatchActionEffect }
                                : {}),
                            ...(current.resolveActionIdempotencyKey
                                ? { resolveIdempotencyKey: current.resolveActionIdempotencyKey }
                                : {}),
                        };
                        const raw = await current.responseActionInvoker({
                            document: invokedDoc,
                            actionRef: action.id,
                            ports: syncPorts,
                        });
                        return finish('invocation' in raw ? raw.invocation : raw);
                    }
                    return finish(await invokeResponseActionAsync(invokedDoc, action.id, ports));
                }
                catch (error) {
                    return finish({
                        status: 'failed',
                        resolution: resolveResponseAction(invokedDoc, action.id),
                        validationTuple: null,
                        detail: null,
                        effectTrace: [],
                        failureReason: error instanceof Error ? error.message : String(error),
                    });
                }
            },
        });
        controllerRef.current = controller;
        return () => {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
            }
            cancelActiveTickets();
            cancelSettledTicket();
            controller.dispose();
        };
    }, [engine, draftSaveFeedback]);
    useEffect(() => {
        if (draftSaveFeedback === 'external' || !engine) {
            return;
        }
        controllerRef.current?.setDocument(responseActionsDocument);
    }, [engine, draftSaveFeedback, responseActionsDocument]);
    return null;
}
/** See `themeScopeRef` — the scope element must not generate a box. */
const THEME_SCOPE_STYLE = { display: 'contents' };
/** Access the FormspecContext. Throws if used outside FormspecProvider. */
export function useFormspecContext() {
    const ctx = useContext(FormspecContext);
    if (!ctx)
        throw new Error('useFormspecContext must be used within a FormspecProvider');
    return ctx;
}
/** Detect the largest matching breakpoint from merged Theme + Component breakpoints (mobile-first). */
function detectBreakpoint(themeBreakpoints, componentBreakpoints) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
        return null;
    return matchBreakpoint(themeBreakpoints, componentBreakpoints, (minWidth) => window.matchMedia(`(min-width: ${minWidth}px)`).matches);
}
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
export function emitThemeTokens(tokens, target) {
    const el = target ?? document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
        el.style.setProperty(`--formspec-${key.replace(/\./g, '-')}`, String(value));
    }
}
import { Path } from '@formspec-org/types';
/** Recursive item lookup by dotted key path. */
export function findItemByKey(items, key) {
    const segments = Path.parse(key).splitNormalized();
    let current = items;
    for (let i = 0; i < segments.length; i++) {
        const found = current.find((item) => item.key === segments[i]);
        if (!found)
            return null;
        if (i === segments.length - 1)
            return found;
        current = found.children || [];
    }
    return null;
}
