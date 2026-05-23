import type { ReadonlyEngineSignal } from '@formspec-org/engine';
/**
 * Subscribe to a Preact `ReadonlyEngineSignal` from React.
 *
 * Uses `useSyncExternalStore` for tear-free reads.
 * The `effect()` from `@preact/signals-core` auto-tracks signal
 * dependencies, so the React callback fires exactly when the
 * signal's value changes.
 */
export declare function useSignal<T>(signal: ReadonlyEngineSignal<T>): T;
