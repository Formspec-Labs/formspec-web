/** @filedesc Native Screener presentation admission and result-only route selection. */
import type { ScreenerDocument, DeterminationRecord, FormItem } from '@formspec-org/types';
export interface ScreenerDocumentHandle {
    ref: {
        url: string;
        version?: string;
    };
    document: ScreenerDocument;
}
export type ScreenerAdmission = {
    status: 'ready';
} | {
    status: 'unavailable';
    reason: string;
};
/** This bounded presenter does not approximate unsupported native item/bind semantics. */
export declare function admitScreenerPresentation(document: ScreenerDocument): ScreenerAdmission;
export declare function screenerAnswerMatches(item: FormItem, value: unknown): boolean;
export interface ScreenerDeterminationInput {
    document: ScreenerDocument;
    allowedTargets: readonly string[];
    determination: DeterminationRecord;
    answers: Readonly<Record<string, unknown>>;
    /** Timestamp passed to this exact synchronous evaluation invocation. */
    evaluationTime: string;
    /** Fresh acceptance time, never derived from the result itself. */
    nowIso: string;
}
export type ScreenerDeterminationResult = {
    status: 'ready';
    target: string;
} | {
    status: 'refused';
    reason: string;
};
export declare function resolveScreenerDetermination(input: ScreenerDeterminationInput): ScreenerDeterminationResult;
