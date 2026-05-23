/**
 * Theme cascade resolver.
 *
 * Resolves the effective {@link PresentationBlock} for a given item by
 * merging the 5-level theme cascade:
 *
 *   1. Tier 1 formPresentation (lowest)
 *   2. Tier 1 item.presentation
 *   3. Theme defaults
 *   4. Matching theme selectors (document order)
 *   5. Theme items[key] (highest)
 *
 * Also provides {@link resolveWidget} for selecting the best available
 * widget from a preference + fallback chain.
 *
 * @module
 */
import { type Extensions } from '@formspec-org/types';
/** Union of all `dataType` values recognized by the Formspec schema for selector matching and field definitions. */
export type FormspecDataType = 'string' | 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'dateTime' | 'time' | 'uri' | 'attachment' | 'choice' | 'multiChoice' | 'money';
/** ARIA-related presentation hints applied to a rendered element. */
export interface AccessibilityBlock {
    role?: string;
    description?: string;
    liveRegion?: 'off' | 'polite' | 'assertive';
}
/** Merged presentation directives for a single item: widget choice, label position, styles, CSS classes, accessibility, and fallback chain. */
export interface PresentationBlock {
    widget?: string;
    widgetConfig?: Record<string, unknown>;
    labelPosition?: 'top' | 'start' | 'hidden';
    style?: Record<string, string | number>;
    accessibility?: AccessibilityBlock;
    fallback?: string[];
    cssClass?: string | string[];
    /**
     * CSS classes that **replace** rather than union with lower cascade levels.
     * Use when a higher-priority level needs to override utility classes from
     * a lower level (e.g. replacing `p-4` with `p-8` in Tailwind).
     *
     * During cascade merging, `cssClassReplace` entries are collected, and
     * after the final union any exact matches from lower levels are removed.
     */
    cssClassReplace?: string | string[];
}
/** Criteria for a theme selector rule: matches items by type, dataType, or both. */
export interface SelectorMatch {
    type?: 'group' | 'field' | 'display';
    dataType?: FormspecDataType;
}
/** A theme selector rule pairing a {@link SelectorMatch} condition with a {@link PresentationBlock} to apply. */
export interface ThemeSelector {
    match: SelectorMatch;
    apply: PresentationBlock;
}
/** A named layout region within a page, with optional grid span/start and responsive overrides. */
export interface Region {
    key: string;
    span?: number;
    start?: number;
    responsive?: Record<string, {
        span?: number;
        start?: number;
        hidden?: boolean;
    }>;
}
/** A page definition within a theme, used for wizard/tab page layouts with optional region grid. */
export interface Page {
    id: string;
    title: string;
    description?: string;
    regions?: Region[];
}
/** Top-level theme document: tokens, defaults, selectors, per-item overrides, pages, breakpoints, and stylesheets. */
export interface ThemeDocument {
    $formspecTheme: '1.0';
    version: string;
    targetDefinition: {
        url: string;
        compatibleVersions?: string;
    };
    url?: string;
    name?: string;
    title?: string;
    description?: string;
    platform?: string;
    tokens?: Record<string, string | number>;
    defaults?: PresentationBlock;
    selectors?: ThemeSelector[];
    items?: Record<string, PresentationBlock>;
    pages?: Page[];
    breakpoints?: Record<string, number>;
    stylesheets?: string[];
    extensions?: Extensions;
    /**
     * CSS class merge strategy applied after cascade resolution.
     * - `"union"` (default): plain Set-based deduplication.
     * - `"tailwind-merge"`: conflict-aware merge that keeps only the last
     *   utility per Tailwind prefix (requires `tailwind-merge` at runtime).
     */
    classStrategy?: 'union' | 'tailwind-merge';
}
/** Lightweight identifier for a definition item, used as the input to the theme cascade resolver. */
export interface ItemDescriptor {
    key: string;
    type: 'group' | 'field' | 'display';
    dataType?: FormspecDataType;
}
/** Tier 1 layout hints from the definition: flow direction, grid columns, collapsibility, and grid placement. */
export interface LayoutHints {
    flow?: 'stack' | 'grid' | 'inline';
    columns?: number;
    grid?: {
        span?: number;
        start?: number;
        rowSpan?: number;
        rowStart?: number;
    };
    collapsible?: boolean;
    collapsedByDefault?: boolean;
}
/** Tier 1 visual emphasis and sizing hints from the definition. */
export interface StyleHints {
    emphasis?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
    size?: 'compact' | 'default' | 'large';
}
/** Definition-level (Tier 1) presentation hints that feed into the lowest two levels of the theme cascade. */
export interface Tier1Hints {
    /** Per-item presentation hints from the definition */
    itemPresentation?: {
        widgetHint?: string;
        layout?: LayoutHints;
        styleHints?: StyleHints;
    };
    /** Form-wide presentation defaults from the definition */
    formPresentation?: {
        labelPosition?: 'top' | 'start' | 'hidden';
        density?: 'compact' | 'comfortable' | 'spacious';
        pageMode?: 'single' | 'wizard' | 'tabs';
    };
}
/**
 * Inject the `twMerge` function from the `tailwind-merge` package.
 * Call this once at startup to enable `classStrategy: "tailwind-merge"`:
 *
 * ```ts
 * import { twMerge } from 'tailwind-merge';
 * import { setTailwindMerge } from '@formspec-org/layout';
 * setTailwindMerge(twMerge);
 * ```
 */
export declare function setTailwindMerge(fn: (classes: string) => string): void;
/**
 * Resolve the effective {@link PresentationBlock} for a single item by
 * merging five cascade levels (lowest to highest priority):
 *
 * 1. Tier 1 form-wide presentation hints (`formPresentation`)
 * 2. Tier 1 per-item presentation hints (`item.presentation`)
 * 3. Theme defaults
 * 4. Theme selectors (document order; later selectors override earlier)
 * 5. Theme `items[key]` overrides
 *
 * Scalar properties are replaced at each level. `cssClass` is unioned,
 * and `style`, `widgetConfig`, and `accessibility` are shallow-merged.
 *
 * @param theme - The active theme document, or `null`/`undefined` for no theme.
 * @param item  - Descriptor identifying the definition item (key, type, dataType).
 * @param tier1 - Optional Tier 1 hints from the definition (form-wide and per-item).
 * @returns The fully merged presentation block for the item.
 */
export declare function resolvePresentation(theme: ThemeDocument | null | undefined, item: ItemDescriptor, tier1?: Tier1Hints): PresentationBlock;
/**
 * Select the best available widget from a presentation block's preference
 * and fallback chain.
 *
 * Tries the preferred `widget` first, then each entry in `fallback` in order.
 * If none are available in the component registry, logs a warning (per Theme
 * spec section 7) and returns `null` so the caller can fall back to the default
 * component for the item's dataType.
 *
 * @param presentation - The resolved presentation block containing widget preference and fallback chain.
 * @param isAvailable  - Predicate that returns `true` when a component type string is registered.
 * @returns The first available widget type string, or `null` if the theme specifies no widget or none are registered.
 */
export declare function resolveWidget(presentation: PresentationBlock, isAvailable: (type: string) => boolean): string | null;
