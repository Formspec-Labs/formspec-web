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
import { widgetTokenToComponent } from '@formspec-org/types';
// ── Helpers ─────────────────────────────────────────────────────────
/** Normalize cssClass to a flat string array. */
function normalizeCssClass(val) {
    if (!val)
        return [];
    if (Array.isArray(val))
        return val.flatMap(c => c.split(/\s+/).filter(Boolean));
    return val.split(/\s+/).filter(Boolean);
}
/**
 * Extract the utility-class prefix from a CSS class name.
 * Recognizes patterns like `p-4` → `p-`, `text-lg` → `text-`, `bg-red-500` → `bg-`.
 * Returns null for classes without a recognizable prefix (e.g. `formspec-field`).
 */
function extractUtilityPrefix(cls) {
    // Match common utility patterns: prefix + dash + value
    // E.g. p-4, mx-auto, text-lg, bg-red-500, rounded-md
    const match = cls.match(/^(-?[a-z]+)-/);
    return match ? match[1] + '-' : null;
}
/**
 * Optional tailwind-merge function injected at runtime.
 * Consumers call `setTailwindMerge(twMerge)` to enable the `"tailwind-merge"` classStrategy.
 */
let twMergeFn = null;
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
export function setTailwindMerge(fn) {
    twMergeFn = fn;
}
/**
 * Apply the configured class merge strategy to a resolved class list.
 */
function applyClassStrategy(classes, strategy) {
    if (strategy === 'tailwind-merge') {
        if (!twMergeFn) {
            console.warn('classStrategy "tailwind-merge" requires calling setTailwindMerge(twMerge) at startup. ' +
                'Falling back to union strategy.');
            return classes;
        }
        // twMerge resolves Tailwind conflicts: "p-4 p-8" → "p-8"
        const merged = twMergeFn(classes.join(' '));
        return merged.split(/\s+/).filter(Boolean);
    }
    return classes;
}
function asRecord(val) {
    if (!val || typeof val !== 'object' || Array.isArray(val))
        return null;
    return val;
}
/**
 * Merge two PresentationBlocks. `higher` overrides `lower` for scalar
 * properties (shallow merge). `cssClass` is unioned, not replaced.
 * `cssClassReplace` removes matching lower-level classes before unioning.
 * `style`, `widgetConfig`, and `accessibility` are shallow-merged.
 */
function mergeBlocks(lower, higher) {
    const merged = { ...lower };
    if (higher.widget !== undefined)
        merged.widget = higher.widget;
    if (higher.labelPosition !== undefined)
        merged.labelPosition = higher.labelPosition;
    if (higher.fallback !== undefined)
        merged.fallback = higher.fallback;
    // cssClassReplace: higher level explicitly replaces matching lower classes
    const replaceClasses = normalizeCssClass(higher.cssClassReplace);
    if (replaceClasses.length > 0) {
        const lowerClasses = normalizeCssClass(merged.cssClass);
        const replaceSet = new Set(replaceClasses);
        const replacePrefixes = replaceClasses.map(extractUtilityPrefix).filter(Boolean);
        // Remove lower classes that conflict with replacement classes
        const filtered = lowerClasses.filter(cls => {
            if (replaceSet.has(cls))
                return false;
            // Remove lower classes with the same utility prefix as a replacement
            const prefix = extractUtilityPrefix(cls);
            if (prefix && replacePrefixes.includes(prefix))
                return false;
            return true;
        });
        // Accumulate replacements into the cssClass union
        const union = new Set([...filtered, ...replaceClasses]);
        merged.cssClass = [...union];
        // Track accumulated replacements so later levels can see them
        const lowerReplace = normalizeCssClass(merged.cssClassReplace);
        merged.cssClassReplace = [...new Set([...lowerReplace, ...replaceClasses])];
    }
    // cssClass: union across cascade levels
    const lowerClasses = normalizeCssClass(merged.cssClass);
    const higherClasses = normalizeCssClass(higher.cssClass);
    if (higherClasses.length > 0) {
        const union = new Set([...lowerClasses, ...higherClasses]);
        merged.cssClass = [...union];
    }
    // Shallow-merge objects
    if (higher.widgetConfig !== undefined) {
        const lowerCfg = asRecord(merged.widgetConfig) || {};
        const higherCfg = asRecord(higher.widgetConfig) || {};
        const combined = { ...lowerCfg, ...higherCfg };
        // Support additive merge for `widgetConfig["x-classes"]` slot mappings.
        const lowerSlots = asRecord(lowerCfg['x-classes']);
        const higherSlots = asRecord(higherCfg['x-classes']);
        if (lowerSlots || higherSlots) {
            combined['x-classes'] = {
                ...(lowerSlots || {}),
                ...(higherSlots || {}),
            };
        }
        merged.widgetConfig = combined;
    }
    if (higher.style !== undefined) {
        merged.style = { ...merged.style, ...higher.style };
    }
    if (higher.accessibility !== undefined) {
        merged.accessibility = { ...merged.accessibility, ...higher.accessibility };
    }
    return merged;
}
/** Check if a selector matches an item descriptor. */
function selectorMatches(match, item) {
    // Schema requires at least one of type/dataType via anyOf.
    // Guard against empty match objects that slip past schema validation.
    if (match.type === undefined && match.dataType === undefined)
        return false;
    if (match.type !== undefined && match.type !== item.type)
        return false;
    if (match.dataType !== undefined && match.dataType !== item.dataType)
        return false;
    return true;
}
// ── Main Resolver ───────────────────────────────────────────────────
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
export function resolvePresentation(theme, item, tier1) {
    let result = {};
    // Level 1: Tier 1 form-wide hints (lowest priority)
    if (tier1?.formPresentation) {
        const fp = tier1.formPresentation;
        if (fp.labelPosition)
            result.labelPosition = fp.labelPosition;
    }
    // Level 2: Tier 1 per-item hints
    if (tier1?.itemPresentation) {
        const ip = tier1.itemPresentation;
        if (ip.widgetHint)
            result.widget = ip.widgetHint;
        // Map layout hints that have presentation equivalents
        if (ip.layout?.collapsible) {
            // Layout hints don't map directly to PresentationBlock properties,
            // but are available through the Tier1Hints for consumers
        }
    }
    if (!theme)
        return result;
    // Level 3: Theme defaults
    if (theme.defaults) {
        result = mergeBlocks(result, theme.defaults);
    }
    // Level 4: Theme selectors (document order)
    if (theme.selectors) {
        for (const selector of theme.selectors) {
            if (selectorMatches(selector.match, item)) {
                result = mergeBlocks(result, selector.apply);
            }
        }
    }
    // Level 5: Theme items[key] (highest priority)
    if (theme.items?.[item.key]) {
        result = mergeBlocks(result, theme.items[item.key]);
    }
    // Post-process: apply classStrategy if specified
    if (theme.classStrategy === 'tailwind-merge' && result.cssClass) {
        result = { ...result, cssClass: applyClassStrategy(normalizeCssClass(result.cssClass), theme.classStrategy) };
    }
    // Strip internal cssClassReplace from the final output
    delete result.cssClassReplace;
    return result;
}
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
export function resolveWidget(presentation, isAvailable) {
    if (!presentation.widget)
        return null;
    // Try the preferred widget first
    const preferred = widgetTokenToComponent(presentation.widget);
    if (preferred && isAvailable(preferred))
        return preferred;
    // Try fallback chain
    if (presentation.fallback) {
        for (const fb of presentation.fallback) {
            const fallback = widgetTokenToComponent(fb);
            if (fallback && isAvailable(fallback))
                return fallback;
        }
    }
    // Theme widget unavailable, no fallback matched — emit diagnostic per spec §7
    const tried = [presentation.widget, ...(presentation.fallback || [])].join(', ');
    console.warn(`Theme widget unavailable: tried [${tried}]. Falling back to default.`);
    return null;
}
