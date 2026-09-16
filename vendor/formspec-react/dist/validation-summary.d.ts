import { type ValidationSummaryComp } from '@formspec-org/layout';
export interface ValidationSummaryProps {
    /**
     * The component's own props (component spec `ValidationSummary`: `source`, `mode`, `showFieldErrors`,
     * `jumpLinks`, `dedupe`), as the planner carries them. This is how a placed ValidationSummary renders.
     */
    comp?: ValidationSummaryComp;
    /** Findings to list when `source` is `submit` and no form submit is being read — a host's own results. */
    results?: Array<{
        path: string;
        message: string;
        severity: string;
    }>;
    /**
     * `live` reads the engine's validation as it changes; `submit` reads the latest submit through the
     * provider, or the `results` prop. Default: `submit`. `comp.source` outranks this.
     */
    source?: 'live' | 'submit';
    /** Which severities to render. Default: ['error', 'warning']. */
    severityFilter?: string[];
    /** Whether to auto-focus the summary when errors appear. Default: true. */
    autoFocus?: boolean;
    /** Optional className override for the container. */
    className?: string;
}
/**
 * The validation summary in the default look: a heading with the count, then every finding as a link to
 * its field. Which findings, in what words, and where each links are the shared reader's
 * (`@formspec-org/layout`) — the same rows the web component's adapters draw — fed from this provider's
 * engine, its latest submit and its touch gate. Jumping lands the focus the way the renderer's own field
 * focus does: disclosures opened, hidden tab or wizard step revealed.
 */
export declare function ValidationSummary({ comp, results: resultsProp, source: sourceProp, severityFilter, autoFocus, className, }: ValidationSummaryProps): import("react/jsx-runtime").JSX.Element | null;
