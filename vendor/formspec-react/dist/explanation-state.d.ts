import type { IFormEngine, ReadonlyEngineSignal } from '@formspec-org/engine';
export type ExplanationState = ReturnType<IFormEngine['getExplanationState']>;
/** How long edits must pause before the explanation state is read again. */
export declare const EXPLANATION_READ_PAUSE_MS = 250;
/**
 * Reading the explanation state costs a Submit evaluation, so a burst of keystrokes is read once, after it
 * pauses. A new engine, an answer (the explanation entries change) or a Submit is read at once. Until the
 * next read, readers see the last one. `null` when no warning Shape asks for an answer.
 */
export declare function useExplanationState(engine: IFormEngine, latestSubmit: ReadonlyEngineSignal<unknown>): ReadonlyEngineSignal<ExplanationState | null>;
