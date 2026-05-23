export interface UseFieldValueResult {
    value: any;
    setValue(value: any): void;
}
/**
 * Granular field hook — only re-renders when the field's value changes.
 * Use this when you don't need label/error/required state.
 */
export declare function useFieldValue(path: string): UseFieldValueResult;
