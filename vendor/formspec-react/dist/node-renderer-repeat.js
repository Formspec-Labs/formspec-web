'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Repeat-group and accordion-repeat layout rendering for FormspecNode. */
import React, { useMemo, useRef, useCallback, useState } from 'react';
import { useFormspecContext, findItemByKey } from './context.js';
import { useRepeatCount } from './use-repeat-count';
function findItemLabel(items, key) {
    const item = findItemByKey(items, key);
    return item?.label;
}
/** Renders a repeat group: stamps template children per instance. */
export function RepeatGroup({ node, renderChild }) {
    const { engine } = useFormspecContext();
    const repeatPath = node.repeatPath;
    const count = useRepeatCount(repeatPath);
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
        engine.addRepeatInstance(repeatPath);
        const newCount = count + 1;
        setAnnouncement(`${title} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
            const last = instanceEls?.[instanceEls.length - 1];
            findRepeatInstanceFocusTarget(last ?? null)?.focus();
        }, 0);
    }, [count, engine, findRepeatInstanceFocusTarget, repeatPath, title]);
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
    return (_jsxs("div", { className: "formspec-repeat", "data-bind": node.repeatGroup, ref: containerRef, children: [_jsx("div", { className: "formspec-repeat-list", children: instances.map((children, idx) => (_jsxs("div", { className: "formspec-repeat-instance", role: "group", "aria-label": `${title} ${idx + 1} of ${count}`, children: [_jsxs("div", { className: "formspec-repeat-instance-header", children: [_jsx("p", { className: "formspec-repeat-instance-label", children: `${title} ${idx + 1}` }), _jsx("button", { type: "button", className: "formspec-repeat-remove formspec-button-danger formspec-focus-ring", "aria-label": `Remove ${title} ${idx + 1}`, onClick: () => handleRemove(idx), children: `Remove ${title}` })] }), children.map((child) => (_jsx(React.Fragment, { children: renderChild(child) }, child.id)))] }, idx))) }), _jsx("button", { type: "button", className: "formspec-repeat-add formspec-focus-ring", onClick: handleAdd, ref: addBtnRef, children: `Add ${title}` }), _jsx("div", { "aria-live": "polite", className: "formspec-sr-only", children: announcement })] }));
}
export function RepeatAccordion({ node, renderChild }) {
    const { engine } = useFormspecContext();
    const bindKey = node.props?.bind;
    const count = useRepeatCount(bindKey);
    const labels = node.props?.labels ?? [];
    const allowMultiple = node.props?.allowMultiple === true;
    const defaultOpen = node.props?.defaultOpen;
    const groupTitle = node.fieldItem?.label || findItemLabel(engine.getDefinition().items ?? [], bindKey) || bindKey;
    const [openIndex, setOpenIndex] = useState(typeof defaultOpen === 'number' ? defaultOpen : count > 0 ? count - 1 : null);
    const [openIndices, setOpenIndices] = useState(() => {
        const initial = new Set();
        if (typeof defaultOpen === 'number')
            initial.add(defaultOpen);
        else if (count > 0)
            initial.add(count - 1);
        return initial;
    });
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
        engine.addRepeatInstance(bindKey);
        const newCount = count + 1;
        setAnnouncement(`${groupTitle} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const items = containerRef.current?.querySelectorAll('.formspec-accordion-item');
            const last = items?.[items.length - 1];
            last?.querySelector('input, select, textarea, button')?.focus();
        }, 0);
    }, [bindKey, count, engine, groupTitle]);
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
    return (_jsxs("div", { className: "formspec-repeat formspec-repeat--accordion", "data-bind": bindKey, ref: containerRef, children: [_jsx("div", { className: "formspec-accordion formspec-accordion--repeat", children: Array.from({ length: count }, (_, i) => {
                    const isOpen = allowMultiple ? openIndices.has(i) : openIndex === i;
                    return (_jsxs("details", { className: "formspec-accordion-item", open: isOpen, children: [_jsx("summary", { className: "formspec-focus-ring", onClick: (event) => {
                                    event.preventDefault();
                                    handleToggle(i, !isOpen);
                                }, children: labels[i] || `Section ${i + 1}` }), _jsxs("div", { className: "formspec-accordion-content formspec-accordion-content--repeat", children: [node.children.map((child) => (_jsx(React.Fragment, { children: renderChild(rewriteBindPaths(child, bindKey, i)) }, `${child.id}-${i}`))), _jsx("button", { type: "button", className: "formspec-repeat-remove formspec-focus-ring", "aria-label": `Remove ${groupTitle} ${i + 1}`, onClick: () => handleRemove(i), children: `Remove ${groupTitle}` })] })] }, i));
                }) }), _jsx("button", { type: "button", className: "formspec-repeat-add formspec-focus-ring", onClick: handleAdd, ref: addBtnRef, children: `Add ${groupTitle}` }), _jsx("div", { "aria-live": "polite", className: "formspec-sr-only", children: announcement })] }));
}
/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` from template `[0]` to `[instanceIdx]`.
 */
export function rewriteBindPaths(node, repeatPath, instanceIdx) {
    const templatePrefix = `${repeatPath}[0]`;
    const instancePrefix = `${repeatPath}[${instanceIdx}]`;
    const rewritten = { ...node };
    if (rewritten.bindPath?.startsWith(templatePrefix)) {
        rewritten.bindPath = instancePrefix + rewritten.bindPath.slice(templatePrefix.length);
    }
    rewritten.id = `${node.id}-${instanceIdx}`;
    if (node.children.length > 0) {
        rewritten.children = node.children.map((child) => rewriteBindPaths(child, repeatPath, instanceIdx));
    }
    return rewritten;
}
