export interface RuntimeContext {
    now?: (() => Date | string | number) | Date | string | number;
    locale?: string;
    timeZone?: string;
    seed?: string | number;
    meta?: Record<string, string | number | boolean>;
}
export interface UseRuntimeContextResult {
    /** Set runtime context on the engine. Merges with existing context. */
    setRuntimeContext: (context: RuntimeContext) => void;
}
export declare function useRuntimeContext(): UseRuntimeContextResult;
