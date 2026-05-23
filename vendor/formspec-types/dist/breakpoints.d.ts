/** @filedesc Shared Theme/Component responsive breakpoint namespace helpers. */
export type BreakpointMap = Readonly<Record<string, number>>;
/** Sort a breakpoint map by minWidth ascending. */
export declare function sortBreakpoints(breakpoints?: BreakpointMap | null): Record<string, number> | undefined;
/**
 * Merge the shared breakpoint namespace.
 *
 * Theme breakpoints define canonical values for shared names. Component
 * breakpoints may add names, but they do not override same-name Theme values.
 */
export declare function mergeBreakpointNamespace(theme?: BreakpointMap | null, component?: BreakpointMap | null): Record<string, number> | undefined;
