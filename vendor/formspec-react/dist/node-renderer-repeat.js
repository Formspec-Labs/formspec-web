'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Repeat-group and accordion-repeat layout rendering for FormspecNode. */
import React, { useMemo, useRef, useCallback, useState } from 'react';
import { chromeText } from './use-chrome-text';
import { signal } from '@preact/signals-core';
import { useFormspecContext } from './context.js';
import { useSignal } from './use-signal';
import { useRepeatAffordances } from './use-repeat-affordances';
import { RepeatInstanceContext } from './use-localized-node';
const NO_LABEL = signal('');
/** A repeat node's `allowAdd` / `allowRemove` props (Accordion §6.3, or theme widgetConfig on a repeat template). */
function repeatLocks(node) {
    const { allowAdd, allowRemove } = node.props ?? {};
    return {
        allowAdd: typeof allowAdd === 'boolean' ? allowAdd : undefined,
        allowRemove: typeof allowRemove === 'boolean' ? allowRemove : undefined,
    };
}
/** Renders a repeat group: stamps template children per instance. */
export function RepeatGroup({ node, renderChild }) {
    const { engine } = useFormspecContext();
    useSignal(engine.localeSignal); // re-render add/remove/row text on a locale switch
    const repeatPath = node.repeatPath;
    // Theme widgetConfig Add/Remove locks, planned onto the template's props (theme §4.2).
    const { count, relevant, canAdd, canRemove } = useRepeatAffordances(repeatPath, repeatLocks(node));
    const title = node.props?.title || node.repeatGroup || repeatPath;
    const containerRef = useRef(null);
    const addBtnRef = useRef(null);
    const [announcement, setAnnouncement] = useState('');
    const findRepeatInstanceFocusTarget = useCallback((instance) => {
        if (!instance)
            return null;
        return instance.querySelector('input:not([type="hidden"]), select, textarea, [contenteditable="true"], button:not(.formspec-repeat-remove)') ?? instance.querySelector('button, [tabindex]:not([tabindex="-1"])');
    }, []);
    const instances = useMemo(() => {
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(node.children.map((child) => rewriteBindPaths(child, repeatPath, i)));
        }
        return result;
    }, [node.children, repeatPath, count]);
    const handleAdd = useCallback(() => {
        if (!canAdd)
            return;
        engine.addRepeatInstance(repeatPath);
        const newCount = count + 1;
        setAnnouncement(`${title} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
            const last = instanceEls?.[instanceEls.length - 1];
            findRepeatInstanceFocusTarget(last ?? null)?.focus();
        }, 0);
    }, [canAdd, count, engine, findRepeatInstanceFocusTarget, repeatPath, title]);
    const handleRemove = useCallback((idx) => {
        engine.removeRepeatInstance(repeatPath, idx);
        const newCount = count - 1;
        setAnnouncement(`${title} ${idx + 1} removed. ${newCount} remaining.`);
        setTimeout(() => {
            if (newCount === 0) {
                addBtnRef.current?.focus();
            }
            else {
                const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
                const target = instanceEls?.[Math.min(idx, newCount - 1)];
                findRepeatInstanceFocusTarget(target ?? null)?.focus();
            }
        }, 0);
    }, [count, engine, findRepeatInstanceFocusTarget, repeatPath, title]);
    if (!relevant)
        return null;
    return (_jsxs("div", { className: "formspec-repeat", "data-bind": node.repeatGroup, ref: containerRef, children: [_jsx("div", { className: "formspec-repeat-list", children: instances.map((children, idx) => (_jsxs("div", { className: "formspec-repeat-instance", role: "group", "aria-label": chromeText(engine, 'repeat.rowOf', { label: title, index: idx + 1, total: count }), children: [_jsxs("div", { className: "formspec-repeat-instance-header", children: [_jsx("p", { className: "formspec-repeat-instance-label", children: chromeText(engine, 'repeat.row', { label: title, index: idx + 1 }) }), canRemove && (_jsx("button", { type: "button", className: "formspec-repeat-remove formspec-button-danger formspec-focus-ring", "aria-label": chromeText(engine, 'repeat.remove', { label: `${title} ${idx + 1}` }), onClick: () => handleRemove(idx), children: chromeText(engine, 'repeat.remove', { label: title }) }))] }), _jsx(RepeatInstanceContext.Provider, { value: `${repeatPath}[${idx}]`, children: children.map((child) => (_jsx(React.Fragment, { children: renderChild(child) }, child.id))) })] }, idx))) }), canAdd && (_jsx("button", { type: "button", className: "formspec-repeat-add formspec-focus-ring", onClick: handleAdd, ref: addBtnRef, children: chromeText(engine, 'repeat.add', { label: title }) })), _jsx("div", { "aria-live": "polite", className: "formspec-sr-only", children: announcement })] }));
}
export function RepeatAccordion({ node, renderChild }) {
    const { engine } = useFormspecContext();
    useSignal(engine.localeSignal); // re-render add/remove text on a locale switch
    const bindKey = node.props?.bind;
    const { count, relevant, canAdd, canRemove } = useRepeatAffordances(bindKey, repeatLocks(node));
    const labels = node.props?.labels ?? [];
    const allowMultiple = node.props?.allowMultiple === true;
    const defaultOpen = node.props?.defaultOpen;
    // The repeated group's live label (Locale, label context, `{{}}`), as webcomponent AccordionLayoutBehavior.groupLabel.
    const groupLabel = useMemo(() => engine.getItemLabelSignal(bindKey) ?? NO_LABEL, [engine, bindKey]);
    const groupTitle = useSignal(groupLabel) || bindKey;
    const [openIndex, setOpenIndex] = useState(typeof defaultOpen === 'number' ? defaultOpen : count > 0 ? count - 1 : null);
    const [openIndices, setOpenIndices] = useState(() => {
        const initial = new Set();
        if (typeof defaultOpen === 'number')
            initial.add(defaultOpen);
        else if (count > 0)
            initial.add(count - 1);
        return initial;
    });
    // Rebuild row nodes only when rows change: fresh node objects on every toggle would re-derive each row's localized props.
    const rows = useMemo(() => Array.from({ length: count }, (_, i) => node.children.map((child) => rewriteBindPaths(child, bindKey, i))), [node.children, bindKey, count]);
    const previousCountRef = useRef(count);
    const containerRef = useRef(null);
    const addBtnRef = useRef(null);
    const [announcement, setAnnouncement] = useState('');
    React.useEffect(() => {
        const previousCount = previousCountRef.current;
        if (count > previousCount && count > 0) {
            const lastIndex = count - 1;
            if (allowMultiple) {
                setOpenIndices(prev => {
                    const next = new Set(prev);
                    next.add(lastIndex);
                    return next;
                });
            }
            else {
                setOpenIndex(lastIndex);
            }
        }
        previousCountRef.current = count;
    }, [allowMultiple, count]);
    const handleToggle = useCallback((idx, open) => {
        if (allowMultiple) {
            setOpenIndices(prev => {
                const next = new Set(prev);
                if (open)
                    next.add(idx);
                else
                    next.delete(idx);
                return next;
            });
            return;
        }
        setOpenIndex(open ? idx : null);
    }, [allowMultiple]);
    const handleAdd = useCallback(() => {
        if (!canAdd)
            return;
        engine.addRepeatInstance(bindKey);
        const newCount = count + 1;
        setAnnouncement(`${groupTitle} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const items = containerRef.current?.querySelectorAll('.formspec-accordion-item');
            const last = items?.[items.length - 1];
            last?.querySelector('input, select, textarea, button')?.focus();
        }, 0);
    }, [bindKey, canAdd, count, engine, groupTitle]);
    const handleRemove = useCallback((idx) => {
        engine.removeRepeatInstance(bindKey, idx);
        const newCount = count - 1;
        setAnnouncement(`${groupTitle} ${idx + 1} removed. ${newCount} remaining.`);
        setTimeout(() => {
            if (newCount <= 0) {
                addBtnRef.current?.focus();
                return;
            }
            const items = containerRef.current?.querySelectorAll('.formspec-accordion-item');
            const target = items?.[Math.min(idx, newCount - 1)];
            target?.querySelector('input, select, textarea, button')?.focus();
        }, 0);
    }, [bindKey, count, engine, groupTitle]);
    if (!relevant)
        return null;
    return (_jsxs("div", { className: "formspec-repeat formspec-repeat--accordion", "data-bind": bindKey, ref: containerRef, children: [_jsx("div", { className: "formspec-accordion formspec-accordion--repeat", children: Array.from({ length: count }, (_, i) => {
                    const isOpen = allowMultiple ? openIndices.has(i) : openIndex === i;
                    return (_jsxs("details", { className: "formspec-accordion-item", open: isOpen, children: [_jsx("summary", { className: "formspec-focus-ring", onClick: (event) => {
                                    event.preventDefault();
                                    handleToggle(i, !isOpen);
                                }, children: labels[i] || `Section ${i + 1}` }), _jsxs("div", { className: "formspec-accordion-content formspec-accordion-content--repeat", children: [_jsx(RepeatInstanceContext.Provider, { value: `${bindKey}[${i}]`, children: rows[i].map((child) => (_jsx(React.Fragment, { children: renderChild(child) }, child.id))) }), canRemove && (_jsx("button", { type: "button", className: "formspec-repeat-remove formspec-focus-ring", "aria-label": chromeText(engine, 'repeat.remove', { label: `${groupTitle} ${i + 1}` }), onClick: () => handleRemove(i), children: chromeText(engine, 'repeat.remove', { label: groupTitle }) }))] })] }, i));
                }) }), canAdd && (_jsx("button", { type: "button", className: "formspec-repeat-add formspec-focus-ring", onClick: handleAdd, ref: addBtnRef, children: chromeText(engine, 'repeat.add', { label: groupTitle }) })), _jsx("div", { "aria-live": "polite", className: "formspec-sr-only", children: announcement })] }));
}
/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` onto instance `[instanceIdx]`.
 * Repeat templates plan children under `repeatPath[0]`; a bound Accordion plans them under `repeatPath.`.
 */
export function rewriteBindPaths(node, repeatPath, instanceIdx) {
    const templatePrefix = `${repeatPath}[0]`;
    const groupScopePrefix = `${repeatPath}.`;
    const instancePrefix = `${repeatPath}[${instanceIdx}]`;
    const rewritten = { ...node };
    if (rewritten.bindPath?.startsWith(templatePrefix)) {
        rewritten.bindPath = instancePrefix + rewritten.bindPath.slice(templatePrefix.length);
    }
    else if (rewritten.bindPath?.startsWith(groupScopePrefix)) {
        rewritten.bindPath = `${instancePrefix}.${rewritten.bindPath.slice(groupScopePrefix.length)}`;
    }
    rewritten.id = `${node.id}-${instanceIdx}`;
    if (node.children.length > 0) {
        rewritten.children = node.children.map((child) => rewriteBindPaths(child, repeatPath, instanceIdx));
    }
    return rewritten;
}
