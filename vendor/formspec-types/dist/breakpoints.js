/** @filedesc Shared Theme/Component responsive breakpoint namespace helpers. */
/** Sort a breakpoint map by minWidth ascending. */
export function sortBreakpoints(breakpoints) {
    const entries = Object.entries(breakpoints ?? {});
    if (entries.length === 0)
        return undefined;
    entries.sort(([leftName, leftWidth], [rightName, rightWidth]) => {
        const widthOrder = leftWidth - rightWidth;
        return widthOrder === 0 ? leftName.localeCompare(rightName) : widthOrder;
    });
    return Object.fromEntries(entries);
}
/**
 * Merge the shared breakpoint namespace.
 *
 * Theme breakpoints define canonical values for shared names. Component
 * breakpoints may add names, but they do not override same-name Theme values.
 */
export function mergeBreakpointNamespace(theme, component) {
    const merged = { ...(theme ?? {}) };
    for (const [name, minWidth] of Object.entries(component ?? {})) {
        if (!Object.prototype.hasOwnProperty.call(merged, name)) {
            merged[name] = minWidth;
        }
    }
    return sortBreakpoints(merged);
}
