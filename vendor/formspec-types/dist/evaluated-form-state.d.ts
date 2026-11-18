/** @filedesc Plain evaluated field flags and findings shared by the engine and layout. */
import type { ValidationReport } from './generated/validation-report.js';
import type { ValidationResult } from './generated/validation-result.js';
export interface EvaluatedFieldState {
    path: string;
    relevant: boolean;
    readonly: boolean;
    required: boolean;
    empty: boolean;
}
export interface EvaluatedFormState {
    fields: readonly EvaluatedFieldState[];
    /** Null when the host has no evaluated report for these fields. */
    report: ValidationReport | null;
}
/** Finding identity excludes presentation text and other evaluation-dependent details. */
export declare function validationResultIdentity(result: ValidationResult): string;
