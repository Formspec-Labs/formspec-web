'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Recursive LayoutNode renderer — dispatches to field or layout components. */
import { useMemo, useCallback, useEffect } from 'react';
import { signal as createSignal } from '@preact/signals-core';
import { invokeResponseAction, } from '@formspec-org/engine';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';
import { useField } from './use-field';
import { useForm } from './use-form';
import { useWhen } from './use-when';
import { DefaultField } from './defaults/fields/default-field';
import { DefaultLayout } from './defaults/layout/default-layout';
import { Wizard } from './defaults/layout/wizard';
import { Tabs } from './defaults/layout/tabs';
import { DisplayNode } from './node-renderer-display.js';
import { RepeatGroup, RepeatAccordion } from './node-renderer-repeat.js';
import { projectionMetadataAttrs } from './projection-metadata.js';
const BUILTIN_LAYOUT = {
    Wizard,
    Tabs,
};
const FALLBACK_MAP = {
    MoneyInput: 'NumberInput',
    Slider: 'NumberInput',
    Rating: 'NumberInput',
    Signature: 'FileUpload',
    Badge: 'Text',
    ProgressBar: 'Text',
    Summary: 'Text',
    Panel: 'Card',
    Modal: 'Collapsible',
    Popover: 'Collapsible',
    DataTable: 'Card',
    Tabs: 'Stack',
    Wizard: 'Stack',
};
/** Render a single LayoutNode, recursing into children. */
export function FormspecNode({ node }) {
    const renderChild = useCallback((child) => _jsx(FormspecNode, { node: child }), []);
    if (node.isRepeatTemplate && node.repeatPath) {
        return _jsx(RepeatGroup, { node: node, renderChild: renderChild });
    }
    if (node.component === 'Accordion' && typeof node.props?.bind === 'string') {
        return _jsx(RepeatAccordion, { node: node, renderChild: renderChild });
    }
    const modalAutoSkipsWhenGuard = node.component === 'Modal' && node.props?.trigger === 'auto';
    if (node.when && !modalAutoSkipsWhenGuard) {
        return _jsx(WhenGuard, { node: node });
    }
    if (node.category === 'field' && node.bindPath) {
        return _jsx(FieldNode, { node: node });
    }
    if (node.category === 'display') {
        return _jsx(DisplayNode, { node: node });
    }
    if (node.component === 'DataTable') {
        return _jsx(DisplayNode, { node: node });
    }
    if (node.component === 'ActionButton') {
        return _jsx(ActionButtonNode, { node: node });
    }
    return _jsx(LayoutNodeRenderer, { node: node });
}
function resolveActionButtonLabel(value, fallback) {
    if (value && typeof value === 'object') {
        const label = value;
        if (typeof label.literal === 'string')
            return label.literal;
    }
    return typeof value === 'string' ? value : fallback;
}
function actionRefFor(node) {
    const value = node.props?.actionRef;
    return typeof value === 'string' ? value : '';
}
function isPromiseLike(value) {
    return !!value && typeof value.then === 'function';
}
function normalizeInvokerResult(result) {
    return 'invocation' in result ? result.invocation : result;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function ActionButtonNode({ node }) {
    const { onSubmit, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, responseActionsDocument, resolveActionRef, } = useFormspecContext();
    const form = useForm();
    const actionRef = actionRefFor(node);
    const resolution = resolveActionRef(actionRef, node.id);
    const finding = resolution.finding;
    const findingKey = finding
        ? `${finding.code}:${finding.kind}:${finding.nodeId ?? ''}:${finding.target}:${finding.reason ?? ''}`
        : '';
    const label = resolveActionButtonLabel(node.props?.label, 'Submit');
    useEffect(() => {
        if (finding) {
            onActionFinding?.(finding);
        }
    }, [findingKey, onActionFinding]);
    const handleClick = useCallback(() => {
        const ports = {
            submit: ({ profile, validationTuple }) => form.submit({ profile, validationTuple }),
            dispatchHostEvent: (eventName, detail, action) => {
                onHostEvent?.(eventName, detail, action);
                if (eventName === 'formspec-submit') {
                    onSubmit?.(detail);
                }
            },
            ...(evaluateActionPrecondition ? { evaluatePrecondition: evaluateActionPrecondition } : {}),
            ...(dispatchActionEffect ? { dispatchEffect: dispatchActionEffect } : {}),
            ...(resolveActionIdempotencyKey ? { resolveIdempotencyKey: resolveActionIdempotencyKey } : {}),
        };
        const finish = (result) => {
            onActionResult?.(result);
            if (result.finding) {
                onActionFinding?.(result.finding);
            }
        };
        if (responseActionInvoker) {
            const result = responseActionInvoker({
                document: responseActionsDocument,
                actionRef,
                nodeId: node.id,
                ports,
            });
            if (isPromiseLike(result)) {
                void result
                    .then(value => finish(normalizeInvokerResult(value)))
                    .catch(error => finish({
                    status: 'failed',
                    resolution,
                    validationTuple: null,
                    detail: null,
                    effectTrace: [],
                    failureReason: errorMessage(error),
                }));
                return;
            }
            finish(normalizeInvokerResult(result));
            return;
        }
        finish(invokeResponseAction(responseActionsDocument, actionRef, ports, node.id));
    }, [
        actionRef,
        dispatchActionEffect,
        evaluateActionPrecondition,
        form,
        node.id,
        onActionFinding,
        onActionResult,
        onHostEvent,
        onSubmit,
        responseActionInvoker,
        resolveActionIdempotencyKey,
        responseActionsDocument,
    ]);
    return (_jsx("button", { 
        // type="button" mirrors the webcomponent's ActionButton renderer
        // (packages/formspec-webcomponent/src/components/interactive.ts):
        // §10 is silent on the HTML type, but if an ActionButton lives
        // inside a parent <form> and the click handler throws,
        // type="submit" cascades to native form submission and bypasses
        // Response Actions entirely. type="button" eliminates the
        // foot-gun and keeps cross-renderer parity.
        type: "button", className: node.cssClasses?.join(' ') || 'formspec-action formspec-submit', disabled: !resolution.resolved, onClick: handleClick, ...projectionMetadataAttrs(node), children: label }));
}
function WhenGuard({ node }) {
    const visible = useWhen(node.when, node.whenPrefix);
    const innerNode = useMemo(() => ({ ...node, when: undefined, whenPrefix: undefined }), [node]);
    if (!visible)
        return null;
    return _jsx(FormspecNode, { node: innerNode });
}
function FieldNode({ node }) {
    const { components } = useFormspecContext();
    const field = useField(node.bindPath);
    if (!field.visible && field.disabledDisplay !== 'protected')
        return null;
    const componentName = node.component;
    const exact = components.fields?.[componentName];
    const fallbackName = !exact ? FALLBACK_MAP[componentName] : undefined;
    const Component = exact ??
        (fallbackName ? components.fields?.[fallbackName] : undefined) ??
        DefaultField;
    return _jsx(Component, { field: field, node: node });
}
function LayoutNodeRenderer({ node }) {
    if (node.bindPath) {
        return _jsx(RelevanceGatedLayout, { node: node });
    }
    return _jsx(LayoutNodeInner, { node: node });
}
const ALWAYS_RELEVANT = createSignal(true);
function RelevanceGatedLayout({ node }) {
    const { engine } = useFormspecContext();
    const relevanceSignal = engine.relevantSignals[node.bindPath] ?? ALWAYS_RELEVANT;
    const isRelevant = useSignal(relevanceSignal);
    if (!isRelevant)
        return null;
    return _jsx(LayoutNodeInner, { node: node });
}
function LayoutNodeInner({ node }) {
    const { components, formPresentation } = useFormspecContext();
    if (node.component === 'Stack' && node.children.length > 0) {
        const pageMode = node.pageMode;
        const hasPages = node.children.some((c) => c.component === 'Section');
        if (hasPages && (pageMode === 'wizard' || pageMode === 'tabs')) {
            const orphans = node.children.filter((c) => c.component !== 'Section');
            const pages = node.children.filter((c) => c.component === 'Section');
            const fp = formPresentation ?? {};
            if (pageMode === 'wizard' && pages.length > 0) {
                const wizardNode = {
                    id: `${node.id}-page-mode-wizard`,
                    component: 'Wizard',
                    category: 'layout',
                    props: {
                        showProgress: fp.showProgress !== false,
                        allowSkip: !!fp.allowSkip,
                        sidenav: fp.sidenav,
                    },
                    cssClasses: node.cssClasses ?? [],
                    style: node.style,
                    accessibility: node.accessibility,
                    componentGraphIdentity: node.componentGraphIdentity,
                    uiGraphRoutePolicy: node.uiGraphRoutePolicy,
                    children: pages,
                };
                return (_jsxs(_Fragment, { children: [orphans.map((child) => (_jsx(FormspecNode, { node: child }, child.id))), _jsx(LayoutNodeInner, { node: wizardNode })] }));
            }
            if (pageMode === 'tabs' && pages.length > 0) {
                const tabsNode = {
                    id: `${node.id}-page-mode-tabs`,
                    component: 'Tabs',
                    category: 'layout',
                    props: {
                        tabLabels: pages.map((p) => p.props?.title
                            || p.props?.label
                            || p.fieldItem?.label),
                        placement: fp.tabPosition || 'top',
                        defaultTab: fp.defaultTab ?? 0,
                    },
                    cssClasses: node.cssClasses ?? [],
                    style: node.style,
                    accessibility: node.accessibility,
                    componentGraphIdentity: node.componentGraphIdentity,
                    uiGraphRoutePolicy: node.uiGraphRoutePolicy,
                    children: pages,
                };
                return (_jsxs(_Fragment, { children: [_jsx(LayoutNodeInner, { node: tabsNode }), orphans.map((child) => (_jsx(FormspecNode, { node: child }, child.id)))] }));
            }
        }
    }
    const componentName = node.component;
    const exact = components.layout?.[componentName];
    const builtin = !exact ? BUILTIN_LAYOUT[componentName] : undefined;
    const fallbackName = (!exact && !builtin) ? FALLBACK_MAP[componentName] : undefined;
    const Component = exact ??
        builtin ??
        (fallbackName ? (components.layout?.[fallbackName] ?? BUILTIN_LAYOUT[fallbackName]) : undefined) ??
        DefaultLayout;
    return (_jsx(Component, { node: node, children: node.children.map((child) => (_jsx(FormspecNode, { node: child }, child.id))) }));
}
export { DisplayNode } from './node-renderer-display.js';
export { RepeatGroup, RepeatAccordion, rewriteBindPaths } from './node-renderer-repeat.js';
