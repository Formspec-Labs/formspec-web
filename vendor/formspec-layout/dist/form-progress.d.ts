/** @filedesc Counts the live evaluated instances, findings and owed warning follow-ups once for progress consumers. */
import { type EvaluatedFormState, type FormDefinition, type ValidationResult } from '@formspec-org/types';
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
    /** Unexplained warnings plus owed follow-ups. */
    toCheck: number | null;
    /** Owed warning explanations and group acknowledgements; each is also one of `toCheck`. */
    followUps: number;
    valid: number | null;
    required: number;
    requiredFilled: number;
}
/**
 * One warning answer the respondent still owes (Core §5.3.1): an instance explanation or a group
 * acknowledgement that is missing or stale. A group is answered once for the whole form, so it has no section.
 */
export type ProgressFollowUp = {
    sectionId?: string;
    formLevel: boolean;
} & FollowUpBody;
type FollowUpBody = {
    kind: 'instance';
    shapeId: string;
    path: string;
} | {
    kind: 'group';
    code: string;
    paths: readonly string[];
};
export interface ProgressFinding {
    identity: string;
    sectionId?: string;
    /** Whether this finding has no place in the rendered form. */
    formLevel: boolean;
    /** True when the respondent has recorded a current explanation or group acknowledgement for this warning. */
    explained?: boolean;
    /** True when this finding represents a blank required field (`constraintKind === 'required'`). */
    missingRequired?: boolean;
    /** True when this blank required finding has not yet been touched/submitted and is deferred from `toFix`. */
    untouchedRequired?: boolean;
    result: ValidationResult;
}
export interface SummarizeFormProgressOptions {
    /**
     * Paths whose blank-required errors have been surfaced (e.g. individually touched by the user,
     * or `'all'` after submit/check). When omitted, blank-required errors stay in `counts.missing`
     * and are tagged `untouchedRequired: true` instead of incrementing `toFix`.
     */
    surfacedRequiredPaths?: ReadonlySet<string> | 'all';
}
/** The engine's explanation state (`IFormEngine.getExplanationState()`): every Submit warning that asks for an answer. */
export interface ExplanationStateLike {
    instances: readonly {
        shapeId: string;
        path: string;
        current: boolean;
    }[];
    /** A group covers the firings it names; another Shape's warning that shares the code is not covered. */
    groups: readonly {
        code: string;
        shapeIds: readonly string[];
        paths: readonly string[];
        current: boolean;
    }[];
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
    /** Results counted by their own severity. Explanation errors and paired warnings are in `followUps`. */
    findings: ProgressFinding[];
    followUps: ProgressFollowUp[];
}
/** Whether a warning Shape asks for an answer (Core §5.2.1), which only the explanation state reports outside Submit. */
export declare function declaresWarningFollowUps({ shapes, warningExplanation }: Pick<FormDefinition, 'shapes' | 'warningExplanation'>): boolean;
/**
 * Count one evaluation for progress. `explanationState` is the engine's explanation state, or `null` where
 * no warning asks for an answer: without it an answered follow-up is counted again as its warnings.
 */
export declare function summarizeFormProgress(sectionPlan: readonly PageSequenceEntry[], state: EvaluatedFormState, explanationState: ExplanationStateLike | null, options?: SummarizeFormProgressOptions): FormProgressSummary;
export declare function pageProgressIssue(counts: ProgressCounts): 'required' | 'unavailable' | 'invalid' | 'empty' | 'blocked-readonly' | undefined;
export interface ProgressFindingRow extends ValidationSummaryRow {
    sectionId?: string;
    code?: string;
    explained?: boolean;
    missingRequired?: boolean;
    untouchedRequired?: boolean;
    /** The concrete report path, including for findings without a rendered owner. */
    resultPath: string;
    /** Set on the row for an owed follow-up. A host may link a group to the control that answers it. */
    followUp?: ProgressFollowUp;
}
export declare function readFormProgressFindingRows(summary: FormProgressSummary, source: Pick<ValidationSummarySource, 'message' | 'field' | 'jumpable' | 'chrome'>): ProgressFindingRow[];
/** One row per owed follow-up, worded like a finding row; `message` words the warning or the group. */
export declare function readFormProgressFollowUpRows(summary: FormProgressSummary, source: Pick<ValidationSummarySource, 'field' | 'jumpable' | 'chrome'> & {
    message(followUp: ProgressFollowUp): string;
}): ProgressFindingRow[];
export {};
