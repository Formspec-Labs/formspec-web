'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Tabs layout component — WAI-ARIA tabbed panel navigation with keyboard support. */
import React, { useState, useRef, useCallback } from 'react';
/**
 * Tabs layout component.
 *
 * Renders a tab bar and tab panels following the WAI-ARIA Tabs pattern.
 * Supports top/bottom/side tab placement, keyboard navigation (Arrow/Home/End),
 * and automatic activation on arrow key press.
 *
 * Tab labels are read from child LayoutNode metadata (fieldItem.label, props.title,
 * or "Tab N" fallback). All panels remain mounted; inactive panels are hidden via
 * the HTML `hidden` attribute to preserve component state across tab switches.
 */
export function Tabs({ node, children }) {
    const defaultTab = node.props?.defaultTab ?? 0;
    const [activeTab, setActiveTabRaw] = useState(defaultTab);
    const tabCount = node.children.length;
    const buttonRefs = useRef([]);
    const id = node.id || 'tabs';
    const placement = node.props?.placement || 'top';
    const ariaLabel = node.props?.['aria-label']
        || node.fieldItem?.label
        || 'Tabs';
    const setActiveTab = useCallback((nextIndex) => {
        const bounded = Math.max(0, Math.min(tabCount - 1, nextIndex));
        setActiveTabRaw(bounded);
        // Focus the target tab button (WAI-ARIA automatic activation)
        setTimeout(() => buttonRefs.current[bounded]?.focus(), 0);
    }, [tabCount]);
    const handleKeyDown = useCallback((event) => {
        let nextIndex;
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                nextIndex = (activeTab + 1) % tabCount;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                nextIndex = (activeTab - 1 + tabCount) % tabCount;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = tabCount - 1;
                break;
        }
        if (nextIndex !== undefined) {
            event.preventDefault();
            setActiveTab(nextIndex);
        }
    }, [activeTab, tabCount, setActiveTab]);
    // Spec: tabLabels prop takes precedence, then derive from child metadata
    const explicitLabels = node.props?.tabLabels;
    const tabLabels = node.children.map((child, idx) => explicitLabels?.[idx]
        || child.fieldItem?.label
        || child.props?.title
        || child.props?.label
        || `Tab ${idx + 1}`);
    const renderedChildren = React.Children.toArray(children);
    const tabBar = (_jsx("div", { role: "tablist", "aria-label": ariaLabel, "aria-orientation": placement === 'left' || placement === 'right' ? 'vertical' : undefined, className: "formspec-tab-bar", onKeyDown: handleKeyDown, children: tabLabels.map((label, idx) => {
            const isActive = idx === activeTab;
            return (_jsx("button", { type: "button", className: isActive ? 'formspec-tab formspec-tab--active' : 'formspec-tab', ref: (el) => { buttonRefs.current[idx] = el; }, role: "tab", id: `tab-${id}-${idx}`, "aria-selected": isActive, "aria-controls": `panel-${id}-${idx}`, tabIndex: isActive ? 0 : -1, onClick: () => setActiveTab(idx), children: label }, idx));
        }) }));
    const panels = (_jsx("div", { className: "formspec-tab-panels", children: tabLabels.map((_, idx) => {
            const isActive = idx === activeTab;
            return (_jsx("div", { role: "tabpanel", id: `panel-${id}-${idx}`, "aria-labelledby": `tab-${id}-${idx}`, tabIndex: 0, hidden: !isActive, className: "formspec-tab-panel", children: renderedChildren[idx] }, idx));
        }) }));
    const cssClass = node.cssClasses?.join(' ') || 'formspec-tabs';
    const style = node.style;
    return (_jsx("div", { className: cssClass, style: {
            ...style,
            ...(placement === 'left' || placement === 'right' ? { display: 'flex', flexDirection: 'row' } : {}),
        }, "data-placement": placement !== 'top' ? placement : undefined, children: placement === 'bottom' || placement === 'right' ? (_jsxs(_Fragment, { children: [panels, tabBar] })) : (_jsxs(_Fragment, { children: [tabBar, panels] })) }));
}
