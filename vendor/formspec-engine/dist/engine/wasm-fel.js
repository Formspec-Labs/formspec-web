/** @filedesc WASM definition-eval payload, EvalResult merge, and validation merge. */
// --- wasmEvaluateDefinition payload -------------------------------------------------------------
/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export function wasmEvaluateDefinitionPayload(options) {
    return {
        nowIso: options.nowIso,
        ...(options.trigger !== undefined ? { trigger: options.trigger } : {}),
        previousNonRelevant: options.previousResult?.nonRelevant,
        instances: options.instances,
        registryDocuments: options.registryDocuments,
        subjectType: options.subjectType,
        subjectKeys: options.subjectKeys,
        explanations: options.explanations,
    };
}
/** Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation. */
export function mergeWasmEvalWithExternalValidations(result, options) {
    return {
        ...result,
        validations: [...result.validations, ...options.externalValidations],
    };
}
