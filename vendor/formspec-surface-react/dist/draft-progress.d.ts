/** @filedesc Read a draft's Submit-profile evaluation with its explanation state and summarize it for trackers. */
import type { IFormEngine } from '@formspec-org/engine';
import { type ExplanationStateLike, type FormProgressSummary, type PageSequenceEntry } from '@formspec-org/layout';
import type { EvaluatedFormState } from '@formspec-org/types';
/** What a tracker summary needs from the engine, read while it is alive. */
export interface SubmitEvaluation {
    evaluated: EvaluatedFormState;
    explanations: ExplanationStateLike;
}
/**
 * Both reads see the same answers and explanation entries, but they are separate Submit evaluations
 * unless the engine's explanation state is already cached for this edit, so the second may read a later
 * clock. A Definition whose warnings ask for no answer has an empty state, so it costs no evaluation.
 */
export declare function readSubmitEvaluation(engine: Pick<IFormEngine, 'getDefinition' | 'getEvaluatedFormState' | 'getExplanationState'>): SubmitEvaluation;
export declare function summarizeDraftProgress(sections: readonly PageSequenceEntry[], { evaluated, explanations }: SubmitEvaluation): FormProgressSummary;
