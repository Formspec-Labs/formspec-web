export interface UseFocusFieldResult {
    /** Focus a field by its bind path. Returns true if found and focused. */
    focusField: (path: string) => boolean;
    /** Ref to attach to the form container for DOM queries. */
    containerRef: React.RefObject<HTMLDivElement | null>;
}
export declare function useFocusField(): UseFocusFieldResult;
/**
 * Focus the field rendered at `path` (its `[data-name]` root) inside `container`, first revealing it:
 * open ancestor `<details>`, activate a hidden tab panel, or navigate a hidden wizard step.
 * Returns true if a focusable control was found and focused.
 */
export declare function focusFieldIn(container: HTMLElement, path: string): boolean;
/**
 * Focus the first rendered field, in page order, carrying an error result on itself or an enclosing
 * group; report order follows binds and shapes, not layout. Falls back to the first error's path.
 * Same rule as formspec-webcomponent `submit/index.ts` firstInvalidFieldPath. O(fields × path depth).
 */
export declare function focusFirstInvalidField(container: HTMLElement, results: ReadonlyArray<{
    path?: string;
    severity?: string;
}>): boolean;
