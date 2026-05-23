/** @filedesc Map WASM/Rust `fel_analysis_to_json_value` error entries to {@link FELAnalysisError}. */
import type { FELAnalysisError } from '../interfaces.js';
/** Raw error element from `fel_analysis_to_json_value` JSON (before normalization). */
export type WasmFelAnalysisErrorWire = string | {
    message: string;
    span?: {
        start: number;
        end: number;
    } | null;
    line?: number;
    column?: number;
    offset?: number;
};
/** 1-based line and column at a Unicode scalar index (matches Rust lexer char indices). */
export declare function lineColumnAtCharOffset(expression: string, charOffset: number): {
    line: number;
    column: number;
};
/**
 * Normalize legacy string errors, `{ message, span }` from Rust, or partially-filled objects.
 */
export declare function normalizeFelAnalysisError(expression: string, e: WasmFelAnalysisErrorWire): FELAnalysisError;
