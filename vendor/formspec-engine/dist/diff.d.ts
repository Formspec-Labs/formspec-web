/** @filedesc Diffs batch evaluation snapshots into per-signal patch payloads. */
export interface EvalValidation {
    path: string;
    shapeId?: string;
    [key: string]: unknown;
}
/**
 * Author-facing FEL error from a bind constraint or shape expression (Rust `EvalDiagnostic`); never shown to
 * respondents. Evaluation errors (Core §3.10.2) pass as null; an undefined function (§3.10.1) also fails.
 */
export interface EvalDiagnostic {
    /** Resolved instance path of the bind or shape target (`#` for form-level shapes). */
    path: string;
    expression: string;
    shapeId?: string;
    message: string;
}
export interface EvalResult {
    values: Record<string, unknown>;
    validations: EvalValidation[];
    diagnostics: EvalDiagnostic[];
    nonRelevant: string[];
    variables: Record<string, unknown>;
    required: Record<string, boolean>;
    readonly: Record<string, boolean>;
}
export interface EvalDelta {
    values: Record<string, unknown>;
    removedValues: string[];
    relevant: Record<string, boolean>;
    required: Record<string, boolean>;
    readonly: Record<string, boolean>;
    validations: Record<string, EvalValidation[]>;
    removedValidationPaths: string[];
    shapeResults: Record<string, EvalValidation[]>;
    removedShapeIds: string[];
    variables: Record<string, unknown>;
    removedVariables: string[];
}
export declare function diffEvalResults(previous: EvalResult | null, next: EvalResult): EvalDelta;
