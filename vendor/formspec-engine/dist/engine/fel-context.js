/** @filedesc Schema and per-evaluation snapshot for the WASM-resident FEL context (ad-hoc reads). */
export function felContextSchema(fieldDataTypes, bindConfigs, itemPaths) {
    const dataTypes = {};
    for (const [path, dataType] of Object.entries(fieldDataTypes)) {
        if (dataType !== undefined) {
            dataTypes[path] = dataType;
        }
    }
    return {
        dataTypes,
        itemPaths,
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
    const result = options.fullResult;
    const values = result
        ? { ...result.values, ...result.preservedValues }
        : options.data;
    for (const path of result?.filingOnlyPaths ?? [])
        delete values[path];
    const truePaths = (states) => Object.keys(states ?? {}).filter(path => states?.[path] === true);
    const mips = {
        invalid: (result?.validations ?? [])
            .filter(finding => finding.severity === 'error' && finding.path)
            .map(finding => finding.path),
        nonRelevant: result?.nonRelevant ?? [],
        readonly: truePaths(result?.readonly),
        required: truePaths(result?.required),
    };
    const repeatCounts = {};
    for (const [path, repeatSignal] of Object.entries(options.repeats)) {
        repeatCounts[path] = repeatSignal.value;
    }
    return {
        values,
        mips,
        repeatCounts: options.fullResult?.repeatCounts ?? repeatCounts,
        variables: options.fullResult?.scopedVariables ?? {},
        instances: options.instanceData,
        locale: options.locale,
        dateFormats: options.dateFormats,
        meta: options.meta,
        subjectKeys: options.subjectKeys,
    };
}
