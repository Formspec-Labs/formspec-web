import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { generationNeedAnchors } from '@formspec-org/surface';
import { Heading } from './heading.js';
import { needTraceAttributes } from './need-trace.js';
/** Registry inventory entries required by the generic shell state renderer. */
export const MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES = [
    { pointerPattern: '/stateViews/*', kind: 'module-widget-state-view' },
    { pointerPattern: '/stateViews/*/actions/*', kind: 'module-widget-state-action' },
];
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
const SAFE_PATH_PART = /^[a-zA-Z0-9_-]+$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
function readOwnPath(root, path) {
    if (path === '')
        return root;
    const parts = path.split('.');
    if (parts.some((part) => !SAFE_PATH_PART.test(part) || UNSAFE_PATH_PARTS.has(part))) {
        return undefined;
    }
    let current = root;
    for (const part of parts) {
        if (typeof current !== 'object' ||
            current === null ||
            !Object.prototype.hasOwnProperty.call(current, part)) {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
function emptyValue(value) {
    if (value === undefined || value === null || value === '')
        return true;
    if (Array.isArray(value))
        return value.length === 0;
    return record(value) !== undefined && Object.keys(value).length === 0;
}
/** True only when an explicit safe selector resolves to an empty value. */
export function widgetDataMatchesEmptyWhen(config, data) {
    const selector = record(config.emptyWhen);
    const inputName = nonEmptyString(selector?.inputName);
    if (!selector ||
        !inputName ||
        !SAFE_PATH_PART.test(inputName) ||
        UNSAFE_PATH_PARTS.has(inputName) ||
        !Object.prototype.hasOwnProperty.call(data, inputName)) {
        return false;
    }
    const path = selector.path === undefined
        ? ''
        : typeof selector.path === 'string'
            ? selector.path
            : undefined;
    if (path === undefined)
        return false;
    return emptyValue(readOwnPath(data[inputName], path));
}
function literalActionLabel(action) {
    return action.label && 'literal' in action.label
        ? nonEmptyString(action.label.literal)
        : undefined;
}
/**
 * Render only independently traced state and action objects. A parent config
 * trace never authorizes state copy or controls.
 */
export function ModuleWidgetStateView({ state, config, headingLevel, actions, emitAction, onRetry, fallback, }) {
    const stateViews = record(config.stateViews);
    const view = record(stateViews?.[state]);
    const viewAnchors = generationNeedAnchors(view);
    if (!view || viewAnchors.length === 0)
        return fallback;
    const heading = nonEmptyString(view.heading);
    const body = nonEmptyString(view.body);
    const configuredActions = Array.isArray(view.actions) ? view.actions : [];
    const renderedActions = [];
    configuredActions.forEach((candidate, index) => {
        const actionView = record(candidate);
        const anchors = generationNeedAnchors(actionView);
        if (!actionView || anchors.length === 0)
            return;
        const emphasis = actionView.emphasis === 'primary' ||
            actionView.emphasis === 'danger'
            ? actionView.emphasis
            : 'secondary';
        if (actionView.kind === 'retry') {
            const label = nonEmptyString(actionView.label);
            if (label) {
                renderedActions.push({
                    key: `retry:${index}`,
                    kind: 'retry',
                    label,
                    emphasis,
                    anchors,
                });
            }
            return;
        }
        if (actionView.kind !== 'output')
            return;
        const outputName = nonEmptyString(actionView.outputName);
        const matches = actions.filter((action) => action.outputName === outputName);
        const action = matches.length === 1 ? matches[0] : undefined;
        const label = action ? literalActionLabel(action) : undefined;
        if (action && label) {
            renderedActions.push({
                key: `output:${outputName}:${index}`,
                kind: 'output',
                label,
                emphasis,
                anchors,
                action,
            });
        }
    });
    if (!heading && !body && renderedActions.length === 0)
        return fallback;
    return (_jsxs("section", { className: "fs-surface-widget-state", "data-widget-state": state, "aria-busy": state === 'loading' ? 'true' : undefined, ...needTraceAttributes(viewAnchors), children: [heading ? (_jsx(Heading, { level: headingLevel, className: "fs-surface-widget-state__heading", children: heading })) : null, body ? _jsx("p", { className: "fs-surface-widget-state__body", children: body }) : null, renderedActions.length > 0 ? (_jsx("div", { className: "fs-surface-widget-state__actions", children: renderedActions.map((action) => (_jsx("button", { className: "fs-surface-widget-state__action", type: "button", "data-state-action": action.kind, "data-state-action-output": action.kind === 'output' ? action.action.outputName : undefined, "data-emphasis": action.emphasis, onClick: action.kind === 'retry'
                        ? onRetry
                        : () => emitAction(action.action.outputName), ...needTraceAttributes(action.anchors, action.kind === 'output' ? action.action.needAnchors : undefined), children: action.label }, action.key))) })) : null] }));
}
