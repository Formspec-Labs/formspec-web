/** @filedesc Diffs batch evaluation snapshots into per-signal patch payloads. */
import type { DraftExplanation, ExplanationFinding } from './engine/warning-explanations.js';
import type { EngineBindConfig } from './engine/helpers.js';
export interface EvalValidation {
    path: string;
    shapeId?: string;
    [key: string]: unknown;
}
/**
 * Author-facing diagnostic from Response creation or FEL evaluation.
 */
export interface EvalDiagnostic {
    /** Resolved instance path of the bind or shape target (`#` for form-level shapes). */
    path: string;
    expression: string;
    shapeId?: string;
    /** FEL diagnostic code, such as `FEL_AMBIGUOUS_ROW_LOOKUP`, when the error has one. */
    code?: string;
    message: string;
}
export interface EvalResult {
    refused: boolean;
    values: Record<string, unknown>;
    data: Record<string, unknown>;
    validations: EvalValidation[];
    diagnostics: EvalDiagnostic[];
    explanationFindings?: ExplanationFinding[];
    candidateExplanations?: DraftExplanation[];
    nonRelevant: string[];
    /** Paths that `valid()` reads as invalid in the settled evaluation (Core §3.5.9). */
    invalidPaths: string[];
    variables: Record<string, unknown>;
    scopedVariables?: Record<string, Record<string, unknown>>;
    preservedValues?: Record<string, unknown>;
    filingOnlyPaths?: string[];
    repeatCounts?: Record<string, number>;
    calculatedPaths?: string[];
    indexedBinds?: Record<string, EngineBindConfig>;
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
