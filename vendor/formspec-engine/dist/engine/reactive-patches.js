/** @filedesc Apply WASM/diff outputs to `EngineSignal` stores — reactive seam only. */
import { cloneValue, deepEqual, isEmptyValue, normalizeWasmValue, toBasePath, toValidationResults, } from './helpers.js';
export function patchValueSignalsFromWasm(options) {
    for (const [path, sig] of Object.entries(options.signals)) {
        const basePath = toBasePath(path);
        // Native output can omit non-relevant fields. Their editing values still belong to the primary instance.
        if (!Object.prototype.hasOwnProperty.call(options.values, path)) {
            if (!options.calculatedFields.has(basePath)) {
                sig.value = normalizeWasmValue(options.data[path] ?? null);
            }
            continue;
        }
        const value = options.values[path];
        const normalizedValue = normalizeWasmValue(value);
        if (!options.calculatedFields.has(basePath)
            && options.bindConfigs[basePath]?.default !== undefined
            && isEmptyValue(options.data[path])
            && !deepEqual(options.data[path], normalizedValue)) {
            options.data[path] = cloneValue(normalizedValue);
        }
        let rawValue;
        if (!options.calculatedFields.has(basePath)
            && (path in options.data || options.bindConfigs[basePath]?.default === undefined)) {
            rawValue = options.data[path];
        }
        else {
            rawValue = normalizedValue;
        }
        sig.value = normalizeWasmValue(rawValue ?? null);
    }
}
export function patchDeltaSignalsFromWasm(rx, delta, options) {
    var _a, _b, _c, _d, _e;
    for (const [path, relevant] of Object.entries(delta.relevant)) {
        const existing = options.relevantSignals[path];
        if (existing) {
            existing.value = relevant;
        }
        else if (!relevant) {
            // A removed path may leave the non-relevant set. Only create a signal for a false value.
            options.relevantSignals[path] = rx.signal(false);
        }
    }
    for (const [path, required] of Object.entries(delta.required)) {
        (_a = options.requiredSignals)[path] ?? (_a[path] = rx.signal(false));
        options.requiredSignals[path].value = required;
    }
    for (const [path, readonly] of Object.entries(delta.readonly)) {
        (_b = options.readonlySignals)[path] ?? (_b[path] = rx.signal(false));
        options.readonlySignals[path].value = readonly;
    }
    for (const [path, results] of Object.entries(delta.validations)) {
        (_c = options.validationResults)[path] ?? (_c[path] = rx.signal([]));
        options.validationResults[path].value = toValidationResults(results);
    }
    for (const path of delta.removedValidationPaths) {
        if (options.validationResults[path]) {
            options.validationResults[path].value = [];
        }
    }
    for (const [shapeId, results] of Object.entries(delta.shapeResults)) {
        (_d = options.shapeResults)[shapeId] ?? (_d[shapeId] = rx.signal([]));
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
            (_e = options.variableSignals)[key] ?? (_e[key] = rx.signal(undefined));
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
