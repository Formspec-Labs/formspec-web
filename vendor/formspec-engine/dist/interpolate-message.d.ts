/** @filedesc Locale §3.3.1 `{{expression}}` interpolation — thin bridges to the Rust template rules. */
import { type FelExtensionHost, type WasmFelContext } from './wasm-bridge-runtime.js';
export interface InterpolationWarning {
    expression: string;
    error: string;
}
export interface InterpolateResult {
    text: string;
    warnings: InterpolationWarning[];
}
/**
 * Resolve `{{expression}}` sequences with a host evaluator.
 *
 * Rust owns the rules (Locale §3.3.1): `{{{{` escapes, a failed expression stays literal with a
 * warning (a throw, error diagnostics on a {@link FelEvalResult}, or rule 3a's unexplained
 * `null`), results coerce to strings, and replacement text is not re-scanned. `evaluator` returns
 * a value or a `FelEvalResult` envelope. Requires the runtime WASM to be initialized.
 */
export declare function interpolateMessage(template: string, evaluator: (expr: string) => unknown): InterpolateResult;
/** Resolve `{{expression}}` sequences against a FEL context in one WASM call (Locale §3.3.1). */
export declare function interpolateFELTemplate(template: string, context: WasmFelContext, extensions?: FelExtensionHost): InterpolateResult;
