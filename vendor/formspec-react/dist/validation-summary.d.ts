export interface ValidationSummaryProps {
    /** Validation results for 'submit' source mode (from engine.getValidationReport()). */
    results?: Array<{
        path: string;
        message: string;
        severity: string;
    }>;
    /**
     * 'live' — subscribe to engine validation signals and re-render on every change.
     * 'submit' — show results from the `results` prop only (existing behavior).
     * Default: 'submit'.
     */
    source?: 'live' | 'submit';
    /** Which severities to render. Default: ['error', 'warning']. */
    severityFilter?: string[];
    /** Whether to auto-focus the summary when results appear. Default: true. */
    autoFocus?: boolean;
    /** Optional className override for the container. */
    className?: string;
}
/**
 * Renders a validation error/warning summary with clickable jump links.
 * Resolves field paths to human-readable labels and field element IDs
 * via the FormEngine's FieldViewModels.
 *
 * When source='live', subscribes to engine.structureVersion so the summary
 * re-renders on any form state change without requiring a submit.
 */
export declare function ValidationSummary({ results: resultsProp, source, severityFilter, autoFocus, className, }: ValidationSummaryProps): import("react/jsx-runtime").JSX.Element | null;
