'use client';
/** @filedesc useFocusField — programmatic field focus with wizard/tab/collapsible navigation. */
import { useCallback, useRef } from 'react';
export function useFocusField() {
    const containerRef = useRef(null);
    const focusField = useCallback((path) => {
        const container = containerRef.current;
        if (!container)
            return false;
        // Find field element by data-name attribute
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
        // If inside a hidden tab panel, activate that tab
        const tabPanel = fieldEl.closest('[role="tabpanel"][hidden]');
        if (tabPanel) {
            const panelId = tabPanel.id;
            // Find and click the corresponding tab button
            const tabButton = container.querySelector(`[aria-controls="${panelId}"]`);
            tabButton?.click();
        }
        // If inside a hidden wizard panel, navigate to that step
        const wizardPanel = fieldEl.closest('.formspec-wizard-panel[hidden]');
        if (wizardPanel) {
            // Find the step index from sibling panels
            const panels = Array.from(wizardPanel.parentElement?.querySelectorAll('.formspec-wizard-panel') ?? []);
            const stepIndex = panels.indexOf(wizardPanel);
            if (stepIndex >= 0) {
                // Find and click the step button
                const stepButtons = container.querySelectorAll('.formspec-wizard-step');
                stepButtons[stepIndex]?.click();
            }
        }
        // Scroll into view
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        fieldEl.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
        // Focus the actual input element
        const input = fieldEl.querySelector('input, select, textarea, button, [tabindex]');
        if (input) {
            input.focus();
            return true;
        }
        return false;
    }, []);
    return { focusField, containerRef };
}
