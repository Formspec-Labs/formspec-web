'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** @filedesc Default layout component — semantic HTML containers with CSS class structure. */
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { positionPopupNearTrigger, clearPopupFixedPosition, MODAL_FIRST_FOCUSABLE_SELECTOR, } from '@formspec-org/layout';
import { useWhen } from '../../use-when';
import { componentGraphIdentityAttrs } from '../../projection-metadata.js';
/**
 * Default layout renderer — dispatches to the correct container component
 * based on node.component, applying formspec CSS classes and theme styles.
 */
export function DefaultLayout({ node, children }) {
    const themeClass = node.cssClasses?.join(' ') || '';
    const style = node.style;
    switch (node.component) {
        case 'Stack':
            return _jsx(StackLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Grid':
            return _jsx(GridLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Card':
            return _jsx(CardLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Divider':
            return _jsx(DividerLayout, { node: node, themeClass: themeClass, style: style });
        case 'Section':
            return _jsx(SectionLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Collapsible':
            return _jsx(CollapsibleLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Accordion':
            return _jsx(AccordionLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Panel':
            return _jsx(PanelLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Modal':
            return _jsx(ModalLayout, { node: node, children: children, themeClass: themeClass, style: style });
        case 'Popover':
            return _jsx(PopoverLayout, { node: node, children: children, themeClass: themeClass, style: style });
        default:
            return _jsx(DefaultContainer, { node: node, children: children, themeClass: themeClass, style: style });
    }
}
function mergeClasses(baseClass, extraClasses) {
    if (!extraClasses)
        return baseClass;
    const parts = `${baseClass} ${extraClasses}`.trim().split(/\s+/);
    return Array.from(new Set(parts)).join(' ');
}
function surfaceStyle(props, style) {
    const next = { ...(style ?? {}) };
    if (props.padding != null)
        next.padding = String(props.padding);
    if (props.background != null)
        next.background = String(props.background);
    if (props.border != null)
        next.border = String(props.border);
    if (props.radius != null)
        next.borderRadius = String(props.radius);
    return Object.keys(next).length > 0 ? next : undefined;
}
function elevationAttrs(props) {
    return props.elevation != null ? { 'data-elevation': String(props.elevation) } : {};
}
function accessibilityAttrs(node) {
    const accessibility = node.accessibility;
    return {
        ...(accessibility?.role ? { role: accessibility.role } : {}),
        ...(accessibility?.description ? { 'aria-description': accessibility.description } : {}),
        ...(accessibility?.liveRegion ? { 'aria-live': accessibility.liveRegion } : {}),
    };
}
function stackJustifyContent(value) {
    switch (value) {
        case 'between':
            return 'space-between';
        case 'around':
            return 'space-around';
        case 'evenly':
            return 'space-evenly';
        case 'start':
        case 'center':
        case 'end':
            return value;
        default:
            return undefined;
    }
}
// ── Stack ─────────────────────────────────────────────────────────
function StackLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const direction = props.direction;
    const alignment = props.align;
    const justify = props.justify;
    const wrap = props.wrap;
    const gap = props.gap ?? style?.gap;
    const justifyContent = stackJustifyContent(justify);
    const stackStyle = {
        display: 'flex',
        flexDirection: direction === 'horizontal' ? 'row' : 'column',
        ...(alignment ? { alignItems: alignment } : {}),
        ...(justifyContent ? { justifyContent } : {}),
        ...(wrap ? { flexWrap: 'wrap' } : {}),
        ...surfaceStyle(props, style),
        // Props gap wins over theme style gap
        ...(gap ? { gap } : {}),
    };
    // When title + bindPath: treat as a titled group section (not a card —
    // the planner emits Stack for definition groups, Card for explicit cards)
    const title = props.title;
    if (title && node.bindPath) {
        return (_jsxs("section", { className: mergeClasses('formspec-group', themeClass), style: surfaceStyle(props, style), ...elevationAttrs(props), ...accessibilityAttrs(node), ...componentGraphIdentityAttrs(node), children: [_jsx("h3", { className: "formspec-group-title", children: title }), children] }));
    }
    return (_jsx("div", { className: mergeClasses('formspec-stack', themeClass), style: stackStyle, ...componentGraphIdentityAttrs(node), children: children }));
}
// ── Grid ─────────────────────────────────────────────────────────
function GridLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const columns = props.columns;
    const gap = props.gap;
    const rowGap = props.rowGap;
    let gridTemplateColumns;
    if (typeof columns === 'number') {
        gridTemplateColumns = `repeat(${columns}, 1fr)`;
    }
    else if (typeof columns === 'string') {
        gridTemplateColumns = columns;
    }
    else if (Array.isArray(columns) && columns.length > 0) {
        gridTemplateColumns = columns
            .map((track) => typeof track === 'number' ? `${track}fr` : String(track))
            .join(' ');
    }
    else {
        gridTemplateColumns = 'repeat(1, 1fr)';
    }
    const gridStyle = {
        display: 'grid',
        gridTemplateColumns,
        gap: '1rem',
        ...(rowGap ? { rowGap } : {}),
        ...surfaceStyle(props, style),
        // Props gap/rowGap win over theme style
        ...(gap ? { gap } : {}),
        ...(rowGap ? { rowGap } : {}),
    };
    return (_jsx("div", { className: mergeClasses('formspec-grid', themeClass), style: gridStyle, ...componentGraphIdentityAttrs(node), children: children }));
}
// ── Card / Section ────────────────────────────────────────────────
function CardLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const label = node.fieldItem?.label || props.title;
    const subtitle = props.subtitle;
    const headingLevel = Math.min(6, Math.max(1, props.headingLevel ?? 3));
    const Heading = `h${headingLevel}`;
    return (_jsxs("section", { className: mergeClasses('formspec-card', themeClass), style: surfaceStyle(props, style), ...elevationAttrs(props), ...componentGraphIdentityAttrs(node), children: [label && _jsx(Heading, { className: "formspec-card-title", children: label }), subtitle && _jsx("p", { className: "formspec-card-subtitle", children: subtitle }), children] }));
}
// ── Divider ───────────────────────────────────────────────────────
function DividerLayout({ node, themeClass, style }) {
    const label = node.props?.label;
    if (label) {
        return (_jsxs("div", { className: mergeClasses('formspec-divider formspec-divider--labeled', themeClass), style: style, ...componentGraphIdentityAttrs(node), children: [_jsx("hr", {}), _jsx("span", { children: label }), _jsx("hr", {})] }));
    }
    return _jsx("hr", { className: mergeClasses('formspec-divider', themeClass), style: style, ...componentGraphIdentityAttrs(node) });
}
// ── Section ──────────────────────────────────────────────────────
function SectionLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const title = props.title;
    const description = props.description;
    const headingLevel = Math.min(6, Math.max(1, props.headingLevel ?? 2));
    const Heading = `h${headingLevel}`;
    return (_jsxs("section", { className: mergeClasses('formspec-section', themeClass), style: surfaceStyle(props, style), ...elevationAttrs(props), ...componentGraphIdentityAttrs(node), children: [title && _jsx(Heading, { children: title }), description && _jsx("p", { className: "formspec-section-description", children: description }), children] }));
}
// ── Collapsible ───────────────────────────────────────────────────
function CollapsibleLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const title = props.title ?? 'Details';
    const defaultOpen = props.defaultOpen;
    return (_jsxs("details", { className: mergeClasses('formspec-collapsible', themeClass), style: style, open: defaultOpen || false, ...componentGraphIdentityAttrs(node), children: [_jsx("summary", { children: title }), _jsx("div", { className: "formspec-collapsible-content", children: children })] }));
}
// ── Accordion ────────────────────────────────────────────────────
function AccordionLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const labels = props.labels ?? [];
    const defaultOpen = props.defaultOpen;
    const allowMultiple = props.allowMultiple;
    const containerRef = useRef(null);
    const childArray = React.Children.toArray(children);
    // Single-open mode: track one open index
    const [openIndex, setOpenIndex] = useState(defaultOpen != null ? defaultOpen : null);
    // Multi-open mode: track a set of open indices
    const [openIndices, setOpenIndices] = useState(() => {
        const initial = new Set();
        if (defaultOpen != null)
            initial.add(defaultOpen);
        return initial;
    });
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
        }
        else {
            setOpenIndex(prev => {
                if (open)
                    return idx;
                // Programmatically closing another <details> (when switching panels)
                // fires toggle with open=false on that element. Ignore those so they
                // do not clear the index we just set from the opening panel.
                if (prev === idx)
                    return null;
                return prev;
            });
        }
    }, [allowMultiple]);
    const handleKeyDown = useCallback((e) => {
        const summaries = Array.from(containerRef.current?.querySelectorAll('summary') ?? []);
        if (summaries.length === 0)
            return;
        const focused = summaries.indexOf(document.activeElement);
        if (focused === -1)
            return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            summaries[Math.min(focused + 1, summaries.length - 1)]?.focus();
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            summaries[Math.max(focused - 1, 0)]?.focus();
        }
        else if (e.key === 'Home') {
            e.preventDefault();
            summaries[0]?.focus();
        }
        else if (e.key === 'End') {
            e.preventDefault();
            summaries[summaries.length - 1]?.focus();
        }
    }, []);
    return (_jsx("div", { ref: containerRef, className: mergeClasses('formspec-accordion', themeClass), style: style, onKeyDown: handleKeyDown, ...componentGraphIdentityAttrs(node), children: childArray.map((child, idx) => {
            const label = labels[idx] ?? `Section ${idx + 1}`;
            const isOpen = allowMultiple ? openIndices.has(idx) : (openIndex === idx);
            return (_jsxs("details", { className: "formspec-accordion-item", open: isOpen, onToggle: (e) => handleToggle(idx, e.currentTarget.open), children: [_jsx("summary", { children: label }), _jsx("div", { className: "formspec-accordion-content", children: child })] }, idx));
        }) }));
}
// ── Panel ─────────────────────────────────────────────────────────
function PanelLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const title = props.title;
    const placement = props.placement;
    const width = props.width;
    const panelStyle = {
        ...(placement === 'left' ? { order: -1 } : placement === 'right' ? { order: 1 } : {}),
        ...(width ? { width } : {}),
        ...surfaceStyle(props, style),
    };
    return (_jsxs("div", { className: mergeClasses('formspec-panel', themeClass), style: panelStyle, ...elevationAttrs(props), ...componentGraphIdentityAttrs(node), children: [title && _jsx("div", { className: "formspec-panel-header", children: title }), _jsx("div", { className: "formspec-panel-body", children: children })] }));
}
// ── Modal ─────────────────────────────────────────────────────────
function parseModalPlacement(raw) {
    if (raw === 'top' || raw === 'right' || raw === 'bottom' || raw === 'left')
        return raw;
    return undefined;
}
function ModalLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const title = props.title;
    const triggerLabel = props.triggerLabel ?? 'Open';
    const closable = props.closable !== false;
    const size = props.size;
    const headingLevel = Math.min(6, Math.max(1, props.headingLevel ?? 2));
    const Heading = `h${headingLevel}`;
    const triggerMode = props.trigger || 'button';
    const placement = parseModalPlacement(props.placement);
    const dialogRef = useRef(null);
    const triggerRef = useRef(null);
    const titleId = node.id ? `${node.id}-title` : 'modal-title';
    const felForAuto = triggerMode === 'auto' ? (node.when || 'true') : 'false';
    const autoOpenDesired = useWhen(felForAuto, node.whenPrefix);
    const focusDialogContent = useCallback(() => {
        requestAnimationFrame(() => {
            const d = dialogRef.current;
            const first = d?.querySelector(MODAL_FIRST_FOCUSABLE_SELECTOR);
            first?.focus();
        });
    }, []);
    const openModal = useCallback(() => {
        const d = dialogRef.current;
        const t = triggerRef.current;
        if (!d)
            return;
        clearPopupFixedPosition(d);
        d.showModal();
        requestAnimationFrame(() => {
            if (placement && t) {
                positionPopupNearTrigger(t, d, placement);
            }
            const first = d.querySelector(MODAL_FIRST_FOCUSABLE_SELECTOR);
            first?.focus();
        });
    }, [placement]);
    const closeModal = useCallback(() => {
        dialogRef.current?.close();
    }, []);
    useLayoutEffect(() => {
        if (triggerMode !== 'auto')
            return;
        const d = dialogRef.current;
        if (!d)
            return;
        if (autoOpenDesired && !d.open) {
            clearPopupFixedPosition(d);
            d.showModal();
            focusDialogContent();
        }
        else if (!autoOpenDesired && d.open) {
            d.close();
        }
    }, [triggerMode, autoOpenDesired, focusDialogContent]);
    const handleDialogClick = useCallback((e) => {
        if (closable && e.target === dialogRef.current) {
            closeModal();
        }
    }, [closable, closeModal]);
    useEffect(() => {
        if (!placement)
            return;
        const reposition = () => {
            const d = dialogRef.current;
            const t = triggerRef.current;
            if (d?.open && t)
                positionPopupNearTrigger(t, d, placement);
        };
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [placement]);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog)
            return;
        const onClose = () => {
            clearPopupFixedPosition(dialog);
            triggerRef.current?.focus();
        };
        dialog.addEventListener('close', onClose);
        return () => dialog.removeEventListener('close', onClose);
    }, []);
    return (_jsxs(_Fragment, { children: [triggerMode === 'button' && (_jsx("button", { type: "button", className: "formspec-modal-trigger formspec-focus-ring", ref: triggerRef, onClick: openModal, children: triggerLabel })), _jsxs("dialog", { ref: dialogRef, className: mergeClasses('formspec-modal', themeClass), style: style, "aria-labelledby": title ? titleId : undefined, "aria-label": title ? undefined : triggerLabel, ...(size ? { 'data-size': size } : {}), onClick: handleDialogClick, ...componentGraphIdentityAttrs(node), children: [closable && (_jsx("button", { type: "button", className: "formspec-modal-close formspec-focus-ring", "aria-label": "Close", onClick: closeModal, children: _jsx("span", { "aria-hidden": "true", children: "\u00D7" }) })), title && (_jsx(Heading, { className: "formspec-modal-title", id: titleId, children: title })), _jsx("div", { className: "formspec-modal-content", children: children })] })] }));
}
// ── Popover ───────────────────────────────────────────────────────
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function getFocusables(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
}
function PopoverLayout({ node, children, themeClass, style }) {
    const props = node.props ?? {};
    const triggerLabel = props.triggerLabel ?? 'Open';
    const title = props.title;
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);
    const contentRef = useRef(null);
    const triggerRef = useRef(null);
    const close = useCallback(() => {
        setOpen(false);
        triggerRef.current?.focus();
    }, []);
    const toggle = useCallback(() => setOpen(v => {
        const next = !v;
        return next;
    }), []);
    // When opening: move focus into content container
    useEffect(() => {
        if (!open || !contentRef.current)
            return;
        const focusables = getFocusables(contentRef.current);
        if (focusables.length > 0) {
            focusables[0].focus();
        }
        else {
            contentRef.current.focus();
        }
    }, [open]);
    // Dismiss on outside click
    useEffect(() => {
        if (!open)
            return;
        const onClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                close();
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open, close]);
    // Focus trap + Escape dismiss
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
            return;
        }
        if (e.key !== 'Tab' || !contentRef.current)
            return;
        const focusables = getFocusables(contentRef.current);
        if (focusables.length === 0) {
            e.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first || document.activeElement === contentRef.current) {
                e.preventDefault();
                last.focus();
            }
        }
        else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }, [close]);
    return (_jsxs("div", { ref: wrapperRef, className: mergeClasses('formspec-popover', themeClass), style: style, ...componentGraphIdentityAttrs(node), children: [_jsx("button", { type: "button", className: "formspec-popover-trigger", ref: triggerRef, "aria-haspopup": "dialog", "aria-expanded": open, onClick: toggle, children: triggerLabel }), _jsx("div", { ref: contentRef, className: "formspec-popover-content", role: "dialog", "aria-label": title ?? triggerLabel, tabIndex: -1, onKeyDown: handleKeyDown, hidden: !open, children: children })] }));
}
// ── Generic fallback ──────────────────────────────────────────────
function DefaultContainer({ node, children, themeClass, style }) {
    return (_jsx("div", { className: mergeClasses(`formspec-${node.component.toLowerCase()}`, themeClass), style: style, ...componentGraphIdentityAttrs(node), children: children }));
}
