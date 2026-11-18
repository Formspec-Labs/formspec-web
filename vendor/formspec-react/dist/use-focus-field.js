'use client';
/** @filedesc useFocusField — programmatic field focus with wizard/tab/collapsible navigation. */
import { useCallback, useRef } from 'react';
export function useFocusField() {
    const containerRef = useRef(null);
    const focusField = useCallback((path) => {
        const container = containerRef.current;
        return container ? focusFieldIn(container, path) : false;
    }, []);
    return { focusField, containerRef };
}
/**
 * Focus the field rendered at `path` (its `[data-name]` root) inside `container`, first revealing it:
 * open ancestor `<details>`, activate a hidden tab panel, or navigate a hidden wizard step.
 * Returns true if a focusable control was found and focused.
 */
export function focusFieldIn(container, path) {
    const fieldEl = container.querySelector(`[data-name="${path}"]`);
    if (!fieldEl)
        return false;
    // Open any ancestor <details> elements (collapsibles)
    let parent = fieldEl.parentElement;
    while (parent && parent !== container) {
        if (parent.tagName === 'DETAILS' && !parent.open) {
            parent.open = true;
        }
        parent = parent.parentElement;
    }
    // The tab selection commits through React. A caller can retry focus after it paints.
    const hiddenTabs = '[role="tabpanel"][hidden]';
    for (let tab = fieldEl.closest(hiddenTabs); tab; tab = tab.parentElement?.closest(hiddenTabs) ?? null) {
        container.querySelector(`[aria-controls="${tab.id}"]`)?.click();
    }
    if (fieldEl.closest(hiddenTabs))
        return false;
    // If inside a hidden wizard panel, navigate to that step
    const wizardPanel = fieldEl.closest('.formspec-wizard-panel[hidden]');
    if (wizardPanel) {
        const panels = Array.from(wizardPanel.parentElement?.querySelectorAll('.formspec-wizard-panel') ?? []);
        const stepIndex = panels.indexOf(wizardPanel);
        if (stepIndex >= 0) {
            const stepButtons = container.querySelectorAll('.formspec-wizard-step');
            stepButtons[stepIndex]?.click();
        }
    }
    const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    if (typeof fieldEl.scrollIntoView === 'function') {
        fieldEl.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
    }
    const input = fieldEl.querySelector('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([disabled])');
    if (!input)
        return false;
    input.focus();
    return input.ownerDocument.activeElement === input;
}
/** Enclosing group/repeat path of an instance path (`a[0].b` → `a[0]` → `a` → `''`). */
function parentInstancePath(path) {
    const parent = path.replace(/(\[\d+\]|\.[^.[\]]+)$/, '');
    return parent === path ? '' : parent;
}
/**
 * Focus the first rendered field, in page order, carrying an error result on itself or an enclosing
 * group; report order follows binds and shapes, not layout. Falls back to the first error's path.
 * Same rule as formspec-webcomponent `submit/index.ts` firstInvalidFieldPath. O(fields × path depth).
 */
export function focusFirstInvalidField(container, results) {
    const errorPaths = results.filter((r) => r.severity === 'error' && r.path).map((r) => r.path);
    if (errorPaths.length === 0)
        return false;
    const errorPathSet = new Set(errorPaths);
    for (const fieldEl of container.querySelectorAll('[data-name]')) {
        const name = fieldEl.dataset.name;
        for (let path = name; path; path = parentInstancePath(path)) {
            if (errorPathSet.has(path))
                return focusFieldIn(container, name);
        }
    }
    return focusFieldIn(container, errorPaths[0]);
}
