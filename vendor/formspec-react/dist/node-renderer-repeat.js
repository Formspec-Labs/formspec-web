'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Repeat-group and accordion-repeat layout rendering for FormspecNode. */
import React, { useMemo, useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import { chromeText } from './use-chrome-text';
import { computed, signal } from '@preact/signals-core';
import { useFormspecContext } from './context.js';
import { useSignal } from './use-signal';
import { useRepeatAffordances } from './use-repeat-affordances';
import { RepeatInstanceContext } from './use-localized-node';
import { useHeadingLevel } from './heading-level';
import { usePathShapeErrors } from './use-field-error';
import { WarningExplanations } from './warning-explanations';
const NO_LABEL = signal('');
const EDITABLE_FOCUS_SELECTOR = [
    'input:not([type="hidden"]):not([readonly]):not([disabled]):not([aria-readonly="true"]):not([tabindex="-1"])',
    'select:not([disabled]):not([aria-readonly="true"]):not([tabindex="-1"])',
    'textarea:not([readonly]):not([disabled]):not([aria-readonly="true"]):not([tabindex="-1"])',
    '[contenteditable="true"]:not([aria-readonly="true"]):not([tabindex="-1"])',
    'button:not([disabled]):not(.formspec-repeat-remove):not(.formspec-repeat-confirm-yes):not(.formspec-repeat-confirm-cancel):not([tabindex="-1"])',
].join(', ');
function findEditableFocusTarget(container) {
    if (!container)
        return null;
    return container.querySelector(EDITABLE_FOCUS_SELECTOR)
        ?? container.querySelector('button:not([disabled]):not(.formspec-repeat-remove), [tabindex]:not([tabindex="-1"])');
}
/** Detect multi-sentence / long prompt group titles so repeat headers and buttons stay concise. */
function summarizeRepeatTitle(rawTitle) {
    const trimmed = rawTitle.trim();
    const isLongPrompt = trimmed.length > 48 || /[:.?!]\s+\S{12,}/.test(trimmed);
    if (!isLongPrompt)
        return { isLongPrompt: false, shortLabel: trimmed };
    const colon = trimmed.indexOf(':');
    if (colon > 0 && colon <= 44) {
        return { isLongPrompt: true, shortLabel: trimmed.slice(0, colon).trim() };
    }
    // Keep the visible button wording a prefix of its full accessible name.
    const prefix = trimmed.slice(0, 48).replace(/\s+\S*$/, '').trim();
    return { isLongPrompt: true, shortLabel: prefix || trimmed };
}
function isNonEmptyValue(val) {
    if (val === null || val === undefined || val === '')
        return false;
    if (Array.isArray(val))
        return val.length > 0;
    if (typeof val === 'object' && 'amount' in val) {
        const amt = val.amount;
        return amt !== null && amt !== undefined && amt !== '';
    }
    return true;
}
const seededLockedCounts = new WeakMap();
function readLockedSeededCount(engine, repeatPath, currentCount) {
    let map = seededLockedCounts.get(engine);
    if (!map) {
        map = new Map();
        seededLockedCounts.set(engine, map);
    }
    if (!map.has(repeatPath)) {
        map.set(repeatPath, currentCount);
    }
    const saved = map.get(repeatPath);
    if (currentCount < saved) {
        map.set(repeatPath, currentCount);
        return currentCount;
    }
    return saved;
}
function updateLockedSeededCount(engine, repeatPath, nextLocked) {
    let map = seededLockedCounts.get(engine);
    if (!map) {
        map = new Map();
        seededLockedCounts.set(engine, map);
    }
    map.set(repeatPath, Math.max(0, nextLocked));
}
function captureRowEntries(engine, repeatPath, idx) {
    const prefix = `${repeatPath}[${idx}].`;
    const entries = [];
    for (const [key, sig] of Object.entries(engine.signals ?? {})) {
        if (!key.startsWith(prefix))
            continue;
        if (engine.readonlySignals?.[key]?.value === true)
            continue;
        const val = sig.value;
        if (isNonEmptyValue(val)) {
            entries.push([key.slice(prefix.length), val]);
        }
    }
    return entries;
}
function useRowIdentifier(engine, repeatPath, idx, enabled) {
    const prefix = `${repeatPath}[${idx}].`;
    const identifierSig = useMemo(() => computed(() => {
        if (!enabled)
            return null;
        // Track structural updates when present so newly added row signals are discovered reactively.
        engine.structureVersion?.value;
        const signals = engine.signals ?? {};
        const readonlySignals = engine.readonlySignals ?? {};
        // Scan every field signal in this row so Preact Signals tracks edits on any string identifier,
        // even when preceded by numeric, date, or choice fields.
        let editableMatch = null;
        let readonlyMatch = null;
        for (const [key, fieldSig] of Object.entries(signals)) {
            if (!key.startsWith(prefix))
                continue;
            const val = fieldSig.value;
            if (typeof val !== 'string')
                continue;
            const trimmed = val.trim();
            if (trimmed.length === 0 || trimmed.length > 44)
                continue;
            if (readonlySignals[key]?.value === true) {
                if (readonlyMatch === null)
                    readonlyMatch = trimmed;
            }
            else if (editableMatch === null) {
                editableMatch = trimmed;
            }
        }
        return editableMatch ?? readonlyMatch;
    }), [enabled, engine, prefix]);
    return useSignal(identifierSig);
}
function isRowAllReadonly(engine, repeatPath, idx) {
    const prefix = `${repeatPath}[${idx}].`;
    const keys = Object.keys(engine.signals ?? {}).filter((key) => key.startsWith(prefix));
    if (keys.length === 0)
        return false;
    return keys.every((key) => engine.readonlySignals?.[key]?.value === true);
}
/** A repeat node's `allowAdd` / `allowRemove` props (Accordion §6.3, or theme widgetConfig on a repeat template). */
function repeatLocks(node) {
    const { allowAdd, allowRemove } = node.props ?? {};
    return {
        allowAdd: typeof allowAdd === 'boolean' ? allowAdd : undefined,
        allowRemove: typeof allowRemove === 'boolean' ? allowRemove : undefined,
    };
}
function RepeatInstanceCard({ children, idx, repeatPath, isLongPrompt, baseDisplayLabel, ariaRowLabel, removeAriaLabel, removeButtonText, canRemoveRow, autoGridColumns, isConfirming, onRequestRemove, onConfirmRemove, onCancelRemove, renderChild, }) {
    const { engine } = useFormspecContext();
    const instancePath = `${repeatPath}[${idx}]`;
    const rowIdText = useRowIdentifier(engine, repeatPath, idx, isLongPrompt);
    const displayLabel = isLongPrompt
        ? (rowIdText ? `Item ${idx + 1} — ${rowIdText}` : `Item ${idx + 1}`)
        : baseDisplayLabel;
    const instanceErrors = usePathShapeErrors(instancePath);
    const hasErrors = instanceErrors.length > 0;
    const hasAutoGrid = typeof autoGridColumns === 'number' && autoGridColumns >= 2 && autoGridColumns <= 6;
    const classNames = [
        'formspec-repeat-instance',
        hasAutoGrid ? 'formspec-auto-grid' : '',
        hasErrors ? 'formspec-repeat-instance--invalid' : '',
    ].filter(Boolean).join(' ');
    return (_jsxs("div", { className: classNames, "data-repeat-path": instancePath, "data-auto-grid": hasAutoGrid ? String(autoGridColumns) : undefined, "data-invalid": hasErrors ? 'true' : undefined, role: "group", "aria-label": ariaRowLabel, children: [_jsxs("div", { className: "formspec-repeat-instance-header", children: [_jsx("p", { className: "formspec-repeat-instance-label", children: displayLabel }), canRemoveRow && (isConfirming ? (_jsxs("div", { className: "formspec-repeat-confirm", role: "group", "aria-label": `Confirm removing ${displayLabel}`, onKeyDown: (e) => {
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                onCancelRemove();
                            }
                        }, children: [_jsx("span", { className: "formspec-repeat-confirm-prompt", children: "Remove this item?" }), _jsx("button", { type: "button", className: "formspec-repeat-confirm-yes formspec-focus-ring", onClick: () => onConfirmRemove(displayLabel), children: removeButtonText }), _jsx("button", { type: "button", className: "formspec-repeat-confirm-cancel formspec-focus-ring", onClick: onCancelRemove, children: "Cancel" })] })) : (_jsx("button", { type: "button", className: "formspec-repeat-remove formspec-focus-ring", "aria-label": removeAriaLabel, onClick: () => onRequestRemove(displayLabel), children: removeButtonText })))] }), hasErrors && (_jsx("div", { className: "formspec-group-errors", role: "alert", children: instanceErrors.map((err, i) => _jsx("p", { children: err.message }, i)) })), _jsx(RepeatInstanceContext.Provider, { value: instancePath, children: children.map((child) => (_jsx(React.Fragment, { children: renderChild(child) }, child.id))) }), _jsx(WarningExplanations, { path: instancePath })] }));
}
/** Renders a repeat group: stamps template children per instance. */
export function RepeatGroup({ node, renderChild }) {
    const { engine } = useFormspecContext();
    useSignal(engine.localeSignal); // re-render add/remove/row text on a locale switch
    const repeatPath = node.repeatPath;
    const locks = repeatLocks(node);
    // Theme widgetConfig Add/Remove locks, planned onto the template's props (theme §4.2).
    const { count, relevant, canAdd, canRemove, isSeeded, upstreamSeededCount } = useRepeatAffordances(repeatPath, locks);
    const title = node.props?.title || node.repeatGroup || repeatPath;
    const { isLongPrompt, shortLabel } = summarizeRepeatTitle(title);
    const Heading = `h${useHeadingLevel()}`;
    const autoGridColumns = typeof node.props?.autoGridColumns === 'number' ? node.props.autoGridColumns : undefined;
    const groupErrors = usePathShapeErrors(repeatPath);
    const containerRef = useRef(null);
    const addBtnRef = useRef(null);
    const [announcement, setAnnouncement] = useState('');
    const [confirmingIdx, setConfirmingIdx] = useState(null);
    const [lastRemoved, setLastRemoved] = useState(null);
    // Protect carried upstream seeded rows from accidental unrecoverable deletion unless allowRemove is explicitly true.
    // Prefer the exact upstream instance array length (so reloaded drafts with user-added rows stay removable),
    // falling back to a per-(engine, repeatPath) WeakMap snapshot when upstream length cannot be determined statically.
    const lockSeeded = isSeeded && locks.allowRemove !== true;
    const lockedCount = !lockSeeded
        ? 0
        : upstreamSeededCount !== null
            ? Math.min(upstreamSeededCount, count)
            : readLockedSeededCount(engine, repeatPath, count);
    const prevCountRef = useRef(count);
    const userAddingRef = useRef(false);
    useEffect(() => {
        if (lockSeeded && upstreamSeededCount === null) {
            if (count > prevCountRef.current && !userAddingRef.current) {
                updateLockedSeededCount(engine, repeatPath, readLockedSeededCount(engine, repeatPath, prevCountRef.current) + (count - prevCountRef.current));
            }
            else if (count < lockedCount) {
                updateLockedSeededCount(engine, repeatPath, count);
            }
        }
        userAddingRef.current = false;
        prevCountRef.current = count;
    }, [count, engine, lockSeeded, lockedCount, repeatPath, upstreamSeededCount]);
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
        userAddingRef.current = true;
        setConfirmingIdx(null);
        setLastRemoved(null);
        engine.addRepeatInstance(repeatPath);
        const newCount = count + 1;
        setAnnouncement(`${shortLabel} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
            const last = instanceEls?.[instanceEls.length - 1];
            findEditableFocusTarget(last ?? null)?.focus();
        }, 0);
    }, [canAdd, count, engine, repeatPath, shortLabel]);
    const commitRemove = useCallback((idx, displayLabel) => {
        const entries = captureRowEntries(engine, repeatPath, idx);
        setConfirmingIdx(null);
        if (entries.length > 0) {
            setLastRemoved({ index: idx, label: displayLabel, entries });
        }
        else {
            setLastRemoved(null);
        }
        engine.removeRepeatInstance(repeatPath, idx);
        const newCount = count - 1;
        setAnnouncement(`${shortLabel} ${idx + 1} removed. ${newCount} remaining.`);
        setTimeout(() => {
            if (newCount === 0) {
                addBtnRef.current?.focus();
            }
            else {
                const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
                const target = instanceEls?.[Math.min(idx, newCount - 1)];
                findEditableFocusTarget(target ?? null)?.focus();
            }
        }, 0);
    }, [count, engine, repeatPath, shortLabel]);
    const handleRequestRemove = useCallback((idx, displayLabel) => {
        const entries = captureRowEntries(engine, repeatPath, idx);
        if (entries.length === 0) {
            commitRemove(idx, displayLabel);
            return;
        }
        setConfirmingIdx(idx);
    }, [commitRemove, engine, repeatPath]);
    const handleUndoRemove = useCallback(() => {
        if (!lastRemoved)
            return;
        userAddingRef.current = true;
        const targetIndex = count;
        engine.addRepeatInstance(repeatPath);
        for (const [relKey, val] of lastRemoved.entries) {
            const nestedMatches = [...relKey.matchAll(/([^.[\]]+)\[(\d+)\]/g)];
            let nestedPrefix = `${repeatPath}[${targetIndex}]`;
            for (const match of nestedMatches) {
                const subPath = `${nestedPrefix}.${match[1]}`;
                const needed = Number(match[2]) + 1;
                while ((engine.repeats[subPath]?.value ?? 0) < needed) {
                    engine.addRepeatInstance(subPath);
                }
                nestedPrefix = `${subPath}[${match[2]}]`;
            }
            const fullPath = `${repeatPath}[${targetIndex}].${relKey}`;
            if (engine.signals[fullPath]) {
                engine.setValue(fullPath, val);
            }
        }
        setAnnouncement(`${lastRemoved.label} restored.`);
        setLastRemoved(null);
        setTimeout(() => {
            const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
            const target = instanceEls?.[targetIndex];
            findEditableFocusTarget(target ?? null)?.focus();
        }, 0);
    }, [count, engine, lastRemoved, repeatPath]);
    if (!relevant)
        return null;
    const removeButtonText = chromeText(engine, 'dataTable.remove');
    const hasGroupErrors = groupErrors.length > 0;
    return (_jsxs("div", { className: `formspec-repeat${hasGroupErrors ? ' formspec-repeat--invalid' : ''}`, "data-bind": node.repeatGroup, "data-repeat-path": repeatPath, "data-invalid": hasGroupErrors ? 'true' : undefined, ref: containerRef, children: [_jsx(Heading, { className: "formspec-repeat-heading", children: title }), hasGroupErrors && (_jsx("div", { className: "formspec-group-errors", role: "alert", children: groupErrors.map((err, i) => _jsx("p", { children: err.message }, i)) })), _jsx("div", { className: "formspec-repeat-list", children: instances.map((children, idx) => {
                    const baseDisplayLabel = chromeText(engine, 'repeat.row', { label: title, index: idx + 1 });
                    const ariaRowLabel = chromeText(engine, 'repeat.rowOf', {
                        label: title,
                        index: idx + 1,
                        total: count,
                    });
                    const removeAriaLabel = chromeText(engine, 'repeat.remove', {
                        label: `${title} ${idx + 1}`,
                    });
                    const isLockedRow = (lockSeeded && idx < lockedCount)
                        || (locks.allowRemove !== true && isRowAllReadonly(engine, repeatPath, idx));
                    return (_jsx(RepeatInstanceCard, { children: children, idx: idx, repeatPath: repeatPath, isLongPrompt: isLongPrompt, baseDisplayLabel: baseDisplayLabel, ariaRowLabel: ariaRowLabel, removeAriaLabel: removeAriaLabel, removeButtonText: removeButtonText, canRemoveRow: canRemove && !isLockedRow, autoGridColumns: autoGridColumns, isConfirming: confirmingIdx === idx, onRequestRemove: (label) => handleRequestRemove(idx, label), onConfirmRemove: (label) => commitRemove(idx, label), onCancelRemove: () => setConfirmingIdx(null), renderChild: renderChild }, idx));
                }) }), lastRemoved && (_jsxs("div", { className: "formspec-repeat-undo", role: "status", children: [_jsxs("span", { children: ["Removed ", lastRemoved.label, "."] }), _jsx("button", { type: "button", className: "formspec-repeat-undo-button formspec-focus-ring", onClick: handleUndoRemove, children: "Undo remove" })] })), canAdd && (_jsx("button", { type: "button", className: "formspec-repeat-add formspec-focus-ring", "aria-label": chromeText(engine, 'repeat.add', { label: title }), onClick: handleAdd, ref: addBtnRef, children: chromeText(engine, 'repeat.add', { label: shortLabel }) })), _jsx(WarningExplanations, { path: repeatPath }), _jsx("div", { "aria-live": "polite", className: "formspec-sr-only", children: announcement })] }));
}
export function RepeatAccordion({ node, renderChild }) {
    const { engine } = useFormspecContext();
    useSignal(engine.localeSignal); // re-render add/remove text on a locale switch
    const bindKey = node.bindPath ?? node.props.bind;
    const locks = repeatLocks(node);
    const { count, relevant, canAdd, canRemove, isSeeded, upstreamSeededCount } = useRepeatAffordances(bindKey, locks);
    const labels = node.props?.labels ?? [];
    const allowMultiple = node.props?.allowMultiple === true;
    const defaultOpen = node.props?.defaultOpen;
    // The repeated group's live label (Locale, label context, `{{}}`), as webcomponent AccordionLayoutBehavior.groupLabel.
    const groupLabel = useMemo(() => engine.getItemLabelSignal(bindKey) ?? NO_LABEL, [engine, bindKey]);
    const groupTitle = useSignal(groupLabel) || bindKey;
    const { isLongPrompt, shortLabel } = summarizeRepeatTitle(groupTitle);
    const Heading = `h${useHeadingLevel()}`;
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
    const addedRowToFocus = useRef(null);
    const containerRef = useRef(null);
    const addBtnRef = useRef(null);
    const [announcement, setAnnouncement] = useState('');
    const lockSeeded = isSeeded && locks.allowRemove !== true;
    const lockedCount = !lockSeeded
        ? 0
        : upstreamSeededCount !== null
            ? Math.min(upstreamSeededCount, count)
            : readLockedSeededCount(engine, bindKey, count);
    const userAddingRef = useRef(false);
    React.useEffect(() => {
        const previousCount = previousCountRef.current;
        if (count > previousCount && count > 0) {
            if (lockSeeded && upstreamSeededCount === null && !userAddingRef.current) {
                updateLockedSeededCount(engine, bindKey, readLockedSeededCount(engine, bindKey, previousCount) + (count - previousCount));
            }
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
        else if (lockSeeded && upstreamSeededCount === null && count < lockedCount) {
            updateLockedSeededCount(engine, bindKey, count);
        }
        userAddingRef.current = false;
        previousCountRef.current = count;
    }, [allowMultiple, bindKey, count, engine, lockSeeded, lockedCount, upstreamSeededCount]);
    useLayoutEffect(() => {
        const index = addedRowToFocus.current;
        if (index === null || index >= count || !relevant)
            return;
        const isOpen = allowMultiple ? openIndices.has(index) : openIndex === index;
        if (!isOpen)
            return;
        // Closed details cannot focus their children. Wait until the added row has committed open.
        const row = containerRef.current?.querySelectorAll(':scope > .formspec-accordion--repeat > .formspec-accordion-item')[index];
        if (!row)
            return;
        addedRowToFocus.current = null;
        findEditableFocusTarget(row.querySelector(':scope > .formspec-accordion-content'))?.focus();
        if (!row.contains(row.ownerDocument.activeElement)) {
            row.querySelector(':scope > summary')?.focus();
        }
    }, [allowMultiple, count, openIndex, openIndices, relevant]);
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
        userAddingRef.current = true;
        const index = engine.addRepeatInstance(bindKey);
        if (index === undefined) {
            userAddingRef.current = false;
            return;
        }
        addedRowToFocus.current = index;
        const newCount = index + 1;
        setAnnouncement(`${shortLabel} ${newCount} added. ${newCount} total.`);
    }, [bindKey, canAdd, engine, shortLabel]);
    const handleRemove = useCallback((idx) => {
        engine.removeRepeatInstance(bindKey, idx);
        const newCount = count - 1;
        setAnnouncement(`${shortLabel} ${idx + 1} removed. ${newCount} remaining.`);
        setTimeout(() => {
            if (newCount <= 0) {
                addBtnRef.current?.focus();
                return;
            }
            const items = containerRef.current?.querySelectorAll('.formspec-accordion-item');
            const target = items?.[Math.min(idx, newCount - 1)];
            findEditableFocusTarget(target?.querySelector('.formspec-accordion-content') ?? target ?? null)?.focus();
        }, 0);
    }, [bindKey, count, engine, shortLabel]);
    if (!relevant)
        return null;
    return (_jsxs("div", { className: "formspec-repeat formspec-repeat--accordion", "data-bind": bindKey, "data-repeat-path": bindKey, ref: containerRef, children: [_jsx(Heading, { className: "formspec-repeat-heading", children: groupTitle }), _jsx("div", { className: "formspec-accordion formspec-accordion--repeat", children: Array.from({ length: count }, (_, i) => {
                    const isOpen = allowMultiple ? openIndices.has(i) : openIndex === i;
                    const isLockedRow = (lockSeeded && i < lockedCount)
                        || (locks.allowRemove !== true && isRowAllReadonly(engine, bindKey, i));
                    return (_jsxs("details", { className: "formspec-accordion-item", open: isOpen, "data-repeat-path": `${bindKey}[${i}]`, children: [_jsx("summary", { className: "formspec-focus-ring", onClick: (event) => {
                                    event.preventDefault();
                                    handleToggle(i, !isOpen);
                                }, children: labels[i] || `Section ${i + 1}` }), _jsxs("div", { className: "formspec-accordion-content formspec-accordion-content--repeat", children: [_jsx(RepeatInstanceContext.Provider, { value: `${bindKey}[${i}]`, children: rows[i].map((child) => (_jsx(React.Fragment, { children: renderChild(child) }, child.id))) }), canRemove && !isLockedRow && (_jsx("button", { type: "button", className: "formspec-repeat-remove formspec-focus-ring", "aria-label": chromeText(engine, 'repeat.remove', { label: `${groupTitle} ${i + 1}` }), onClick: () => handleRemove(i), children: isLongPrompt
                                            ? chromeText(engine, 'dataTable.remove')
                                            : chromeText(engine, 'repeat.remove', { label: shortLabel }) }))] })] }, i));
                }) }), canAdd && (_jsx("button", { type: "button", className: "formspec-repeat-add formspec-focus-ring", "aria-label": chromeText(engine, 'repeat.add', { label: groupTitle }), onClick: handleAdd, ref: addBtnRef, children: chromeText(engine, 'repeat.add', { label: shortLabel }) })), _jsx("div", { "aria-live": "polite", className: "formspec-sr-only", children: announcement })] }));
}
/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` onto instance `[instanceIdx]`.
 * Repeat templates plan children under `repeatPath[0]`; a bound Accordion plans them under `repeatPath.`.
 */
export function rewriteBindPaths(node, repeatPath, instanceIdx) {
    const templatePrefix = `${repeatPath}[0]`;
    const groupScopePrefix = `${repeatPath}.`;
    const instancePrefix = `${repeatPath}[${instanceIdx}]`;
    function instantiate(path) {
        if (path === templatePrefix || path?.startsWith(`${templatePrefix}.`)) {
            return instancePrefix + path.slice(templatePrefix.length);
        }
        if (path?.startsWith(groupScopePrefix)) {
            return `${instancePrefix}.${path.slice(groupScopePrefix.length)}`;
        }
        return path;
    }
    const bind = typeof node.props.bind === 'string' ? node.props.bind : undefined;
    const resolvedBind = instantiate(bind);
    const rewritten = {
        ...node,
        id: `${node.id}-${instanceIdx}`,
        bindPath: instantiate(node.bindPath),
        repeatPath: instantiate(node.repeatPath),
        whenPrefix: instantiate(node.whenPrefix),
        props: resolvedBind === bind ? node.props : { ...node.props, bind: resolvedBind },
        children: node.children.map(child => rewriteBindPaths(child, repeatPath, instanceIdx)),
    };
    return rewritten;
}
