/** @filedesc Deterministic report helpers for AppGraphValidator output. */
import { APP_GRAPH_PHASES, } from './types.js';
const SEVERITY_RANK = {
    error: 0,
    warning: 1,
    info: 2,
};
const PHASE_RANK = Object.fromEntries(APP_GRAPH_PHASES.map((phase, index) => [phase, index]));
function stringValue(value) {
    return typeof value === 'string' ? value : '';
}
function sourceKey(source) {
    if (!source)
        return '';
    return [
        stringValue(source.artifactSlot),
        stringValue(source.artifactKind),
        stringValue(source.jsonPointer),
        stringValue(source.ref?.url),
        stringValue(source.ref?.version),
        stringValue(source.source),
    ].join('\u0000');
}
export function compareDiagnostics(left, right) {
    return (SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
        || PHASE_RANK[left.phase] - PHASE_RANK[right.phase]
        || sourceKey(left.primarySource).localeCompare(sourceKey(right.primarySource))
        || left.code.localeCompare(right.code)
        || left.message.localeCompare(right.message));
}
export function normalizeDiagnostics(diagnostics = []) {
    return diagnostics
        .map((diagnostic) => ({
        ...diagnostic,
        primarySource: diagnostic.primarySource ? { ...diagnostic.primarySource } : undefined,
        relatedSources: diagnostic.relatedSources
            ? [...diagnostic.relatedSources].map((source) => ({ ...source })).sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)))
            : undefined,
        details: diagnostic.details ? { ...diagnostic.details } : undefined,
    }))
        .sort(compareDiagnostics);
}
export function diagnosticSourceForHandle(handle, jsonPointer = '') {
    return {
        artifactSlot: handle.slot,
        artifactKind: handle.artifactKind,
        source: handle.source,
        jsonPointer,
        ref: handle.ref ? { ...handle.ref } : undefined,
    };
}
export function appGraphSourceFromModuleSource(source) {
    if (!source)
        return undefined;
    const isHostEvidence = source.artifactSlot.startsWith('hostEvidence.');
    const pointer = {
        artifactSlot: source.artifactSlot,
        source: source.source,
        jsonPointer: source.jsonPointer,
    };
    if (!isHostEvidence) {
        pointer.artifactKind = source.artifactKind;
        if (source.ref)
            pointer.ref = { ...source.ref };
    }
    return pointer;
}
export function artifactIdentityKey(handle) {
    const version = handle.ref?.version ?? handle.identity?.version;
    const refIdentity = handle.ref?.url;
    const documentUrl = handle.identity?.url;
    const documentId = handle.artifactKind === 'surface' ? undefined : handle.identity?.id;
    const identity = refIdentity ?? documentUrl ?? documentId ?? handle.slot;
    return version ? `${handle.artifactKind}:${identity}@${version}` : `${handle.artifactKind}:${identity}`;
}
function countDiagnostics(diagnostics, severity) {
    return diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
}
function isNativeDiagnosticOrigin(origin) {
    return origin === 'app-graph-validator'
        || origin === 'schema-validator'
        || origin === 'ui-graph-policy';
}
export function createAppGraphReport(input) {
    const diagnostics = normalizeDiagnostics(input.diagnostics);
    const schemaResults = [...(input.schemaResults ?? [])].sort((left, right) => left.slot.localeCompare(right.slot) || left.artifactKind.localeCompare(right.artifactKind));
    const evidenceResults = [...(input.evidenceResults ?? [])].sort((left, right) => left.evidenceSlot.localeCompare(right.evidenceSlot));
    const phases = [...(input.phases ?? [])].sort((left, right) => PHASE_RANK[left.phase] - PHASE_RANK[right.phase]);
    const summary = {
        artifacts: input.artifactCount,
        loadedArtifacts: input.loadedArtifactCount,
        schemaFailures: [
            ...schemaResults,
            ...evidenceResults,
        ].filter((result) => result.status === 'completed' && !result.ok).length,
        unvalidatedArtifacts: schemaResults.filter((result) => result.status !== 'completed').length,
        graphErrors: diagnostics.filter((diagnostic) => diagnostic.phase === 'cross-artifact' && diagnostic.severity === 'error').length,
        errors: countDiagnostics(diagnostics, 'error'),
        warnings: countDiagnostics(diagnostics, 'warning'),
        infos: countDiagnostics(diagnostics, 'info'),
        importedDiagnostics: diagnostics.filter((diagnostic) => !isNativeDiagnosticOrigin(diagnostic.origin)).length,
        unsupportedFeatures: diagnostics.filter((diagnostic) => diagnostic.phase === 'unsupported').length,
        skippedPhases: phases.filter((phase) => phase.status === 'skipped').length,
    };
    return {
        ok: summary.errors === 0,
        summary,
        schemaResults,
        evidenceResults,
        diagnostics,
        phases,
        support: input.support ? { ...input.support } : undefined,
    };
}
