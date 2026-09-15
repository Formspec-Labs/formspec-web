/** @filedesc WASM definition-eval payload, EvalResult shaping, FEL normalization, and WasmFelContext assembly. */
import { appendPath, buildGroupSnapshotForPath, buildRepeatCollection, cloneValue, getRepeatAncestors, getScopeAncestors, parentPathOf, setExpressionContextValue, snapshotSignals, splitIndexedPath, tagFelValueByPath, toBasePath, toFelIndexedPath, toWasmContextValue, } from './helpers.js';
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
    const cache = options.cache ?? { collections: new Map(), groupSnapshots: new Map() };
    let parent;
    for (const entry of repeatAncestors) {
        const collectionKey = `${entry.groupPath}#${entry.count}`;
        let collection = cache.collections.get(collectionKey);
        if (!collection) {
            collection = buildRepeatCollection(entry.groupPath, entry.count, options.fieldSignals, options.fieldDataTypes);
            cache.collections.set(collectionKey, collection);
        }
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
        let outer = cache.groupSnapshots.get(outerParentPath);
        if (!outer) {
            outer = buildGroupSnapshotForPath(outerParentPath, options.fieldSignals, options.fieldDataTypes);
            cache.groupSnapshots.set(outerParentPath, outer);
        }
        parent.parent = {
            current: outer,
            index: 1,
            count: 1,
            collection: [outer],
            parent: parent.parent,
        };
    }
    return parent;
}
/**
 * Lexical scopes enclosing `currentItemPath`, outermost first (Core §3.2.1). A group or repeat-row path
 * (`jobs[0]`, `jobs[0].address`) is its own innermost scope, so a component `when` on a row sees the row's
 * fields as `$sibling`; a field path's innermost scope is its parent, matching Rust bind evaluation.
 */
export function lexicalScopeChain(currentItemPath, fieldDataTypes) {
    if (!currentItemPath) {
        return [];
    }
    const isField = Object.prototype.hasOwnProperty.call(fieldDataTypes, toBasePath(currentItemPath));
    const innermost = isField ? parentPathOf(currentItemPath) : currentItemPath;
    const chain = [];
    let current = '';
    for (const segment of splitIndexedPath(innermost)) {
        current = current ? appendPath(current, segment) : segment;
        chain.push(current);
    }
    return chain;
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
function buildWasmFelContextBase(options) {
    const result = options.resultOverride ?? options.fullResult;
    const rawFields = {
        ...(options.dataOverride ?? options.data),
        ...(result?.values ?? {}),
        ...snapshotSignals(options.fieldSignals),
    };
    const irrelevant = (path) => options.relevantSignals[path]?.value === false;
    const fields = {};
    for (const [path, value] of Object.entries(rawFields)) {
        setExpressionContextValue(fields, path, toWasmContextValue(tagFelValueByPath(path, resolveFelFieldValueForWasm(path, value, options.bindConfigs, irrelevant), options.fieldDataTypes)));
    }
    const mipStates = {};
    const mipStatesByPath = new Map();
    for (const path of Object.keys(options.fieldSignals)) {
        const state = {
            valid: (options.validationResults[path]?.value ?? []).every((r) => r.severity !== 'error'),
            relevant: options.relevantSignals[path]?.value ?? true,
            readonly: options.readonlySignals[path]?.value ?? false,
            required: options.requiredSignals[path]?.value ?? false,
        };
        mipStates[path.includes('[') ? toFelIndexedPath(path) : path] = state;
        mipStatesByPath.set(path, state);
    }
    return {
        rawFields,
        fields,
        mipStates,
        mipStatesByPath,
        repeatCache: { collections: new Map(), groupSnapshots: new Map() },
        instances: cloneValue(options.instanceData),
    };
}
/**
 * One-shot FEL context for `currentItemPath`: the form-scope base plus each enclosing lexical scope's names,
 * outermost first so the nearest scope shadows (Core §3.2.1). O(fields × scope depth), so it serves the
 * in-flight evaluation reads that must see partial state. Ad-hoc reads go through the WASM-resident
 * `FelContext` handle instead (`FormEngine.felContext`).
 */
export function buildWasmFelExpressionContext(options) {
    const base = buildWasmFelContextBase(options);
    const scopes = lexicalScopeChain(options.currentItemPath, options.fieldDataTypes);
    let fields = base.fields;
    let mipStates = base.mipStates;
    if (scopes.length > 0) {
        const scopedFields = {};
        const scopedMipStates = {};
        for (const scope of scopes) {
            const prefix = `${scope}.`;
            const level = {};
            for (const [path, value] of Object.entries(base.rawFields)) {
                if (path.startsWith(prefix)) {
                    setExpressionContextValue(level, path.slice(prefix.length), toWasmContextValue(tagFelValueByPath(path, value, options.fieldDataTypes)));
                }
            }
            Object.assign(scopedFields, level);
            for (const [path, state] of base.mipStatesByPath) {
                if (path.startsWith(prefix)) {
                    scopedMipStates[path.slice(prefix.length)] = state;
                }
            }
        }
        fields = { ...base.fields, ...scopedFields };
        mipStates = { ...base.mipStates, ...scopedMipStates };
    }
    return {
        fields,
        variables: Object.fromEntries(Object.entries(visibleScopedVariableValues(options.currentItemPath, options.variableDefs, options.variableSignals, options.scopedVariableOverrides)).map(([key, value]) => [key, toWasmContextValue(tagMoneyVariableValue(value))])),
        mipStates,
        repeatContext: buildFelRepeatWasmContext({
            currentItemPath: options.currentItemPath,
            repeats: options.repeats,
            fieldSignals: options.fieldSignals,
            fieldDataTypes: options.fieldDataTypes,
            cache: base.repeatCache,
        }),
        instances: base.instances,
        nowIso: options.nowIso,
        locale: options.locale,
        dateFormats: options.dateFormats,
        meta: options.meta,
    };
}
