/** @filedesc WASM definition-eval payload, EvalResult merge, and validation merge. */
// --- wasmEvaluateDefinition payload -------------------------------------------------------------
/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export function wasmEvaluateDefinitionPayload(options) {
    const hasResolvedOptions = options.resolvedOptions !== undefined && (Object.keys(options.resolvedOptions.optionSets ?? {}).length > 0
        || Object.keys(options.resolvedOptions.uris ?? {}).length > 0);
    return {
        nowIso: options.nowIso,
        ...(options.trigger !== undefined ? { trigger: options.trigger } : {}),
        previousNonRelevant: options.previousResult?.nonRelevant,
        instances: options.instances,
        registryDocuments: options.registryDocuments,
        ...(hasResolvedOptions ? { resolvedOptions: options.resolvedOptions } : {}),
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
