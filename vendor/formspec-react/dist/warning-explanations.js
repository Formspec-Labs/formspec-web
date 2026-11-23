'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Field, group, and form warning controls bound to the engine's live and Submit findings. */
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { computed } from '@preact/signals-core';
import { dedupeSeverityPrefix, readWarningAcknowledgementGroups, } from '@formspec-org/layout';
import { useFormspecContext } from './context';
import { focusFieldIn } from './use-focus-field';
import { useSignal } from './use-signal';
import { WorkspaceFieldJump } from './workspace';
const byProvider = new WeakMap();
const none = [];
function stripRepeatIndices(path) {
    return path.replace(/\[\d+\]/g, '');
}
function collectRenderedGroupTargets(node, exactGroups, repeatGroups) {
    if (!node)
        return;
    if (node.isRepeatTemplate && node.repeatPath) {
        repeatGroups.add(stripRepeatIndices(node.repeatPath));
    }
    else if (node.bindPath && node.category !== 'field' && node.props?.title) {
        exactGroups.add(stripRepeatIndices(node.bindPath));
    }
    for (const child of node.children ?? []) {
        collectRenderedGroupTargets(child, exactGroups, repeatGroups);
    }
}
function hasRenderedGroupTarget(context, warningPath) {
    if (!warningPath || warningPath === '#')
        return false;
    const exactGroups = new Set();
    const repeatGroups = new Set();
    collectRenderedGroupTargets(context.layoutPlan, exactGroups, repeatGroups);
    for (const page of context.workspacePages ?? []) {
        if (page.titleBind)
            exactGroups.add(stripRepeatIndices(page.titleBind));
    }
    const normalized = stripRepeatIndices(warningPath);
    return exactGroups.has(normalized) || repeatGroups.has(normalized);
}
function submitMayHaveWarnings(submit, engine) {
    if (submit === null)
        return false;
    const results = submit.validationReport?.results;
    if (!Array.isArray(results))
        return true;
    if (results.some(r => r.severity === 'warning' || r.constraintKind === 'explanation'))
        return true;
    return (engine.getExplanationEntries?.().length ?? 0) > 0;
}
/** Shapes the live report never evaluates (`timing` submit or demand): only the explanation state names them before Submit. */
function shapesOutsideLiveReport(engine) {
    return new Set((engine.getDefinition().shapes ?? [])
        .filter(shape => (shape.timing ?? 'continuous') !== 'continuous')
        .map(shape => shape.id));
}
function visibleWarnings(context) {
    const cached = byProvider.get(context);
    if (cached)
        return cached;
    const { engine, latestSubmit } = context;
    let outsideLive;
    const groups = computed(() => {
        const result = new Map();
        const submit = latestSubmit.value;
        const submitted = submit !== null;
        const live = engine.shapeResults ?? {};
        const hasLiveWarning = Object.values(live).some(s => s.value.some(r => r.severity === 'warning'));
        // Otherwise the provider's paused read: a keystroke must not cost a Submit evaluation of its own.
        const state = hasLiveWarning || submitMayHaveWarnings(submit, engine)
            ? engine.getExplanationState()
            : context.explanationState.value;
        for (const warning of state?.instances ?? []) {
            const hasFieldTarget = Boolean(engine.getFieldVM?.(warning.path));
            const path = (hasFieldTarget || hasRenderedGroupTarget(context, warning.path)) ? warning.path : '';
            // Before Submit a continuous warning answers beside its live warning; a Submit-timing one beside
            // its field, owed or answered, so a Findings row that names it reaches a control.
            if (!submitted && !live[warning.shapeId]?.value.some(r => r.severity === 'warning' && r.path === warning.path)
                && !(outsideLive ?? (outsideLive = shapesOutsideLiveReport(engine))).has(warning.shapeId))
                continue;
            const list = result.get(path);
            if (list)
                list.push(warning);
            else
                result.set(path, [warning]);
        }
        return result;
    });
    byProvider.set(context, groups);
    return groups;
}
/** A missing path places root and unattached group findings above the form's submit controls. */
export function WarningExplanations({ path = '' }) {
    const context = useFormspecContext();
    const { engine, latestSubmit } = context;
    const submitted = useSignal(latestSubmit) !== null;
    useSignal(engine.localeSignal);
    const warnings = useSignal(useMemo(() => computed(() => visibleWarnings(context).value.get(path) ?? none), [context, path]));
    const groups = useSignal(useMemo(() => computed(() => {
        const submit = latestSubmit.value;
        if (path !== '' || !submitMayHaveWarnings(submit, engine))
            return [];
        engine.localeSignal.value;
        const state = engine.getExplanationState();
        return readWarningAcknowledgementGroups(state, {
            field: (targetPath) => {
                const vm = engine.getFieldVM?.(targetPath);
                const label = (vm && 'label' in vm && vm.label ? vm.label.value : undefined)
                    ?? engine.getItemLabelSignal?.(targetPath)?.value;
                if (!vm && label === undefined)
                    return null;
                const controlId = vm && 'id' in vm && typeof vm.id === 'string' && vm.id ? vm.id : null;
                return { label: label ?? targetPath, controlId };
            },
            rootLabel: () => engine.getDefinition?.()?.title || 'Form',
            resolveText: (key, fallback) => engine.resolveLocaleString(key, fallback),
            lookupUi: (key) => engine.lookupLocaleString?.(`$ui.${key}`) ?? null,
        });
    }), [context, engine, latestSubmit, path]));
    if (warnings.length === 0 && (!submitted || path !== '' || groups.length === 0))
        return null;
    return _jsxs(_Fragment, { children: [warnings.map(warning => _jsx(WarningAnswer, { engine: engine, warning: warning }, JSON.stringify([warning.shapeId, warning.path, warning.basis]))), submitted && path === '' && groups.map(group => _jsx(WarningAcknowledgement, { engine: engine, group: group, jumpToField: context.jumpToField }, group.code))] });
}
function WarningAcknowledgement({ engine, group, jumpToField, }) {
    const regionRef = useRef(null);
    const headingId = useId();
    const workspaceJump = useContext(WorkspaceFieldJump);
    const jump = (jumpPath) => (event) => {
        event.preventDefault();
        if (!jumpPath)
            return;
        const scope = regionRef.current?.closest('.formspec-theme-scope') ?? document.body;
        if (workspaceJump)
            workspaceJump(jumpPath);
        else if (!jumpToField?.(jumpPath))
            focusFieldIn(scope, jumpPath);
    };
    const title = dedupeSeverityPrefix(group.legend);
    return (_jsxs("div", { ref: regionRef, role: "region", "aria-labelledby": headingId, className: "formspec-warning-explanation formspec-warning-acknowledgement", "data-explanation-code": group.code, "data-state": group.current ? 'saved' : 'open', children: [_jsx("div", { id: headingId, className: "formspec-warning-explanation-header", children: title }), _jsxs("div", { className: "formspec-warning-explanation-body", children: [_jsx("ul", { className: "formspec-warning-acknowledgement-list", children: group.items.map(item => _jsx("li", { children: item.jumpHref
                                ? _jsx("a", { href: item.jumpHref, onClick: jump(item.jumpPath), children: item.label })
                                : _jsx("span", { children: item.label }) }, item.path)) }), group.addedText && _jsx("p", { className: "formspec-warning-acknowledgement-added", children: group.addedText }), group.removedText && _jsx("p", { className: "formspec-warning-acknowledgement-removed", children: group.removedText }), _jsx("div", { className: "formspec-warning-explanation-actions", children: _jsx("button", { type: "button", className: "formspec-warning-explanation-action formspec-button-secondary formspec-focus-ring", "data-state": group.current ? 'saved' : 'pending', disabled: group.current, onClick: () => {
                                if (group.basis !== undefined)
                                    engine.acknowledge(group.code, { expectedBasis: group.basis });
                                else
                                    engine.acknowledge(group.code);
                            }, children: group.buttonLabel }) })] })] }));
}
function WarningAnswer({ engine, warning }) {
    const { shapeId, path, mode, current, message } = warning;
    const [text, setText] = useState(warning.text ?? '');
    const headingId = useId();
    useEffect(() => {
        setText(warning.text ?? '');
    }, [warning.basis, warning.text]);
    useSignal(engine.localeSignal);
    const explain = mode === 'explain';
    const prompt = engine.resolveLocaleString(`$shape.${shapeId}.explanationPrompt`, explain ? 'Explain this warning.' : 'Confirm this warning. You may add a note.', path);
    const resolvedMessage = dedupeSeverityPrefix(engine.resolveLocaleString(`$shape.${shapeId}.message`, message, path));
    const trimmed = text.trim();
    const saved = current && text === (warning.text ?? '');
    return (_jsxs("div", { role: "region", "aria-labelledby": headingId, className: "formspec-warning-explanation", "data-shape-id": shapeId, "data-explanation-path": path, "data-state": saved ? 'saved' : 'open', children: [_jsx("div", { id: headingId, className: "formspec-warning-explanation-header", children: resolvedMessage }), _jsxs("div", { className: "formspec-warning-explanation-body", children: [_jsxs("label", { className: "formspec-warning-explanation-prompt", children: [prompt, _jsx("textarea", { value: text, "aria-required": explain, onChange: event => setText(event.target.value) })] }), _jsx("div", { className: "formspec-warning-explanation-actions", children: _jsx("button", { type: "button", className: "formspec-warning-explanation-action formspec-button-secondary formspec-focus-ring", "data-state": saved ? 'saved' : 'pending', disabled: saved || (explain && !trimmed), onClick: () => engine.setExplanation(shapeId, path, trimmed ? { text } : {}), children: saved ? (explain ? 'Explanation entered' : 'Confirmed') : (explain ? 'Use explanation' : 'Confirm') }) })] })] }));
}
