import type { SurfaceDiagnostic } from '@formspec-org/surface';
export declare function diagnosticListsEqual(left: readonly SurfaceDiagnostic[], right: readonly SurfaceDiagnostic[]): boolean;
/**
 * Deliver one complete diagnostic list per subscription and semantic change.
 *
 * React replays effects in development StrictMode. The ref intentionally
 * survives that replay, so it represents one logical mounted subscription
 * rather than one effect setup.
 */
export declare function useDiagnosticDelivery(diagnostics: readonly SurfaceDiagnostic[], callback: ((diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined): void;
