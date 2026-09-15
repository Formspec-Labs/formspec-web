/** @filedesc Locale §3.3.1 `{{expression}}` interpolation — thin bridges to the Rust template rules. */
import { wasmInterpolateFELTemplate, wasmInterpolateTemplate, } from './wasm-bridge-runtime.js';
/**
 * Resolve `{{expression}}` sequences with a host evaluator.
 *
 * Rust owns the rules (Locale §3.3.1): `{{{{` escapes, a failed expression stays literal with a
 * warning (a throw, error diagnostics on a {@link FelEvalResult}, or rule 3a's unexplained
 * `null`), results coerce to strings, and replacement text is not re-scanned. `evaluator` returns
 * a value or a `FelEvalResult` envelope. Requires the runtime WASM to be initialized.
 */
export function interpolateMessage(template, evaluator) {
    if (!template || !template.includes('{{'))
        return { text: template, warnings: [] };
    return toInterpolateResult(wasmInterpolateTemplate(template, (expression) => JSON.stringify(toEnvelope(evaluator(expression)))));
}
/** Resolve `{{expression}}` sequences against a FEL context in one WASM call (Locale §3.3.1). */
export function interpolateFELTemplate(template, context, extensions) {
    if (!template || !template.includes('{{'))
        return { text: template, warnings: [] };
    return toInterpolateResult(wasmInterpolateFELTemplate(template, context, extensions));
}
function toEnvelope(outcome) {
    if (outcome !== null &&
        typeof outcome === 'object' &&
        'value' in outcome &&
        'hasErrorDiagnostics' in outcome) {
        const envelope = outcome;
        return { value: envelope.value ?? null, hasErrorDiagnostics: envelope.hasErrorDiagnostics };
    }
    return { value: outcome ?? null, hasErrorDiagnostics: false };
}
function toInterpolateResult(result) {
    return {
        text: result.text,
        warnings: result.warnings.map((warning) => ({ expression: warning.expression, error: warning.message })),
    };
}
