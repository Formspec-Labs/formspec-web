'use client';
import { jsx as _jsx } from "react/jsx-runtime";
/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import { createContext, useContext, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { signal } from '@preact/signals-core';
import { createFormEngine, findResponseActionByIntent, missingSubmitActionFinding, resolveResponseAction } from '@formspec-org/engine';
import { planDefinitionFallback, planComponentTree, preparePlanContext, ensureActionButton, mergeFormPresentationForPlanning, } from '@formspec-org/layout';
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
    const { engine: externalEngine, definition, componentDocument, themeDocument, responseActionsDocument, initialData, registryEntries, runtimeContext, issuerFetcher, issuerOverride, components = {}, onSubmit, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, children, } = props;
    const hasIssuerOverrideProp = Object.prototype.hasOwnProperty.call(props, 'issuerOverride');
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
            theme: themeDocument,
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
    }, [engine, componentDocument, themeDocument, activeBreakpoint, onSubmit, responseActionsDocument, mergedFormPresentation]);
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
    // Auto-emit theme tokens as CSS custom properties when themeDocument has tokens
    useEffect(() => {
        if (typeof document === 'undefined' || !themeDocument?.tokens)
            return;
        emitThemeTokens(themeDocument.tokens);
    }, [themeDocument]);
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
        themeDocument,
        componentDocument,
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
    }), [engine, layoutPlan, components, themeDocument, componentDocument, responseActionsDocument, onSubmit, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, resolveActionRef, touchField, touchAllFields, touchedVersionSignal, isTouched, registryMap, mergedFormPresentation]);
    return (_jsx(FormspecContext.Provider, { value: value, children: children }));
}
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
 * Defaults to `document.documentElement` when no target is provided.
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
