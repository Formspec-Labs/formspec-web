/** @filedesc Shared AppGraphValidator report kernel. */
import { APP_GRAPH_PHASES, } from './types.js';
import { appGraphSourceFromModuleSource, compareDiagnostics, createAppGraphReport, diagnosticSourceForHandle, normalizeDiagnostics, } from './report.js';
import { validateComponentRouteTargets } from './component-routes.js';
import { validateComponentGraphContexts } from './component-graph-context.js';
import { validateAppEntry } from './app-entry.js';
import { validateDataSources } from './data-sources.js';
import { validateExperienceActionRefs } from './experience-action-refs.js';
import { validateLocaleAssociations } from './locale-associations.js';
import { validateNeedsCoverage } from './needs-coverage.js';
import { validateScreenerSurfaceTargets } from './screener-surface-targets.js';
import { validateSurfaceDefinitionSlots } from './surface-definition-slots.js';
import { validateSurfaceExperienceUnits } from './surface-experience-units.js';
import { validateSurfaceResponseActionTriggers } from './surface-response-action-triggers.js';
import { validateSurfaceWidgetActions } from './surface-widget-actions.js';
import { validateThemeTokenRegistry } from './theme-token-registry.js';
import { validateUiGraphPolicy } from './ui-graph-policy.js';
const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';
const COMPONENT_GRAPH_CONTEXT_SCHEMA_ID = 'https://formspec.org/schemas/componentGraphProjectionContext/0.1';
const NEEDS_SCHEMA_ID = 'https://formspec.org/schemas/needs/1.0';
const EVIDENCE_SCHEMA_ID = {
    uiGraphPolicy: UI_GRAPH_POLICY_SCHEMA_ID,
    componentGraphContext: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
    needsDocument: NEEDS_SCHEMA_ID,
};
const EVIDENCE_LABEL = {
    uiGraphPolicy: 'UI Graph Policy',
    componentGraphContext: 'Component graph context',
    needsDocument: 'Needs Document',
};
export function artifactHandlesFor(request) {
    const siblings = Object.values(request.artifacts ?? {}).flatMap((handles) => handles ?? []);
    return [request.manifest, ...siblings];
}
function schemaValidatorFor(request, handle) {
    const validators = request.schemaValidators;
    if (!validators)
        return undefined;
    if (typeof validators === 'function')
        return validators;
    return ((handle.schemaId ? validators[handle.schemaId] : undefined)
        ?? validators[handle.artifactKind]
        ?? validators['*']);
}
function schemaIssueDiagnostic(handle, issue) {
    const suffix = issue.keyword ? ` [${issue.keyword}]` : '';
    return {
        code: issue.code ?? 'APP-GRAPH-SCHEMA',
        severity: issue.severity ?? 'error',
        phase: 'schema',
        origin: 'schema-validator',
        message: `${handle.artifactKind}${suffix}: ${issue.message}`,
        primarySource: diagnosticSourceForHandle(handle, issue.path ?? ''),
        details: issue.details ? { ...issue.details } : undefined,
    };
}
function evidenceIssueDiagnostic(evidence, issue) {
    const suffix = issue.keyword ? ` [${issue.keyword}]` : '';
    return {
        code: issue.code ?? 'APP-GRAPH-SCHEMA',
        severity: issue.severity ?? 'error',
        phase: 'schema',
        origin: 'schema-validator',
        message: `${evidence.evidenceSlot}${suffix}: ${issue.message}`,
        primarySource: {
            artifactSlot: evidence.evidenceSlot,
            source: evidence.source,
            jsonPointer: issue.path ?? '',
        },
        details: issue.details ? { ...issue.details } : undefined,
    };
}
function evidenceDiagnosticSource(evidence, jsonPointer = '') {
    return {
        artifactSlot: evidence.evidenceSlot,
        source: evidence.source,
        jsonPointer,
    };
}
function evidenceSchemaDiagnostic(evidence, diagnostic) {
    return {
        code: diagnostic.code,
        severity: diagnostic.severity,
        phase: 'schema',
        origin: 'schema-validator',
        message: diagnostic.message,
        primarySource: evidenceDiagnosticSource(evidence, diagnostic.primarySource?.jsonPointer ?? ''),
        details: diagnostic.details ? { ...diagnostic.details } : undefined,
    };
}
function normalizeEvidenceDiagnostics(diagnostics) {
    return diagnostics
        .map((diagnostic) => ({
        ...diagnostic,
        primarySource: diagnostic.primarySource ? { ...diagnostic.primarySource } : undefined,
        details: diagnostic.details ? { ...diagnostic.details } : undefined,
    }))
        .sort(compareDiagnostics);
}
function normalizeSchemaOutcome(handle, outcome) {
    const diagnostics = normalizeDiagnostics([
        ...(outcome.diagnostics ?? []).map((diagnostic) => ({
            ...diagnostic,
            phase: diagnostic.phase ?? 'schema',
            origin: diagnostic.origin ?? 'schema-validator',
            primarySource: diagnostic.primarySource ?? diagnosticSourceForHandle(handle),
        })),
        ...(outcome.issues ?? []).map((issue) => schemaIssueDiagnostic(handle, issue)),
    ]);
    return {
        slot: handle.slot,
        artifactKind: handle.artifactKind,
        schemaId: handle.schemaId,
        status: 'completed',
        ok: outcome.ok && diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
        diagnostics,
    };
}
function normalizeEvidenceSchemaOutcome(evidence, outcome) {
    const diagnostics = normalizeEvidenceDiagnostics([
        ...(outcome.diagnostics ?? []).map((diagnostic) => evidenceSchemaDiagnostic(evidence, diagnostic)),
        ...(outcome.issues ?? []).map((issue) => evidenceIssueDiagnostic(evidence, issue)),
    ]);
    return {
        evidenceSlot: evidence.evidenceSlot,
        schemaId: evidence.schemaId,
        source: evidence.source,
        status: 'completed',
        ok: outcome.ok && diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
        diagnostics,
    };
}
function schemaNotRunResult(handle, reason) {
    return {
        slot: handle.slot,
        artifactKind: handle.artifactKind,
        schemaId: handle.schemaId,
        status: 'not-run',
        reason,
        ok: true,
        diagnostics: [],
    };
}
function evidenceSchemaNotRunResult(evidence, reason) {
    return {
        evidenceSlot: evidence.evidenceSlot,
        schemaId: evidence.schemaId,
        source: evidence.source,
        status: 'not-run',
        reason,
        ok: true,
        diagnostics: [],
    };
}
function schemaResultsFor(request, handles) {
    return handles
        .filter((handle) => handle.status === 'loaded')
        .map((handle) => {
        if (handle.document === undefined) {
            return schemaNotRunResult(handle, 'missing-document');
        }
        const validate = schemaValidatorFor(request, handle);
        if (!validate) {
            return schemaNotRunResult(handle, 'missing-schema-validator');
        }
        return normalizeSchemaOutcome(handle, validate({
            handle,
            document: handle.document,
            artifactKind: handle.artifactKind,
            schemaId: handle.schemaId,
        }));
    });
}
function uiGraphPolicyEvidence(request) {
    return (request.hostEvidence?.uiGraphPolicies ?? []).map((evidence, index) => ({
        evidenceSlot: `hostEvidence.uiGraphPolicies[${index}]`,
        evidenceKind: 'uiGraphPolicy',
        schemaId: evidence.schemaId,
        source: evidence.source,
        document: evidence.document,
    }));
}
function componentGraphContextEvidence(request) {
    return (request.hostEvidence?.componentGraphContexts ?? []).map((evidence, index) => ({
        evidenceSlot: `hostEvidence.componentGraphContexts[${index}]`,
        evidenceKind: 'componentGraphContext',
        schemaId: evidence.schemaId,
        source: evidence.source,
        document: evidence.document,
    }));
}
function needsDocumentEvidence(request) {
    return (request.hostEvidence?.needsDocuments ?? []).map((evidence, index) => ({
        evidenceSlot: `hostEvidence.needsDocuments[${index}]`,
        evidenceKind: 'needsDocument',
        schemaId: evidence.schemaId,
        source: evidence.source,
        document: evidence.document,
    }));
}
function hostEvidenceFor(request) {
    return [
        ...uiGraphPolicyEvidence(request),
        ...componentGraphContextEvidence(request),
        ...needsDocumentEvidence(request),
    ];
}
function schemaValidatorForEvidence(request, evidence) {
    const validators = request.evidenceSchemaValidators;
    if (!validators)
        return undefined;
    if (typeof validators === 'function')
        return validators;
    return validators[evidence.schemaId] ?? validators[evidence.evidenceKind] ?? validators['*'];
}
function evidenceResultsFor(request) {
    return hostEvidenceFor(request).map((evidence) => {
        if (evidence.document === undefined) {
            return evidenceSchemaNotRunResult(evidence, 'missing-document');
        }
        const expectedSchemaId = EVIDENCE_SCHEMA_ID[evidence.evidenceKind];
        const label = EVIDENCE_LABEL[evidence.evidenceKind];
        if (evidence.schemaId !== expectedSchemaId) {
            return normalizeEvidenceSchemaOutcome(evidence, {
                ok: false,
                issues: [{
                        code: 'APP-GRAPH-EVIDENCE-SCHEMA-ID',
                        keyword: 'const',
                        path: '/schemaId',
                        message: `${label} host evidence must use schemaId '${expectedSchemaId}'.`,
                    }],
            });
        }
        const validate = schemaValidatorForEvidence(request, evidence);
        if (!validate) {
            return evidenceSchemaNotRunResult(evidence, 'missing-schema-validator');
        }
        return normalizeEvidenceSchemaOutcome(evidence, validate(evidence));
    });
}
function runCrossArtifactValidators(validators, request, handles, schemaResults, evidenceResults) {
    const allValidators = [
        validateAppEntry,
        validateComponentRouteTargets,
        validateComponentGraphContexts,
        validateDataSources,
        validateExperienceActionRefs,
        validateLocaleAssociations,
        validateNeedsCoverage,
        validateScreenerSurfaceTargets,
        validateSurfaceDefinitionSlots,
        validateSurfaceExperienceUnits,
        validateSurfaceResponseActionTriggers,
        validateSurfaceWidgetActions,
        validateThemeTokenRegistry,
        validateUiGraphPolicy,
        ...(validators ?? []),
    ];
    return allValidators.flatMap((validator) => validator({
        manifest: request.manifest,
        handles: [...handles],
        schemaResults: [...schemaResults],
        evidenceResults: [...evidenceResults],
        hostEvidence: request.hostEvidence,
        moduleResolution: request.moduleResolution,
    }));
}
function moduleResolutionDiagnostic(diagnostic) {
    const relatedSources = diagnostic.relatedSources
        ?.map((source) => appGraphSourceFromModuleSource(source))
        .filter((source) => source !== undefined);
    return {
        code: diagnostic.code,
        severity: diagnostic.severity,
        phase: diagnostic.phase,
        origin: diagnostic.origin,
        message: diagnostic.message,
        primarySource: appGraphSourceFromModuleSource(diagnostic.primarySource),
        relatedSources,
        details: diagnostic.details ? { ...diagnostic.details } : undefined,
    };
}
function importedDiagnostics(request, handles) {
    return [
        ...(request.artifactResolution?.diagnostics ?? []),
        ...(request.moduleResolution?.diagnostics ?? []).map(moduleResolutionDiagnostic),
        ...(request.surfaceLocal?.diagnostics ?? []),
        ...handles.flatMap((handle) => handle.diagnostics ?? []),
    ];
}
function phaseStatus(phase, status, reason) {
    return reason ? { phase, status, reason } : { phase, status };
}
function phaseStatuses(request, schemaStatus, crossArtifactStatus) {
    const statuses = new Map();
    for (const phase of APP_GRAPH_PHASES) {
        statuses.set(phase, phaseStatus(phase, 'not-run'));
    }
    statuses.set('artifact-resolution', phaseStatus('artifact-resolution', request.artifactResolution ? 'completed' : 'not-run'));
    statuses.set('module-resolution', request.moduleResolution
        ? phaseStatus('module-resolution', request.moduleResolution.phase.status, request.moduleResolution.phase.reason)
        : phaseStatus('module-resolution', 'not-run'));
    statuses.set('surface-local', phaseStatus('surface-local', request.surfaceLocal ? 'completed' : 'not-run'));
    statuses.set('schema', schemaStatus);
    statuses.set('cross-artifact', crossArtifactStatus);
    return [...statuses.values()];
}
function schemaPhaseStatus(results) {
    if (results.length === 0) {
        return phaseStatus('schema', 'not-run', 'no-loaded-artifacts');
    }
    if (results.some((result) => result.reason === 'missing-document')) {
        return phaseStatus('schema', 'skipped', 'missing-documents');
    }
    if (results.some((result) => result.status !== 'completed')) {
        return phaseStatus('schema', 'skipped', 'missing-schema-validators');
    }
    return phaseStatus('schema', 'completed');
}
export function validateAppGraph(request) {
    const handles = artifactHandlesFor(request);
    const loadedArtifactCount = handles.filter((handle) => handle.status === 'loaded').length;
    const unresolved = handles.filter((handle) => handle.status !== 'loaded');
    const schemaResults = schemaResultsFor(request, handles);
    const evidenceResults = evidenceResultsFor(request);
    const schemaAndEvidenceResults = [...schemaResults, ...evidenceResults];
    const schemaFailures = schemaAndEvidenceResults.some((result) => !result.ok);
    const schemaNotRun = schemaAndEvidenceResults.some((result) => result.status !== 'completed');
    const schemaStatus = schemaPhaseStatus(schemaAndEvidenceResults);
    let crossArtifactStatus;
    let crossDiagnostics = [];
    if (unresolved.length > 0) {
        crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', 'unresolved-artifacts');
    }
    else if (schemaFailures) {
        crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', 'schema-errors');
    }
    else if (schemaNotRun) {
        crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', schemaStatus.reason ?? 'schema-not-run');
    }
    else {
        crossArtifactStatus = phaseStatus('cross-artifact', 'completed');
        crossDiagnostics = runCrossArtifactValidators(request.crossArtifactValidators, request, handles, schemaResults, evidenceResults);
    }
    const diagnostics = normalizeDiagnostics([
        ...importedDiagnostics(request, handles),
        ...schemaResults.flatMap((result) => result.diagnostics),
        ...evidenceResults.flatMap((result) => result.diagnostics),
        ...crossDiagnostics,
    ]);
    return createAppGraphReport({
        artifactCount: handles.length,
        loadedArtifactCount,
        diagnostics,
        schemaResults,
        evidenceResults,
        phases: phaseStatuses(request, schemaStatus, crossArtifactStatus),
        support: request.options?.support,
    });
}
