import type { IFormEngine, ReadonlyEngineSignal, SubmitEvaluationSnapshot } from '@formspec-org/engine';
export type ExplanationState = ReturnType<IFormEngine['getExplanationState']>;
/** How long edits must pause before the paused Submit evaluation is read again. */
export declare const EXPLANATION_READ_PAUSE_MS = 250;
export interface PausedSubmitState {
    /** Full Submit-profile snapshot (`evaluated` + `explanations`), or `null` when no Submit-timing Shape or explanation mode is declared. */
    submitEvaluation: ReadonlyEngineSignal<SubmitEvaluationSnapshot | null>;
    /** Explanation state derived from the same Submit evaluation, or `null` when no warning Shape asks for an answer. */
    explanationState: ReadonlyEngineSignal<ExplanationState | null>;
}
/**
 * Reading the Submit profile (for Submit-timing findings and/or warning explanations) costs one Submit
 * evaluation, so a burst of keystrokes is read once, after it pauses. A new engine, an answer (the
 * explanation entries change), an imperative refresh, or a Submit is read at once. Until the next read,
 * readers see the last one. Both signals share one `engine.getSubmitEvaluation()` call so typing never
 * runs Submit evaluations and pauses never run two.
 */
export declare function useSubmitEvaluation(engine: IFormEngine, latestSubmit: ReadonlyEngineSignal<unknown>): PausedSubmitState;
export declare function useExplanationState(engine: IFormEngine, latestSubmit: ReadonlyEngineSignal<unknown>): ReadonlyEngineSignal<ExplanationState | null>;
