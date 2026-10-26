/** @filedesc WASM definition-eval payload, EvalResult merge, FEL normalization, and scoped variable visibility. */
import { getScopeAncestors, snapshotSignals } from './helpers.js';
import { wasmPrepareFelExpression } from '../wasm-bridge-runtime.js';
/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export function wasmEvaluateDefinitionPayload(options) {
    return {
        nowIso: options.nowIso,
        ...(options.trigger !== undefined ? { trigger: options.trigger } : {}),
        previousValidations: options.previousResult?.validations,
        previousNonRelevant: options.previousResult?.nonRelevant,
        instances: options.instances,
        registryDocuments: options.registryDocuments,
        repeatCounts: options.repeatCounts,
    };
}
/** Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation. */
export function mergeWasmEvalWithExternalValidations(result, options) {
    return {
        ...result,
        validations: [...result.validations, ...options.externalValidations],
    };
}
// --- FEL source normalization (before WASM) ---------------------------------------------------
export function normalizeExpressionForWasmEvaluation(options) {
    const repeatCounts = {};
    for (const [path, sig] of Object.entries(options.repeats)) {
        repeatCounts[path] = sig.value;
    }
    return wasmPrepareFelExpression(JSON.stringify({
        expression: options.expression,
        currentItemPath: options.currentItemPath,
        replaceSelfRef: options.replaceSelfRef,
        repeatCounts,
        valuesByPath: snapshotSignals(options.fieldSignals),
    }));
}
// --- Scoped variable visibility ---------------------------------------------------------------
export function visibleScopedVariableValues(scopePath, variableDefs, variableSignals) {
    const visible = {};
    const candidates = ['#', ...getScopeAncestors(scopePath)];
    for (const scope of candidates) {
        for (const variableDef of variableDefs) {
            if ((variableDef.scope ?? '#') !== scope) {
                continue;
            }
            visible[variableDef.name] = variableSignals[`${scope}:${variableDef.name}`]?.value ?? null;
        }
    }
    return visible;
}
