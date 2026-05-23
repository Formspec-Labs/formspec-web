/**
 * Merge responsive breakpoint overrides onto a component descriptor.
 *
 * When no numeric breakpoints are available — either because no breakpoints
 * map is supplied or because the map contains only raw media-query strings —
 * applies the single active breakpoint's overrides directly. This is the v1
 * default for themes that don't pin numeric minWidths (it is not a deprecated
 * shim and carries no removal target).
 *
 * When numeric breakpoints are available, performs a mobile-first cumulative
 * cascade per Component Spec §9.3: all breakpoints whose minWidth ≤ the active
 * breakpoint's minWidth are applied in ascending minWidth order, so later
 * breakpoints win over earlier ones for conflicting keys.
 *
 * @param comp             - Component descriptor that may contain a `responsive` map.
 * @param activeBreakpoint - Currently active breakpoint name, or `null` if none match.
 * @param breakpoints      - Optional name→minWidth map used to determine cascade order.
 * @returns A (possibly new) component descriptor with breakpoint overrides applied.
 */
export declare function resolveResponsiveProps(comp: any, activeBreakpoint: string | null, breakpoints?: Record<string, number | string> | null): any;
