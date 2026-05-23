/** @filedesc Apply WASM/diff outputs to `EngineSignal` stores — reactive seam only. */
import { cloneValue, deepEqual, isEmptyValue, normalizeWasmValue, toBasePath, toValidationResults, } from './helpers.js';
export function patchValueSignalsFromWasm(options) {
    for (const [path, value] of Object.entries(options.values)) {
        const sig = options.signals[path];
        if (!sig) {
            continue;
        }
        const basePath = toBasePath(path);
        const item = options.fieldItems.get(basePath);
        const normalizedValue = normalizeWasmValue(value);
        const hasExpressionInitial = typeof item?.initialValue === 'string' && item.initialValue.startsWith('=');
        if (!options.calculatedFields.has(basePath)
            && hasExpressionInitial
            && !(path in options.data)) {
            options.data[path] = cloneValue(normalizedValue);
        }
        else if (!options.calculatedFields.has(basePath)
            && options.bindConfigs[basePath]?.default !== undefined
            && path in options.data
            && isEmptyValue(options.data[path])
            && !deepEqual(options.data[path], normalizedValue)) {
            options.data[path] = cloneValue(normalizedValue);
        }
        let rawValue;
        if (!options.calculatedFields.has(basePath) && path in options.data) {
            rawValue = options.data[path];
        }
        else {
            rawValue = normalizedValue;
        }
        sig.value = normalizeWasmValue(rawValue);
    }
}
export function patchDeltaSignalsFromWasm(rx, delta, options) {
    var _a, _b, _c, _d, _e, _f;
    for (const [path, relevant] of Object.entries(delta.relevant)) {
        (_a = options.relevantSignals)[path] ?? (_a[path] = rx.signal(true));
        options.relevantSignals[path].value = relevant;
    }
    for (const [path, required] of Object.entries(delta.required)) {
        (_b = options.requiredSignals)[path] ?? (_b[path] = rx.signal(false));
        options.requiredSignals[path].value = required;
    }
    for (const [path, readonly] of Object.entries(delta.readonly)) {
        (_c = options.readonlySignals)[path] ?? (_c[path] = rx.signal(false));
        options.readonlySignals[path].value = readonly || options.prePopulateReadonly.has(path);
    }
    for (const [path, results] of Object.entries(delta.validations)) {
        (_d = options.validationResults)[path] ?? (_d[path] = rx.signal([]));
        options.validationResults[path].value = toValidationResults(results);
    }
    for (const path of delta.removedValidationPaths) {
        if (options.validationResults[path]) {
            options.validationResults[path].value = [];
        }
    }
    for (const [shapeId, results] of Object.entries(delta.shapeResults)) {
        (_e = options.shapeResults)[shapeId] ?? (_e[shapeId] = rx.signal([]));
        options.shapeResults[shapeId].value = toValidationResults(results);
    }
    for (const shapeId of delta.removedShapeIds) {
        if (options.shapeResults[shapeId]) {
            options.shapeResults[shapeId].value = [];
        }
    }
    for (const [name, value] of Object.entries(delta.variables)) {
        const signalKeys = options.variableSignalKeys.get(name) ?? [name];
        for (const key of signalKeys) {
            (_f = options.variableSignals)[key] ?? (_f[key] = rx.signal(undefined));
            options.variableSignals[key].value = normalizeWasmValue(value);
        }
    }
    for (const name of delta.removedVariables) {
        const signalKeys = options.variableSignalKeys.get(name) ?? [name];
        for (const key of signalKeys) {
            if (options.variableSignals[key]) {
                options.variableSignals[key].value = undefined;
            }
        }
    }
}
export function patchErrorSignalsFromWasm(rx, options) {
    var _a;
    for (const [path, signalRef] of Object.entries(options.validationResults)) {
        const firstError = signalRef.value.find((result) => result.severity === 'error')?.message ?? null;
        (_a = options.errorSignals)[path] ?? (_a[path] = rx.signal(null));
        options.errorSignals[path].value = firstError;
    }
}
