/** @filedesc Registry and Data Source executable-schema and port-name lint. */
import Ajv2020 from 'ajv/dist/2020.js';
import { diagnosticSourceForHandle } from './report.js';
const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateSchema: true,
});
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function loaded(context, artifactKind) {
    return context.handles.filter((handle) => handle.status === 'loaded' && handle.artifactKind === artifactKind);
}
function diagnostic(handle, code, message, pointer, reason, details = {}) {
    return {
        code,
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message,
        primarySource: diagnosticSourceForHandle(handle, pointer),
        details: { reason, ...details },
    };
}
function invalidSchemaDiagnostics(handle, schema, pointer, code, label) {
    const schemaObject = record(schema);
    if (!schemaObject)
        return [];
    if (ajv.validateSchema(schemaObject))
        return [];
    return [diagnostic(handle, code, `${label} is not a valid JSON Schema fragment.`, pointer, 'json-schema-meta-validation-failed', {
            schemaErrors: (ajv.errors ?? []).map((error) => ({
                instancePath: error.instancePath,
                schemaPath: error.schemaPath,
                keyword: error.keyword,
                message: error.message,
            })),
        })];
}
function duplicatePortDiagnostics(handle, ports, pointer, entryName, portKind) {
    if (!Array.isArray(ports))
        return [];
    const byName = new Map();
    ports.forEach((rawPort, index) => {
        const name = record(rawPort)?.name;
        if (typeof name !== 'string')
            return;
        byName.set(name, [...(byName.get(name) ?? []), index]);
    });
    return [...byName.entries()].flatMap(([name, indexes]) => indexes.length < 2
        ? []
        : [diagnostic(handle, 'REG-WIDGET-PORT-NAME-COLLISION', `Registry widget '${entryName}' declares ${portKind} port '${name}' ${indexes.length} times.`, `${pointer}/${indexes[1]}`, 'widget-port-name-collision', { entryName, portKind, portName: name, indexes })]);
}
function widgetDeliveryContractDiagnostics(handle, shape, pointer, entryName) {
    const hasInventory = Object.prototype.hasOwnProperty.call(shape, 'renderedConfigNodes');
    const hasContractId = Object.prototype.hasOwnProperty.call(shape, 'deliveryContractId');
    const diagnostics = [];
    if (hasInventory !== hasContractId) {
        diagnostics.push(diagnostic(handle, 'REG-WIDGET-DELIVERY-CONTRACT-INCOMPLETE', `Registry widget '${entryName}' must declare deliveryContractId and renderedConfigNodes together.`, pointer, 'widget-delivery-contract-incomplete', { entryName, hasDeliveryContractId: hasContractId, hasRenderedConfigNodes: hasInventory }));
    }
    if (!Array.isArray(shape.renderedConfigNodes))
        return diagnostics;
    const byPattern = new Map();
    shape.renderedConfigNodes.forEach((rawNode, index) => {
        const pattern = record(rawNode)?.pointerPattern;
        if (typeof pattern !== 'string')
            return;
        byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), index]);
    });
    for (const [pointerPattern, indexes] of byPattern) {
        if (indexes.length < 2)
            continue;
        diagnostics.push(diagnostic(handle, 'REG-WIDGET-RENDERED-NODE-PATTERN-COLLISION', `Registry widget '${entryName}' declares rendered config pointer pattern '${pointerPattern}' ${indexes.length} times.`, `${pointer}/renderedConfigNodes/${indexes[1]}`, 'rendered-config-pointer-pattern-collision', { entryName, pointerPattern, indexes }));
    }
    return diagnostics;
}
function validateRegistries(context) {
    return loaded(context, 'registry').flatMap((handle) => {
        const entries = record(handle.document)?.entries;
        if (!Array.isArray(entries))
            return [];
        return entries.flatMap((rawEntry, entryIndex) => {
            const entry = record(rawEntry);
            const shape = record(entry?.widgetShape);
            if (!entry || !shape)
                return [];
            const name = typeof entry.name === 'string' ? entry.name : `entries[${entryIndex}]`;
            const pointer = `/entries/${entryIndex}/widgetShape`;
            return [
                ...invalidSchemaDiagnostics(handle, shape.props, `${pointer}/props`, 'REG-WIDGET-PROPS-SCHEMA-INVALID', `Registry widget '${name}' props`),
                ...duplicatePortDiagnostics(handle, shape.dataInputs, `${pointer}/dataInputs`, name, 'data input'),
                ...duplicatePortDiagnostics(handle, shape.actionOutputs, `${pointer}/actionOutputs`, name, 'action output'),
                ...widgetDeliveryContractDiagnostics(handle, shape, pointer, name),
            ];
        });
    });
}
function validateDataSourceSchemas(context) {
    return loaded(context, 'dataSources').flatMap((handle) => {
        const sources = record(handle.document)?.sources;
        if (!Array.isArray(sources))
            return [];
        return sources.flatMap((rawSource, sourceIndex) => {
            const source = record(rawSource);
            if (!source || source.schema === undefined)
                return [];
            const id = typeof source.id === 'string' ? source.id : `sources[${sourceIndex}]`;
            return invalidSchemaDiagnostics(handle, source.schema, `/sources/${sourceIndex}/schema`, 'DATA-SOURCE-PAYLOAD-SCHEMA-INVALID', `Data Source '${id}' payload schema`);
        });
    });
}
export function validateExecutableSchemaContracts(context) {
    return [
        ...validateRegistries(context),
        ...validateDataSourceSchemas(context),
    ];
}
