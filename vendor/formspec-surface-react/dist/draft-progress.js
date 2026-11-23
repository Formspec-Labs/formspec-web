import { declaresWarningFollowUps, summarizeFormProgress, } from '@formspec-org/layout';
const NO_WARNING_ANSWERS = Object.freeze({ instances: [], groups: [] });
/**
 * Both reads see the same answers and explanation entries, but they are separate Submit evaluations
 * unless the engine's explanation state is already cached for this edit, so the second may read a later
 * clock. A Definition whose warnings ask for no answer has an empty state, so it costs no evaluation.
 */
export function readSubmitEvaluation(engine) {
    return {
        evaluated: engine.getEvaluatedFormState({ profile: 'on-submit' }),
        explanations: declaresWarningFollowUps(engine.getDefinition()) ? engine.getExplanationState() : NO_WARNING_ANSWERS,
    };
}
export function summarizeDraftProgress(sections, { evaluated, explanations }) {
    return summarizeFormProgress(sections, evaluated, explanations);
}
