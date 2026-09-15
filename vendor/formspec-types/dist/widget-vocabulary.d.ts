/**
 * Canonical widget vocabulary — single source of truth for widget ↔ component mappings.
 *
 * Lives in formspec-types so every package has access without adding dependencies.
 * All packages that need widget resolution import from here (via formspec-types
 * or re-exported through formspec-layout).
 */
/**
 * Spec-normative Tier 1 widgetHint → Tier 3 component name.
 * Keys and values are canonical PascalCase component names.
 */
export declare const SPEC_WIDGET_TO_COMPONENT: Record<string, string>;
/**
 * Reverse map: PascalCase component → canonical PascalCase hint.
 * These are the values stored in definition.presentation.widgetHint.
 */
export declare const COMPONENT_TO_HINT: Record<string, string>;
export declare const KNOWN_COMPONENT_TYPES: Set<string>;
/**
 * Item-presentation widgets (theme §4.2 "Item Presentation Widgets"): valid Theme `widget` and Tier 1
 * `widgetHint` tokens that name how a renderer presents an Item, not a Component Document component.
 * They carry no authorable node, no children, and no `widgetConfig`, so they stay out of
 * `UI_POLICY.components` — a Component Document expresses the same shapes with its own nodes.
 *
 * - `RepeatCards` — a repeatable group as one card per instance (the fieldset render is the default).
 * - `Hidden` — a field the engine keeps and the page never shows (row data other questions read).
 */
export declare const PRESENTATION_WIDGETS: readonly string[];
/**
 * Presentation widgets that render a repeatable group's rows. The planner records one on the repeat
 * template; the renderer routes it to the same-named adapter render, or falls back to the group's
 * default repeat chrome when the active adapter has none (theme §4.4).
 */
export declare const REPEAT_PRESENTATION_WIDGETS: ReadonlySet<string>;
/** Whether `widget` names a repeatable-group presentation (see {@link REPEAT_PRESENTATION_WIDGETS}). */
export declare function isRepeatPresentationWidget(widget: string | null | undefined): boolean;
/**
 * Widget compatibility matrix: dataType → ordered list of compatible components.
 * First entry is the default widget for that dataType.
 */
export declare const COMPATIBILITY_MATRIX: Record<string, string[]>;
/**
 * Convert a Tier 1 / theme widget token into a concrete component type.
 *
 * Accepts canonical PascalCase built-ins and extension ids (`x-*`).
 */
export declare function widgetTokenToComponent(widget: string | null | undefined): string | null;
