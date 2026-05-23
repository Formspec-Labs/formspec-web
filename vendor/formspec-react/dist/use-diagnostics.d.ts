import type { ValidationProfile } from '@formspec-org/types';
export interface UseDiagnosticsResult {
    /** Capture a snapshot of the current form state. */
    getSnapshot: (options?: {
        profile?: ValidationProfile;
    }) => any;
}
export declare function useDiagnostics(): UseDiagnosticsResult;
