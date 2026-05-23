export interface UseSubmitPendingResult {
    /** Whether a submit is currently in progress. */
    pending: boolean;
    /** Set pending state. */
    setPending: (pending: boolean) => void;
    /** Wrap an async submit handler — sets pending=true before, pending=false after. */
    wrapSubmit: <T>(fn: () => Promise<T>) => Promise<T>;
}
export declare function useSubmitPending(): UseSubmitPendingResult;
