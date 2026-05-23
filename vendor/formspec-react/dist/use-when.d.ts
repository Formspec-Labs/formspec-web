/**
 * Evaluate a FEL expression reactively and return its boolean result.
 * Used by the renderer for `when` conditional rendering on LayoutNodes.
 */
export declare function useWhen(expression: string, prefix?: string): boolean;
