/** @filedesc Diffs batch evaluation snapshots into per-signal patch payloads. */
export interface EvalValidation {
    path: string;
    shapeId?: string;
    [key: string]: unknown;
}
export interface EvalResult {
    values: Record<string, unknown>;
    validations: EvalValidation[];
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
