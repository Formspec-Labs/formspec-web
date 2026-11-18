/** @filedesc Counts the live evaluated instances and findings once for form progress consumers. */
import { type EvaluatedFormState, type ValidationResult } from '@formspec-org/types';
import { type PageSequenceEntry } from './page-sequence.js';
import { type ValidationSummaryRow, type ValidationSummarySource } from './validation-summary.js';
export interface ProgressCounts {
    total: number;
    filled: number;
    prefilled: number;
    missing: number;
    missingReadonly: number;
    /** Null when validation was unavailable for this snapshot. */
    toFix: number | null;
    toCheck: number | null;
    valid: number | null;
    required: number;
    requiredFilled: number;
}
export interface ProgressFinding {
    identity: string;
    sectionId?: string;
    /** Whether this finding has no place in the rendered form. */
    formLevel: boolean;
    result: ValidationResult;
}
export interface FormProgressSummary {
    form: ProgressCounts & {
        ready: boolean | null;
    };
    sections: Array<{
        id?: string;
        counts: ProgressCounts;
        filled: boolean;
    }>;
    findings: ProgressFinding[];
}
/** Attach unkeyed fragments to adjacent identified sections without changing their order. */
export declare function workspaceSections(plan: readonly PageSequenceEntry[]): PageSequenceEntry[];
export declare function summarizeFormProgress(sectionPlan: readonly PageSequenceEntry[], state: EvaluatedFormState): FormProgressSummary;
export declare function pageProgressIssue(counts: ProgressCounts): 'required' | 'unavailable' | 'invalid' | 'empty' | 'blocked-readonly' | undefined;
export interface ProgressFindingRow extends ValidationSummaryRow {
    sectionId?: string;
    code?: string;
    /** The concrete report path, including for findings without a rendered owner. */
    resultPath: string;
}
export declare function readFormProgressFindingRows(summary: FormProgressSummary, source: Pick<ValidationSummarySource, 'message' | 'field' | 'jumpable' | 'chrome'>): ProgressFindingRow[];
