/** @filedesc Framework-agnostic reactive primitives for FormEngine (decoupled from WASM and UI libs). */
/**
 * Writable reactive cell with a single `.value` — implemented by Preact signals or a custom runtime.
 */
export interface EngineSignal<T> {
    get value(): T;
    set value(next: T);
}
/**
 * Read-only reactive cell — the consumer can observe but not mutate.
 * Returned by `computed()` and exposed on FieldViewModel properties.
 */
export interface ReadonlyEngineSignal<T> {
    get value(): T;
}
/**
 * Pluggable batching + signal factory so FormEngine does not import `@preact/signals-core` directly.
 */
export interface EngineReactiveRuntime {
    signal<T>(initial: T): EngineSignal<T>;
    computed<T>(fn: () => T): ReadonlyEngineSignal<T>;
    effect(fn: () => void): () => void;
    batch<T>(fn: () => T): T;
}
