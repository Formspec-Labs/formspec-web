'use client';
import { jsx as _jsx } from "react/jsx-runtime";
/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import { createContext, useContext, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { signal } from '@preact/signals-core';
import { createFormEngine, findResponseActionByIntent, missingSubmitActionFinding, resolveResponseAction } from '@formspec-org/engine';
import { buildPlatformTheme, mergePlatformAndTenantTheme, planDefinitionFallback, planComponentTree, preparePlanContext, ensureActionButton, mergeFormPresentationForPlanning, } from '@formspec-org/layout';
const platformTheme = buildPlatformTheme();
const FormspecContext = createContext(null);
function pageModeFromPresentation(presentation) {
    return presentation?.pageMode === 'wizard' || presentation?.pageMode === 'tabs'
        ? presentation.pageMode
        : undefined;
}
/**
 * Provides FormEngine and layout plan to descendant hooks and renderers.
 *
 * Accepts either a pre-built `engine` or a raw `definition` (creates engine internally).
 */
export function FormspecProvider(props) {
    const { engine: externalEngine, definition, componentDocument, componentGraph, hostEvidence, themeDocument, responseActionsDocument, initialData, registryEntries, runtimeContext, issuerFetcher, issuerOverride, components = {}, onSubmit, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, children, } = props;
    const shouldEmitThemeTokens = props.emitThemeTokens ?? true;
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
        });
        if (initialData) {
            applyInitialData(eng, initialData);
        }
        return eng;
    }, [externalEngine, definition, registryEntries, runtimeContext, initialData, issuerFetcher]);
    useEffect(() => {
        if (hasIssuerOverrideProp) {
            engine.setIssuerOverride(issuerOverride);
        }
    }, [engine, hasIssuerOverrideProp, issuerOverride]);
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
    // Responsive breakpoint detection — match component document breakpoints via matchMedia
    const [activeBreakpoint, setActiveBreakpoint] = useState(() => {
        if (typeof window === 'undefined' || !componentDocument?.breakpoints)
            return null;
        return detectBreakpoint(componentDocument.breakpoints);
    });
    useEffect(() => {
        if (typeof window === 'undefined' || !componentDocument?.breakpoints)
            return;
        const breakpoints = componentDocument.breakpoints;
        const entries = Object.entries(breakpoints)
            .map(([name, bp]) => {
            const v = typeof bp === 'number' ? bp : (bp.minWidth ?? null);
            return v != null ? [name, v] : null;
        })
            .filter((e) => e !== null)
            .sort(([, a], [, b]) => a - b);
        if (entries.length === 0)
            return;
        const queries = entries.map(([name, minWidth]) => ({
            name,
            mql: window.matchMedia(`(min-width: ${minWidth}px)`),
        }));
        const update = () => setActiveBreakpoint(detectBreakpoint(breakpoints));
        for (const { mql } of queries)
            mql.addEventListener('change', update);
        return () => { for (const { mql } of queries)
            mql.removeEventListener('change', update); };
    }, [componentDocument]);
    const mergedFormPresentation = useMemo(() => engine
        ? mergeFormPresentationForPlanning(engine.getDefinition().formPresentation, componentDocument?.formPresentation)
        : undefined, [engine, componentDocument]);
    const layoutPlan = useMemo(() => {
        if (!engine)
            return null;
        const def = engine.getDefinition();
        const items = def.items || [];
        const pageMode = pageModeFromPresentation(mergedFormPresentation);
        const planCtx = preparePlanContext({
            items,
            formPresentation: mergedFormPresentation,
            componentDocument,
            componentGraph: componentGraph ?? undefined,
            hostEvidence: hostEvidence ?? undefined,
            theme: effectiveThemeDocument,
            activeBreakpoint,
            findItem: (key) => findItemByKey(items, key),
        });
        let root;
        if (componentDocument?.tree) {
            root = planComponentTree(componentDocument.tree, planCtx);
        }
        else {
            // planDefinitionFallback returns an array — wrap in a root Stack node
            const nodes = planDefinitionFallback(items, planCtx);
            root = {
                id: 'root',
                component: 'Stack',
                category: 'layout',
                props: {},
                cssClasses: [],
                children: nodes,
                pageMode: pageMode && nodes.some((node) => node.component === 'Section')
                    ? pageMode
                    : undefined,
            };
        }
        // §10: only inject an ActionButton when a submit-intent Action
        // actually exists in the loaded Response Actions document. §10
        // forbids implicit-default Actions and free-string fallbacks, so
        // auto-injection MUST be a no-op when no submit Action is published.
        if (onSubmit) {
            const submitAction = findResponseActionByIntent(responseActionsDocument, 'submit');
            if (submitAction) {
                ensureActionButton(root, planCtx.nextId, { pageMode, actionRef: submitAction.id });
            }
        }
        return root;
    }, [engine, componentDocument, componentGraph, hostEvidence, effectiveThemeDocument, activeBreakpoint, onSubmit, responseActionsDocument, mergedFormPresentation]);
    // §10: surface a finding when the host wires onSubmit but no submit Action
    // is published — otherwise auto-inject silently no-ops.
    useEffect(() => {
        if (!onSubmit || !onActionFinding)
            return;
        if (findResponseActionByIntent(responseActionsDocument, 'submit'))
            return;
        onActionFinding(missingSubmitActionFinding());
    }, [onSubmit, onActionFinding, responseActionsDocument]);
    // Touched tracking — stable across re-renders
    const touchedFieldsRef = useRef(new Set());
    const touchedVersionSignal = useMemo(() => signal(0), []);
    const touchField = useCallback((path) => {
        if (!touchedFieldsRef.current.has(path)) {
            touchedFieldsRef.current.add(path);
            touchedVersionSignal.value += 1;
        }
    }, [touchedVersionSignal]);
    const touchAllFields = useCallback(() => {
        const def = engine.getDefinition();
        const walk = (items, prefix) => {
            for (const item of items) {
                const path = prefix ? `${prefix}.${item.key}` : item.key;
                if (item.type === 'field')
                    touchField(path);
                if (item.children)
                    walk(item.children, path);
            }
        };
        walk(def.items || [], '');
    }, [engine, touchField]);
    const isTouched = useCallback((path) => {
        return touchedFieldsRef.current.has(path);
    }, []);
    const resolveActionRef = useCallback((actionRef, nodeId) => resolveResponseAction(responseActionsDocument, actionRef, nodeId), [responseActionsDocument]);
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
    const value = useMemo(() => ({
        engine,
        layoutPlan,
        components,
        themeDocument: effectiveThemeDocument,
        emitThemeTokens: shouldEmitThemeTokens,
        componentDocument,
        componentGraph,
        hostEvidence,
        responseActionsDocument,
        onSubmit,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        resolveActionRef,
        touchField,
        touchAllFields,
        touchedVersion: touchedVersionSignal,
        isTouched,
        registryEntries: registryMap,
        formPresentation: mergedFormPresentation,
    }), [engine, layoutPlan, components, effectiveThemeDocument, shouldEmitThemeTokens, componentDocument, componentGraph, hostEvidence, responseActionsDocument, onSubmit, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, resolveActionRef, touchField, touchAllFields, touchedVersionSignal, isTouched, registryMap, mergedFormPresentation]);
    return (_jsx(FormspecContext.Provider, { value: value, children: _jsx("div", { ref: themeScopeRef, className: "formspec-theme-scope", style: THEME_SCOPE_STYLE, children: children }) }));
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
/** Detect the largest matching breakpoint from a breakpoints map (mobile-first).
 *  Breakpoint values may be plain integers `{ sm: 576 }` or objects `{ sm: { minWidth: 576 } }`.
 */
function detectBreakpoint(breakpoints) {
    if (typeof window === 'undefined')
        return null;
    let match = null;
    const entries = Object.entries(breakpoints)
        .map(([name, bp]) => {
        const v = typeof bp === 'number' ? bp : (bp.minWidth ?? null);
        return v != null ? [name, v] : null;
    })
        .filter((e) => e !== null)
        .sort(([, a], [, b]) => a - b);
    for (const [name, minWidth] of entries) {
        if (window.matchMedia(`(min-width: ${minWidth}px)`).matches) {
            match = name;
        }
    }
    return match;
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
/** Walk nested initial data and set leaf values on the engine with dotted paths. */
function applyInitialData(engine, data, prefix = '') {
    for (const [key, value] of Object.entries(data)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
            // Repeat group: ensure instances exist, then recurse into each
            const currentCount = engine.repeats[path]?.value ?? 0;
            for (let i = currentCount; i < value.length; i++) {
                engine.addRepeatInstance(path);
            }
            for (let i = 0; i < value.length; i++) {
                if (value[i] != null && typeof value[i] === 'object') {
                    applyInitialData(engine, value[i], `${path}[${i}]`);
                }
            }
        }
        else if (value !== null && typeof value === 'object') {
            applyInitialData(engine, value, path);
        }
        else {
            engine.setValue(path, value);
        }
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
