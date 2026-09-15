import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc A reusable, data-only panel for declarative application surfaces.
 *
 * The panel has no product vocabulary. JSON configuration chooses generic
 * presentation blocks, qualified widget data supplies values, route parameters
 * supply URL facts, and resolved Response Actions supply button labels and
 * intents. Product-specific React, CSS, sample data, and action copy do not
 * belong here.
 *
 * Product content also fails closed on Needs traceability. The only accepted
 * citation form is the canonical generated-artifact anchor
 * `need:<id>@<revision>` under `x-generation.anchors`. The panel header, every
 * block, every authored field or column, and every action presentation carries
 * its own anchor. Parent anchors never authorize untraced child content.
 * Invalid or absent anchors never become DOM claims.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { structuredPanelConfirmationAdmission, } from '@formspec-org/app-graph';
import { Heading, nextLevel } from '../heading.js';
import { admitSurfaceWidgetActionInput } from '../widget-action-runtime.js';
import { WidgetEmptyState } from './empty-state.js';
import { surfaceSemanticOutputSubjectRef, useSurfaceSemanticOutputs, } from '../semantic-output.js';
const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@[1-9][0-9]*$/;
const SAFE_PATH_PART = /^[a-zA-Z0-9_-]+$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function safeId(value) {
    const id = nonEmptyString(value);
    return id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id) ? id : undefined;
}
function needAnchors(value) {
    const candidate = record(value);
    const generation = record(candidate?.['x-generation']);
    const anchors = generation?.anchors;
    if (!Array.isArray(anchors))
        return [];
    return anchors.flatMap((anchor) => typeof anchor === 'string' && NEED_ANCHOR.test(anchor) ? [anchor] : []);
}
function mergeAnchors(...groups) {
    const merged = [];
    for (const group of groups) {
        for (const anchor of group) {
            if (!merged.includes(anchor))
                merged.push(anchor);
        }
    }
    return merged;
}
function traceAttributes(anchors) {
    if (anchors.length === 0)
        return {};
    const ids = anchors.flatMap((anchor) => {
        const match = NEED_ANCHOR.exec(anchor);
        return match?.[1] ? [match[1]] : [];
    });
    return {
        'data-need-anchors': anchors.join(' '),
        'data-need-ids': [...new Set(ids)].join(' '),
    };
}
/**
 * Reads only own properties through a dot-separated path. Brackets, empty
 * segments, and prototype-bearing names are rejected.
 */
export function readStructuredPanelPath(root, path) {
    if (typeof path !== 'string' || path.length === 0)
        return undefined;
    const parts = path.split('.');
    if (parts.some((part) => !SAFE_PATH_PART.test(part) ||
        UNSAFE_PATH_PARTS.has(part))) {
        return undefined;
    }
    let current = root;
    for (const part of parts) {
        if ((typeof current !== 'object' && typeof current !== 'function') ||
            current === null ||
            !Object.prototype.hasOwnProperty.call(current, part)) {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
function scalarValue(value) {
    if (typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    return undefined;
}
function scalarText(value) {
    const scalar = scalarValue(value);
    return scalar === undefined ? undefined : String(scalar);
}
function selectedActionPayload(configured, root) {
    if (configured === undefined)
        return undefined;
    const mapping = record(configured);
    if (!mapping)
        return undefined;
    const selected = {};
    for (const [name, candidate] of Object.entries(mapping)) {
        if (!safeId(name))
            return undefined;
        const selector = record(candidate);
        if (!selector || typeof selector.path !== 'string')
            return undefined;
        const value = selector.path === ''
            ? root
            : readStructuredPanelPath(root, selector.path);
        if (value === undefined)
            return undefined;
        selected[name] = value;
    }
    const admission = admitSurfaceWidgetActionInput(selected);
    return admission.accepted ? admission.input : undefined;
}
function resolvedAction(outputName, available) {
    if (!outputName)
        return undefined;
    const matches = available.filter((action) => action.outputName === outputName);
    return matches.length === 1 ? matches[0] : undefined;
}
function StructuredActionButton({ action, label, emphasis, anchors, input, emitAction, rowAction, pendingLabel, successMessage, failureMessage, confirmation, }) {
    const confirmationHeadingId = useId();
    const actionButton = useRef(null);
    const confirmButton = useRef(null);
    const restoreActionFocus = useRef(false);
    const [status, setStatus] = useState('idle');
    useEffect(() => {
        if (status === 'confirming') {
            confirmButton.current?.focus();
            return;
        }
        if (status === 'idle' && restoreActionFocus.current) {
            restoreActionFocus.current = false;
            actionButton.current?.focus();
        }
    }, [status]);
    const visibleLabel = status === 'pending'
        ? pendingLabel ?? label
        : status === 'completed'
            ? successMessage ?? label
            : status === 'failed'
                ? failureMessage ?? label
                : label;
    const invoke = () => {
        const emission = input === undefined
            ? emitAction(action.outputName)
            : emitAction(action.outputName, input);
        if (!emission)
            return;
        setStatus('pending');
        void emission.completion.then((feedback) => {
            setStatus(feedback.status === 'completed'
                ? 'completed'
                : feedback.status === 'obsolete'
                    ? 'idle'
                    : 'failed');
        }).catch(() => setStatus('failed'));
    };
    if (status === 'confirming' && confirmation) {
        return (_jsxs("div", { className: "fs-structured-panel__confirmation", role: "group", "aria-labelledby": confirmationHeadingId, "data-action-confirmation": "", ...traceAttributes(confirmation.anchors), children: [_jsx("strong", { id: confirmationHeadingId, children: confirmation.heading }), _jsx("p", { children: confirmation.body }), _jsxs("div", { className: "fs-structured-panel__confirmation-actions", children: [_jsx("button", { ref: confirmButton, className: "fs-structured-panel__action", type: "button", "data-emphasis": "danger", onClick: invoke, ...traceAttributes(confirmation.anchors), children: confirmation.confirmLabel }), _jsx("button", { className: "fs-structured-panel__action", type: "button", "data-emphasis": "secondary", onClick: () => {
                                restoreActionFocus.current = true;
                                setStatus('idle');
                            }, ...traceAttributes(confirmation.anchors), children: confirmation.cancelLabel })] })] }));
    }
    return (_jsx("button", { ref: actionButton, className: "fs-structured-panel__action", type: "button", "data-row-action": rowAction ? '' : undefined, "data-action-output": action.outputName, "data-action-ref": action.actionRef, "data-action-intent": action.intent, "data-action-status": status, "data-emphasis": emphasis, "aria-busy": status === 'pending' ? 'true' : undefined, disabled: status === 'pending', onClick: () => {
            if (confirmation) {
                setStatus('confirming');
                return;
            }
            invoke();
        }, ...traceAttributes(anchors), children: visibleLabel }));
}
function blockFrame(block, headingLevel, content) {
    const id = safeId(block.id);
    if (!id)
        return null;
    const anchors = needAnchors(block);
    if (anchors.length === 0)
        return null;
    const title = nonEmptyString(block.title);
    const renderedContent = content(anchors);
    if (renderedContent === null || renderedContent === undefined)
        return null;
    return (_jsxs("section", { className: "fs-structured-panel__block", "data-block-id": id, "data-block-type": nonEmptyString(block.type), ...traceAttributes(anchors), children: [title ? (_jsx(Heading, { level: headingLevel, className: "fs-structured-panel__block-title", children: title })) : null, renderedContent] }, id));
}
function blockEmpty(block, anchors) {
    const message = nonEmptyString(block.emptyMessage);
    return message ? (_jsx(WidgetEmptyState, { children: _jsx("span", { ...traceAttributes(anchors), children: message }) })) : null;
}
function renderMetric(block, data, headingLevel) {
    return blockFrame(block, headingLevel, (anchors) => {
        const value = scalarText(readStructuredPanelPath(data, block.path));
        if (value === undefined)
            return blockEmpty(block, anchors);
        const label = nonEmptyString(block.label);
        const prefix = typeof block.prefix === 'string' ? block.prefix : '';
        const suffix = typeof block.suffix === 'string' ? block.suffix : '';
        return (_jsxs("div", { className: "fs-structured-panel__metric", ...traceAttributes(anchors), children: [label ? _jsx("span", { className: "fs-structured-panel__metric-label", children: label }) : null, _jsxs("strong", { className: "fs-structured-panel__metric-value", children: [prefix, value, suffix] })] }));
    });
}
function valueForFact(item, data, routeParams) {
    const path = nonEmptyString(item.path);
    const routeParam = nonEmptyString(item.routeParam);
    if ((path === undefined) === (routeParam === undefined))
        return undefined;
    const semanticValue = scalarValue(path
        ? readStructuredPanelPath(data, path)
        : readStructuredPanelPath(routeParams, routeParam));
    return semanticValue === undefined
        ? undefined
        : { value: String(semanticValue), semanticValue };
}
function renderedKeyValueItems(block, data, routeParams) {
    if (!Array.isArray(block.items))
        return [];
    return block.items.flatMap((candidate) => {
        const item = record(candidate);
        const id = safeId(item?.id);
        const label = nonEmptyString(item?.label);
        const anchors = item ? needAnchors(item) : [];
        if (!item || !id || !label || anchors.length === 0)
            return [];
        const value = valueForFact(item, data, routeParams);
        return value === undefined
            ? []
            : [{ id, label, ...value, anchors }];
    });
}
function renderKeyValue(block, data, routeParams, headingLevel) {
    return blockFrame(block, headingLevel, (anchors) => {
        const items = renderedKeyValueItems(block, data, routeParams);
        if (items.length === 0)
            return blockEmpty(block, anchors);
        return (_jsx("dl", { className: "fs-structured-panel__facts", children: items.map((item) => (_jsxs("div", { className: "fs-structured-panel__fact", "data-field-id": item.id, ...traceAttributes(item.anchors), children: [_jsx("dt", { children: item.label }), _jsx("dd", { children: item.value })] }, item.id))) }));
    });
}
function renderList(block, data, headingLevel) {
    return blockFrame(block, headingLevel, (anchors) => {
        const value = readStructuredPanelPath(data, block.path);
        const itemPath = nonEmptyString(block.itemPath);
        const items = Array.isArray(value)
            ? value.flatMap((item) => {
                const display = scalarText(itemPath ? readStructuredPanelPath(item, itemPath) : item);
                return display === undefined ? [] : [display];
            })
            : [];
        if (items.length === 0)
            return blockEmpty(block, anchors);
        const List = block.ordered === true ? 'ol' : 'ul';
        return (_jsx(List, { className: "fs-structured-panel__list", children: items.map((item, index) => (_jsx("li", { ...traceAttributes(anchors), children: item }, `${index}:${item}`))) }));
    });
}
function renderedTableRows(block, data) {
    const rawRows = readStructuredPanelPath(data, block.path);
    return Array.isArray(rawRows)
        ? rawRows.filter((row) => record(row) !== undefined)
        : [];
}
function renderedTableColumns(block) {
    if (!Array.isArray(block.columns))
        return [];
    return block.columns.flatMap((candidate) => {
        const column = record(candidate);
        const id = safeId(column?.id);
        const label = nonEmptyString(column?.label);
        const path = nonEmptyString(column?.path);
        const anchors = column ? needAnchors(column) : [];
        if (!column || !id || !label || !path || anchors.length === 0)
            return [];
        return [{
                id,
                label,
                path,
                numeric: column.numeric === true,
                anchors,
            }];
    });
}
/**
 * The one rule for whether a table row action renders, shared by the DOM and
 * semantic-output publication so neither can claim a control the other lacks.
 * A declared confirmation that cannot render withholds the action rather than
 * degrading it into a one-click destructive control.
 */
function admittedTableRowAction(block, availableActions) {
    const config = record(block.rowAction);
    const configAnchors = config ? needAnchors(config) : [];
    if (!config || configAnchors.length === 0)
        return undefined;
    const action = resolvedAction(nonEmptyString(config.outputName), availableActions);
    const label = action ? literalActionLabel(action) : undefined;
    const columnLabel = nonEmptyString(config.columnLabel);
    const confirmation = structuredPanelConfirmationAdmission(config);
    if (!action || !label || !columnLabel || confirmation.status === 'inadmissible') {
        return undefined;
    }
    return {
        config,
        action,
        label,
        columnLabel,
        emphasis: config.emphasis === 'primary' || config.emphasis === 'danger'
            ? config.emphasis
            : 'secondary',
        anchors: mergeAnchors(configAnchors, action.needAnchors ?? []),
        confirmation: confirmation.status === 'admitted' ? confirmation.confirmation : undefined,
    };
}
function renderTable(block, data, headingLevel, availableActions, emitAction) {
    return blockFrame(block, headingLevel, (anchors) => {
        const rows = renderedTableRows(block, data);
        const columns = renderedTableColumns(block);
        if (rows.length === 0 || columns.length === 0)
            return blockEmpty(block, anchors);
        const caption = nonEmptyString(block.caption);
        const responsiveMode = block.responsiveMode === 'scroll' ? 'scroll' : 'stack';
        const rowAction = admittedTableRowAction(block, availableActions);
        return (_jsx("div", { className: "fs-structured-panel__table-scroll", "data-responsive-mode": responsiveMode, role: "region", tabIndex: 0, "aria-label": caption ?? nonEmptyString(block.title) ?? safeId(block.id), children: _jsxs("table", { className: "fs-structured-panel__table", children: [caption ? _jsx("caption", { children: caption }) : null, _jsx("thead", { children: _jsxs("tr", { children: [columns.map((column) => (_jsx("th", { scope: "col", "data-column-id": column.id, "data-numeric": column.numeric ? 'true' : undefined, ...traceAttributes(column.anchors), children: column.label }, column.id))), rowAction ? (_jsx("th", { scope: "col", "data-column-id": "action", ...traceAttributes(rowAction.anchors), children: rowAction.columnLabel })) : null] }) }), _jsx("tbody", { children: rows.map((row, rowIndex) => (_jsxs("tr", { children: [columns.map((column) => (_jsx("td", { "data-column-id": column.id, "data-column-label": column.label, "data-numeric": column.numeric ? 'true' : undefined, ...traceAttributes(column.anchors), children: scalarText(readStructuredPanelPath(row, column.path)) ?? '' }, column.id))), rowAction ? (_jsx("td", { "data-column-id": "action", "data-column-label": rowAction.columnLabel, ...traceAttributes(rowAction.anchors), children: rowAction.config.payload !== undefined &&
                                        selectedActionPayload(rowAction.config.payload, row) === undefined
                                        ? null
                                        : (_jsx(StructuredActionButton, { action: rowAction.action, label: rowAction.label, emphasis: rowAction.emphasis, anchors: rowAction.anchors, input: selectedActionPayload(rowAction.config.payload, row), emitAction: emitAction, rowAction: true, pendingLabel: nonEmptyString(rowAction.config.pendingLabel), successMessage: nonEmptyString(rowAction.config.successMessage), failureMessage: nonEmptyString(rowAction.config.failureMessage), confirmation: rowAction.confirmation })) })) : null] }, `row-${rowIndex}`))) })] }) }));
    });
}
function renderProgress(block, data, headingLevel) {
    return blockFrame(block, headingLevel, (anchors) => {
        const value = readStructuredPanelPath(data, block.path);
        const dynamicMax = nonEmptyString(block.maxPath)
            ? readStructuredPanelPath(data, block.maxPath)
            : undefined;
        const max = typeof dynamicMax === 'number' &&
            Number.isFinite(dynamicMax) &&
            dynamicMax > 0
            ? dynamicMax
            : typeof block.max === 'number' &&
                Number.isFinite(block.max) &&
                block.max > 0
                ? block.max
                : 100;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return blockEmpty(block, anchors);
        }
        const label = nonEmptyString(block.label);
        const suffix = typeof block.suffix === 'string' ? block.suffix : '';
        return (_jsxs("div", { className: "fs-structured-panel__progress", ...traceAttributes(anchors), children: [label ? _jsx("span", { children: label }) : null, _jsx("progress", { value: Math.min(Math.max(value, 0), max), max: max }), _jsxs("strong", { children: [value, suffix] })] }));
    });
}
function renderBlock(candidate, data, routeParams, headingLevel, availableActions, emitAction) {
    const block = record(candidate);
    if (!block)
        return null;
    switch (block.type) {
        case 'metric':
            return renderMetric(block, data, headingLevel);
        case 'key-value':
            return renderKeyValue(block, data, routeParams, headingLevel);
        case 'list':
            return renderList(block, data, headingLevel);
        case 'table':
            return renderTable(block, data, headingLevel, availableActions, emitAction);
        case 'progress':
            return renderProgress(block, data, headingLevel);
        default:
            return null;
    }
}
function literalActionLabel(action) {
    return action.label && 'literal' in action.label
        ? nonEmptyString(action.label.literal)
        : undefined;
}
function renderedActionPresentations(configured, available, data) {
    if (!Array.isArray(configured))
        return [];
    const presentations = configured.flatMap((candidate, index) => {
        const presentation = record(candidate);
        const outputName = nonEmptyString(presentation?.outputName);
        const anchors = presentation ? needAnchors(presentation) : [];
        if (!presentation || !outputName || anchors.length === 0)
            return [];
        const action = resolvedAction(outputName, available);
        const label = action ? literalActionLabel(action) : undefined;
        if (!action || !label)
            return [];
        const authoredOrder = typeof presentation.order === 'number' && Number.isFinite(presentation.order)
            ? presentation.order
            : index;
        const emphasis = presentation.emphasis === 'primary' ||
            presentation.emphasis === 'secondary' ||
            presentation.emphasis === 'danger'
            ? presentation.emphasis
            : 'secondary';
        const input = selectedActionPayload(presentation.payload, data);
        if (presentation.payload !== undefined && input === undefined)
            return [];
        const confirmation = structuredPanelConfirmationAdmission(presentation);
        if (confirmation.status === 'inadmissible')
            return [];
        return [{
                action,
                label,
                anchors: mergeAnchors(anchors, action.needAnchors ?? []),
                authoredOrder,
                index,
                emphasis,
                input,
                pendingLabel: nonEmptyString(presentation.pendingLabel),
                successMessage: nonEmptyString(presentation.successMessage),
                failureMessage: nonEmptyString(presentation.failureMessage),
                confirmation: confirmation.status === 'admitted' ? confirmation.confirmation : undefined,
            }];
    });
    presentations.sort((left, right) => left.authoredOrder - right.authoredOrder || left.index - right.index);
    return presentations;
}
function renderActions(presentations, emitAction) {
    if (presentations.length === 0)
        return null;
    return (_jsx("div", { className: "fs-structured-panel__actions", children: presentations.map(({ action, label, anchors, emphasis, input, pendingLabel, successMessage, failureMessage, confirmation, }) => {
            return (_jsx(StructuredActionButton, { action: action, label: label, emphasis: emphasis, anchors: anchors, input: input, emitAction: emitAction, pendingLabel: pendingLabel, successMessage: successMessage, failureMessage: failureMessage, confirmation: confirmation }, action.outputName));
        }) }));
}
function semanticDeclaration(segments, details = {}) {
    const subjectRef = surfaceSemanticOutputSubjectRef(...segments);
    if (!subjectRef)
        return undefined;
    return {
        subjectRef,
        ...(details.operable === undefined ? {} : { operable: details.operable }),
        ...(details.semanticValue === undefined
            ? {}
            : { semanticValue: details.semanticValue }),
    };
}
function structuredBlockSemanticOutputs(entry, baseSegments, data, routeParams, actions) {
    const { block, id } = entry;
    const blockSegments = [...baseSegments, id];
    const outputs = [];
    const blockOutput = semanticDeclaration(blockSegments);
    if (blockOutput)
        outputs.push(blockOutput);
    if (block.type === 'key-value') {
        for (const item of renderedKeyValueItems(block, data, routeParams)) {
            const output = semanticDeclaration([...blockSegments, item.id], { semanticValue: item.semanticValue });
            if (output)
                outputs.push(output);
        }
    }
    if (block.type === 'table') {
        const rows = renderedTableRows(block, data);
        const columns = renderedTableColumns(block);
        if (rows.length === 0 || columns.length === 0)
            return outputs;
        for (const column of columns) {
            const output = semanticDeclaration([...blockSegments, column.id]);
            if (output)
                outputs.push(output);
        }
        const rowAction = admittedTableRowAction(block, actions)?.action;
        if (rowAction) {
            const output = semanticDeclaration([...blockSegments, rowAction.outputName], {
                semanticValue: {
                    outputName: rowAction.outputName,
                    actionRef: rowAction.actionRef,
                    intent: rowAction.intent,
                },
            });
            if (output)
                outputs.push(output);
        }
    }
    return outputs;
}
function omitDuplicateSemanticSubjects(outputs) {
    const counts = new Map();
    for (const output of outputs) {
        counts.set(output.subjectRef, (counts.get(output.subjectRef) ?? 0) + 1);
    }
    return outputs.filter((output) => counts.get(output.subjectRef) === 1);
}
export function StructuredPanel({ actions = [], config, data, emitAction, headingLevel, route, slot, semanticOutputScope, }) {
    const panel = record(config) ?? {};
    const panelAnchors = needAnchors(panel);
    const configuredBlocks = Array.isArray(panel.blocks) ? panel.blocks : [];
    const blockAnchors = configuredBlocks.flatMap(needAnchors);
    const configuredActions = Array.isArray(panel.actions) ? panel.actions : [];
    const actionAnchors = configuredActions.flatMap(needAnchors);
    const allAnchors = mergeAnchors(panelAnchors, blockAnchors, actionAnchors);
    const authoredPanelId = safeId(panel.id);
    const panelId = authoredPanelId ?? slot.id;
    const eyebrow = panelAnchors.length > 0 ? nonEmptyString(panel.eyebrow) : undefined;
    const state = panelAnchors.length > 0 ? nonEmptyString(panel.state) : undefined;
    const title = panelAnchors.length > 0 ? nonEmptyString(panel.title) : undefined;
    const body = panelAnchors.length > 0 ? nonEmptyString(panel.body) : undefined;
    const header = eyebrow || state || title || body;
    const blockHeadingLevel = title ? nextLevel(headingLevel) : headingLevel;
    const renderedBlockEntries = configuredBlocks.flatMap((candidate) => {
        const block = record(candidate);
        const id = safeId(block?.id);
        if (!block || !id)
            return [];
        const node = renderBlock(block, data, route.params, blockHeadingLevel, actions, emitAction);
        return node === null || node === undefined
            ? []
            : [{ block, id, node }];
    });
    const renderedBlocks = renderedBlockEntries.map((entry) => entry.node);
    const actionPresentations = renderedActionPresentations(configuredActions, actions, data);
    const renderedActions = renderActions(actionPresentations, emitAction);
    const emptyMessage = panelAnchors.length > 0
        ? nonEmptyString(panel.emptyMessage)
        : undefined;
    const panelRenders = Boolean(header)
        || renderedBlocks.length > 0
        || actionPresentations.length > 0
        || emptyMessage !== undefined;
    const baseSegments = panelRenders && authoredPanelId
        ? [route.routeId, slot.id, authoredPanelId]
        : undefined;
    const semanticOutputs = [];
    if (baseSegments) {
        const panelOutput = semanticDeclaration(baseSegments);
        if (panelOutput)
            semanticOutputs.push(panelOutput);
        for (const entry of renderedBlockEntries) {
            semanticOutputs.push(...structuredBlockSemanticOutputs(entry, baseSegments, data, route.params, actions));
        }
        for (const presentation of actionPresentations) {
            const output = semanticDeclaration([...baseSegments, presentation.action.outputName], {
                semanticValue: {
                    outputName: presentation.action.outputName,
                    actionRef: presentation.action.actionRef,
                    intent: presentation.action.intent,
                },
            });
            if (output)
                semanticOutputs.push(output);
        }
    }
    useSurfaceSemanticOutputs(semanticOutputScope, omitDuplicateSemanticSubjects(semanticOutputs));
    if (!header && renderedBlocks.length === 0 && !renderedActions) {
        if (!emptyMessage)
            return null;
        return (_jsx("div", { className: "fs-structured-panel", "data-widget": "structured-panel", "data-panel-id": panelId, "data-trace-state": "present", ...traceAttributes(allAnchors), children: _jsx(WidgetEmptyState, { children: emptyMessage }) }));
    }
    return (_jsxs("article", { className: "fs-structured-panel", "data-widget": "structured-panel", "data-panel-id": panelId, "data-trace-state": "present", ...traceAttributes(allAnchors), children: [header ? (_jsxs("header", { className: "fs-structured-panel__header", ...traceAttributes(panelAnchors), children: [_jsxs("div", { className: "fs-structured-panel__meta", children: [eyebrow ? _jsx("span", { "data-panel-field": "eyebrow", children: eyebrow }) : null, state ? _jsx("span", { "data-panel-field": "state", children: state }) : null] }), title ? (_jsx(Heading, { level: headingLevel, className: "fs-structured-panel__title", children: title })) : null, body ? _jsx("p", { className: "fs-structured-panel__body", children: body }) : null] })) : null, renderedBlocks.length > 0 ? (_jsx("div", { className: "fs-structured-panel__blocks", children: renderedBlocks })) : null, renderedActions] }));
}
