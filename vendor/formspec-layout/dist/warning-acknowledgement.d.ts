/** @filedesc Shared view model for grouped blank-answer warning acknowledgements. */
import { type ChromeStringKey } from './ui-strings.js';
export interface WarningAcknowledgementGroupInput {
    code: string;
    basis?: string;
    shapeIds?: readonly string[];
    paths: readonly string[];
    current: boolean;
    added: readonly string[];
    removed: readonly string[];
}
export interface WarningAcknowledgementStateInput {
    groups?: readonly WarningAcknowledgementGroupInput[];
    entries?: readonly unknown[];
}
export interface WarningAcknowledgementSource {
    /** Return the live field/group label and control id for a path, or null if absent. */
    field(path: string): {
        label: string;
        controlId: string | null;
    } | null;
    /** Label used when a grouped acknowledgement covers the root `#` path. */
    rootLabel(): string;
    /** Resolve a scoped Locale string key (e.g. `$shape.<id>.explanationPrompt`) with FEL interpolation. */
    resolveText(key: string, fallback: string): string;
    /** Raw Locale lookup for `$ui.<ChromeStringKey>` templates without FEL interpolation. */
    lookupUi?(key: ChromeStringKey): string | null | undefined;
    /** Optional renderer jumpability check; defaults to `field(path) !== null`. */
    jumpable?(path: string): boolean;
    /** Optional custom link target (e.g. a Surface form route/section URL) for a field path. */
    hrefForPath?(path: string): string | null;
}
export interface WarningAcknowledgementItem {
    path: string;
    label: string;
    jumpPath: string | null;
    jumpHref: string | null;
}
export interface WarningAcknowledgementGroupView {
    code: string;
    basis?: string;
    legend: string;
    items: WarningAcknowledgementItem[];
    hasChanges: boolean;
    added: WarningAcknowledgementItem[];
    removed: Array<{
        path: string;
        label: string;
    }>;
    addedText: string | null;
    removedText: string | null;
    current: boolean;
    buttonLabel: string;
}
/** A group's heading: the first authored `explanationPrompt` among its Shapes, else how many questions it covers. */
export declare function warningAcknowledgementLegend(group: Pick<WarningAcknowledgementGroupInput, 'shapeIds' | 'paths'>, resolveText: WarningAcknowledgementSource['resolveText']): string;
/**
 * Build the renderer-agnostic grouped acknowledgement panels for the current Submit state.
 */
export declare function readWarningAcknowledgementGroups(state: WarningAcknowledgementStateInput, source: WarningAcknowledgementSource): WarningAcknowledgementGroupView[];
