/** @filedesc Production-callable AppGraph report producer pipeline. */
import { artifactResolutionGraphInput, resolveArtifacts, resolveBundleExportArtifacts, } from './artifact-resolver.js';
import { moduleResolverInputFromAppGraph, resolveModules, snapshotModulePayloadSchemaResources, } from './module-resolver.js';
import { validateAppGraph } from './validator.js';
import { prepareComponentRouteResolver } from './component-route-resolution.js';
function finishAppGraphValidationReport(request, artifactResolutionReport, manifestDiagnostics = []) {
    const graphInput = artifactResolutionGraphInput(artifactResolutionReport);
    const moduleResolutionReport = resolveModules(moduleResolverInputFromAppGraph({
        manifest: graphInput.manifest,
        handles: graphInput.handles,
        ...(request.hostEvidence ? { hostEvidence: request.hostEvidence } : {}),
        ...(request.moduleAdmission ? { admission: request.moduleAdmission } : {}),
        ...(request.moduleSupport ? { support: request.moduleSupport } : {}),
        ...(request.moduleSource ? { source: request.moduleSource } : {}),
    }));
    const validationRequest = {
        manifest: graphInput.manifest,
        artifacts: graphInput.artifacts,
        artifactResolution: manifestDiagnostics.length === 0
            ? graphInput.artifactResolution
            : { diagnostics: [...(graphInput.artifactResolution.diagnostics ?? []), ...manifestDiagnostics] },
        ...(request.hostEvidence ? { hostEvidence: request.hostEvidence } : {}),
        moduleResolution: moduleResolutionReport,
        ...(request.surfaceLocal ? { surfaceLocal: request.surfaceLocal } : {}),
        ...(request.authorizationBoundary
            ? { authorizationBoundary: request.authorizationBoundary }
            : {}),
        ...(request.unsupported ? { unsupported: request.unsupported } : {}),
        schemaValidators: request.schemaValidators,
        ...(request.evidenceSchemaValidators ? { evidenceSchemaValidators: request.evidenceSchemaValidators } : {}),
        ...(request.crossArtifactValidators ? { crossArtifactValidators: request.crossArtifactValidators } : {}),
        ...(request.hostWidgetContracts ? { hostWidgetContracts: request.hostWidgetContracts } : {}),
        ...(request.renderedNeedTrace ? { renderedNeedTrace: request.renderedNeedTrace } : {}),
        ...(request.validationOptions ? { options: request.validationOptions } : {}),
    };
    const report = validateAppGraph(validationRequest);
    return {
        artifactResolutionReport,
        moduleResolutionReport,
        report,
        componentRouteResolver: prepareComponentRouteResolver(validationRequest, report),
    };
}
export async function produceAppGraphValidationReport(request) {
    const prepared = { ...request, moduleSupport: snapshotModulePayloadSchemaResources(request.moduleSupport) };
    return finishAppGraphValidationReport(prepared, await resolveArtifacts(prepared));
}
/**
 * Run the complete resolver, module, schema, and cross-artifact pipeline over a
 * verified inline export before any consumer dereferences typed Surface data.
 */
export async function produceBundleExportAppGraphValidationReport(request) {
    const { documents, ...pipelineRequest } = {
        ...request,
        moduleSupport: snapshotModulePayloadSchemaResources(request.moduleSupport),
    };
    const declaredNeeds = manifestNeedsEvidence(request.manifest, documents);
    if (declaredNeeds.evidence) {
        pipelineRequest.hostEvidence = {
            ...pipelineRequest.hostEvidence,
            needsDocuments: [...(pipelineRequest.hostEvidence?.needsDocuments ?? []), declaredNeeds.evidence],
        };
    }
    const artifactResolutionReport = await resolveBundleExportArtifacts({
        manifest: request.manifest,
        documents,
        ...(request.support ? { support: request.support } : {}),
        ...(request.source ? { source: request.source } : {}),
        ...(request.digest ? { digest: request.digest } : {}),
        ...(request.schemaId ? { schemaId: request.schemaId } : {}),
    });
    return finishAppGraphValidationReport(pipelineRequest, artifactResolutionReport, declaredNeeds.diagnostic ? [declaredNeeds.diagnostic] : []);
}
const NEEDS_SCHEMA_ID = 'https://formspec.org/schemas/needs/1.0';
/**
 * The App Manifest's optional `needs` member (App Manifest §3.2, Needs §2.1) is
 * an explicit pairing: the declared document joins the Needs host evidence, so
 * coverage and the rendered-Need trace read it like a caller's pairing. A
 * declared document the bundle does not carry, or one of another kind or
 * version, is refused rather than silently unpaired.
 */
function manifestNeedsEvidence(manifest, documents) {
    const ref = manifest?.needs;
    if (ref === undefined)
        return {};
    const url = typeof ref?.url === 'string' ? ref.url : undefined;
    const document = url !== undefined && Object.prototype.hasOwnProperty.call(documents, url)
        ? documents[url]
        : undefined;
    const reason = document === undefined
        ? 'needs-document-missing'
        : document?.$formspecNeeds !== '1.0'
            ? 'needs-document-kind'
            : ref.version !== undefined && document.version !== ref.version
                ? 'needs-document-version'
                : undefined;
    if (reason) {
        return {
            diagnostic: {
                code: 'APP-GRAPH-NEEDS-REF',
                severity: 'error',
                phase: 'artifact-resolution',
                origin: 'app-graph-validator',
                message: `App Manifest needs '${url ?? '<no url>'}' does not resolve to a Needs 1.0 document of the declared version in this bundle.`,
                primarySource: { artifactSlot: 'manifest', artifactKind: 'manifest', jsonPointer: '/needs' },
                details: { reason, url, version: ref.version },
            },
        };
    }
    return { evidence: { schemaId: NEEDS_SCHEMA_ID, source: url, document } };
}
