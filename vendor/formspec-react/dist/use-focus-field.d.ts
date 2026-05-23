export interface UseFocusFieldResult {
    /** Focus a field by its bind path. Returns true if found and focused. */
    focusField: (path: string) => boolean;
    /** Ref to attach to the form container for DOM queries. */
    containerRef: React.RefObject<HTMLDivElement | null>;
}
export declare function useFocusField(): UseFocusFieldResult;
