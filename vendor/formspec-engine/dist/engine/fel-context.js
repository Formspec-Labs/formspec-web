/** @filedesc Schema and per-evaluation snapshot for the WASM-resident FEL context (ad-hoc reads). */
export function felContextSchema(fieldDataTypes, bindConfigs) {
    const dataTypes = {};
    for (const [path, dataType] of Object.entries(fieldDataTypes)) {
        if (dataType !== undefined) {
            dataTypes[path] = dataType;
        }
    }
    return {
        dataTypes,
        excludedValueNull: Object.entries(bindConfigs)
            .filter(([, bind]) => bind.excludedValue === 'null')
            .map(([path]) => path),
    };
}
/**
 * The whole form's FEL state in one payload, built O(fields + rows) per evaluation. Values stay untagged —
 * the Rust context types leaves from `FelContextSchema.dataTypes` and infers money from `{amount, currency}`.
 */
export function felContextSnapshot(options) {
    const values = {
        ...options.data,
        ...(options.fullResult?.values ?? {}),
    };
    for (const [path, signalRef] of Object.entries(options.fieldSignals)) {
        const value = signalRef.value;
        if (value !== undefined) {
            values[path] = value;
        }
    }
    const mips = { invalid: [], nonRelevant: [], readonly: [], required: [] };
    for (const path of Object.keys(options.fieldSignals)) {
        if (!(options.validationResults[path]?.value ?? []).every((r) => r.severity !== 'error')) {
            mips.invalid.push(path);
        }
        if (options.relevantSignals[path]?.value === false) {
            mips.nonRelevant.push(path);
        }
        if (options.readonlySignals[path]?.value === true) {
            mips.readonly.push(path);
        }
        if (options.requiredSignals[path]?.value === true) {
            mips.required.push(path);
        }
    }
    const repeatCounts = {};
    for (const [path, repeatSignal] of Object.entries(options.repeats)) {
        repeatCounts[path] = repeatSignal.value;
    }
    const variables = {};
    for (const variableDef of options.variableDefs) {
        const scope = variableDef.scope ?? '#';
        (variables[scope] ?? (variables[scope] = {}))[variableDef.name] =
            options.variableSignals[`${scope}:${variableDef.name}`]?.value ?? null;
    }
    return {
        values,
        mips,
        repeatCounts,
        variables,
        instances: options.instanceData,
        locale: options.locale,
        dateFormats: options.dateFormats,
        meta: options.meta,
    };
}
