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
