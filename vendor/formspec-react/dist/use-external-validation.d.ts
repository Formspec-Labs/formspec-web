export interface ExternalValidationEntry {
    path: string;
    severity: string;
    code: string;
    message: string;
    source?: string;
}
export interface UseExternalValidationResult {
    inject: (results: ExternalValidationEntry[]) => void;
    clear: (path?: string) => void;
}
/**
 * Inject or clear server-side validation results on the engine.
 * Use after server-side validation to display errors from external sources.
 */
export declare function useExternalValidation(): UseExternalValidationResult;
