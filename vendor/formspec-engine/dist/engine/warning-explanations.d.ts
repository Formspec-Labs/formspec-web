/** @filedesc Draft warning answers and review groups built from the Rust Submit findings. */
import type { Explanation, GroupedAcknowledgement, InstanceExplanation } from '@formspec-org/types';
import type { EvalResult } from '../diff.js';
type Pending<T> = Omit<T, 'author' | 'recorded'> & {
    author?: never;
    recorded?: never;
};
/** A new answer acquires its author and timestamp when the server saves the draft. */
export type DraftExplanation = Explanation | Pending<InstanceExplanation> | Pending<GroupedAcknowledgement>;
export type ExplanationKey = {
    shapeId: string;
    path: string;
} | {
    code: string;
    partyRef?: string;
};
export type ExplanationFinding = {
    shapeId: string;
    path: string;
    code: string;
    inputs: Record<string, string>;
} & ({
    mode: 'confirm' | 'explain';
    basis: string;
} | {
    mode: 'acknowledge';
    groupBasis: string;
});
export declare function isStamped(entry: DraftExplanation): entry is Explanation;
export declare function stripExplanationStamp(entry: DraftExplanation): DraftExplanation;
export declare function matchesEntry(entry: DraftExplanation, key: ExplanationKey): boolean;
export declare function sameAnswer(entry: DraftExplanation, other: DraftExplanation): boolean;
export declare function warningReview(resultFacts: EvalResult, entries: DraftExplanation[]): {
    findings: ExplanationFinding[];
    groups: {
        code: string;
        basis: string;
        shapeIds: string[];
        paths: string[];
        current: boolean;
        added: string[];
        removed: string[];
    }[];
    instances: {
        current: boolean;
        text: string | undefined;
        message: string;
        shapeId: string;
        path: string;
        code: string;
        inputs: Record<string, string>;
        mode: "confirm" | "explain";
        basis: string;
    }[];
    entries: DraftExplanation[];
    candidateEntries: DraftExplanation[];
    pendingStamps: boolean;
};
export type ExplanationState = ReturnType<typeof warningReview>;
export {};
