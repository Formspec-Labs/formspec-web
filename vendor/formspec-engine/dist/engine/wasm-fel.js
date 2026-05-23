/** @filedesc WASM definition-eval payload, EvalResult shaping, FEL normalization, and WasmFelContext assembly. */
import { buildGroupSnapshotForPath, buildRepeatCollection, cloneValue, getRepeatAncestors, getScopeAncestors, parentPathOf, setExpressionContextValue, snapshotSignals, tagMoneyByPath, toBasePath, toFelIndexedPath, toWasmContextValue, } from './helpers.js';
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
// --- WasmFelContext from engine signals -------------------------------------------------------
export function resolveFelFieldValueForWasm(path, value, bindConfigs, fieldIsIrrelevant) {
    const bind = bindConfigs[toBasePath(path)];
    if (bind?.excludedValue === 'null' && fieldIsIrrelevant(path)) {
        return null;
    }
    return value;
}
export function visibleScopedVariableValues(scopePath, variableDefs, variableSignals, overrides) {
    const visible = {};
    const candidates = ['#', ...getScopeAncestors(scopePath)];
    for (const scope of candidates) {
        for (const variableDef of variableDefs) {
            if ((variableDef.scope ?? '#') !== scope) {
                continue;
            }
            const key = `${variableDef.scope ?? '#'}:${variableDef.name}`;
            visible[variableDef.name] = overrides && Object.prototype.hasOwnProperty.call(overrides, key)
                ? overrides[key]
                : (variableSignals[key]?.value ?? null);
        }
    }
    return visible;
}
export function buildFelRepeatWasmContext(options) {
    const repeatAncestors = getRepeatAncestors(options.currentItemPath, options.repeats);
    if (repeatAncestors.length === 0) {
        return undefined;
    }
    let parent;
    for (const entry of repeatAncestors) {
        const collection = buildRepeatCollection(entry.groupPath, entry.count, options.fieldSignals);
        parent = {
            current: collection[entry.index] ?? null,
            index: entry.index + 1,
            count: entry.count,
            collection,
            parent,
        };
    }
    const outerParentPath = parentPathOf(repeatAncestors[repeatAncestors.length - 1].groupPath);
    if (parent && outerParentPath) {
        parent.parent = {
            current: buildGroupSnapshotForPath(outerParentPath, options.fieldSignals),
            index: 1,
            count: 1,
            collection: [buildGroupSnapshotForPath(outerParentPath, options.fieldSignals)],
            parent: parent.parent,
        };
    }
    return parent;
}
function tagMoneyVariableValue(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
    if (value.$type === 'money')
        return value;
    if ('amount' in value && 'currency' in value) {
        return { $type: 'money', amount: value.amount, currency: value.currency };
    }
    return value;
}
export function buildWasmFelExpressionContext(options) {
    const result = options.resultOverride ?? options.fullResult;
    const rawFields = {
        ...(options.dataOverride ?? options.data),
        ...(result?.values ?? {}),
        ...snapshotSignals(options.fieldSignals),
    };
    const irrelevant = (path) => options.relevantSignals[path]?.value === false;
    const fields = {};
    for (const [path, value] of Object.entries(rawFields)) {
        setExpressionContextValue(fields, path, toWasmContextValue(tagMoneyByPath(path, resolveFelFieldValueForWasm(path, value, options.bindConfigs, irrelevant), options.bindConfigs, options.fieldDataTypes)));
    }
    const scopePath = parentPathOf(options.currentItemPath);
    if (scopePath) {
        const prefixA = `${scopePath}.`;
        const prefixB = `${scopePath}[`;
        for (const [path, value] of Object.entries(rawFields)) {
            if (path.startsWith(prefixA)) {
                setExpressionContextValue(fields, path.slice(prefixA.length), toWasmContextValue(tagMoneyByPath(path, value, options.bindConfigs, options.fieldDataTypes)));
            }
            else if (path.startsWith(prefixB)) {
                setExpressionContextValue(fields, path.slice(scopePath.length + 1), toWasmContextValue(tagMoneyByPath(path, value, options.bindConfigs, options.fieldDataTypes)));
            }
        }
    }
    const mipStates = {};
    for (const path of Object.keys(options.fieldSignals)) {
        const state = {
            valid: (options.validationResults[path]?.value ?? []).every((r) => r.severity !== 'error'),
            relevant: options.relevantSignals[path]?.value ?? true,
            readonly: options.readonlySignals[path]?.value ?? false,
            required: options.requiredSignals[path]?.value ?? false,
        };
        if (path.includes('[')) {
            mipStates[toFelIndexedPath(path)] = { ...state };
        }
        else {
            mipStates[path] = state;
        }
        if (scopePath) {
            const prefixA = `${scopePath}.`;
            const prefixB = `${scopePath}[`;
            if (path.startsWith(prefixA)) {
                mipStates[path.slice(prefixA.length)] = { ...state };
            }
            else if (path.startsWith(prefixB)) {
                mipStates[path.slice(scopePath.length + 1)] = { ...state };
            }
        }
    }
    return {
        fields,
        variables: Object.fromEntries(Object.entries(visibleScopedVariableValues(options.currentItemPath, options.variableDefs, options.variableSignals, options.scopedVariableOverrides)).map(([key, value]) => [key, toWasmContextValue(tagMoneyVariableValue(value))])),
        mipStates,
        repeatContext: buildFelRepeatWasmContext({
            currentItemPath: options.currentItemPath,
            repeats: options.repeats,
            fieldSignals: options.fieldSignals,
        }),
        instances: cloneValue(options.instanceData),
        nowIso: options.nowIso,
        locale: options.locale,
        meta: options.meta,
    };
}
