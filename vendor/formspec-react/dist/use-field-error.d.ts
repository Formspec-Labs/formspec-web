/**
 * Granular field hook — only re-renders when the field's error state changes.
 * Returns the first error message string, or null if valid.
 */
export declare function useFieldError(path: string): string | null;
