import { summarizeFormProgress, } from '@formspec-org/layout';
/**
 * Reads the Submit-profile evaluated state and matching explanation state from a single Submit
 * evaluation (`engine.getSubmitEvaluation()`), avoiding a second Submit evaluation and clock skew.
 * Falls back to separate reads only for minimal test doubles without `getSubmitEvaluation`.
 */
export function readSubmitEvaluation(engine) {
    if (typeof engine.getSubmitEvaluation === 'function') {
        return engine.getSubmitEvaluation();
    }
    return {
        evaluated: engine.getEvaluatedFormState({ profile: 'on-submit' }),
        explanations: engine.getExplanationState(),
    };
}
export function summarizeDraftProgress(sections, { evaluated, explanations }) {
    return summarizeFormProgress(sections, evaluated, explanations);
}
