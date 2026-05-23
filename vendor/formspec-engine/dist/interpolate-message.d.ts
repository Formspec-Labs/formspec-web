/** @filedesc Template string interpolator for locale {{expr}} sequences (spec §3.3.1). */
export interface InterpolationWarning {
    expression: string;
    error: string;
}
export interface InterpolateResult {
    text: string;
    warnings: InterpolationWarning[];
}
/**
 * Resolve `{{expr}}` sequences in a locale string.
 *
 * Rules (§3.3.1):
 * 1. `{{{{` → literal `{{` (escape before scanning)
 * 2. Failed parse/eval → preserve literal `{{expr}}` + warning.
 *    Includes any eval where WASM records error-severity diagnostics (side-channel check).
 * 3–4. Coerce values; `null` → "" except rule 3a (no `$`/`@` and not a static literal → preserve)
 * 5. Replacement text is NOT re-scanned for `{{`
 *
 * @param template - String potentially containing `{{expr}}` placeholders
 * @param evaluator - Evaluates a FEL expression string, returns a value
 */
export declare function interpolateMessage(template: string, evaluator: (expr: string) => unknown): InterpolateResult;
