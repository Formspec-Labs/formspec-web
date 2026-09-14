/** @filedesc Production-callable AppGraph report producer pipeline. */
import { artifactResolutionGraphInput, resolveArtifacts, resolveBundleExportArtifacts, } from './artifact-resolver.js';
import { moduleResolverInputFromAppGraph, resolveModules, } from './module-resolver.js';
import { validateAppGraph } from './validator.js';
function finishAppGraphValidationReport(request, artifactResolutionReport) {
    const graphInput = artifactResolutionGraphInput(artifactResolutionReport);
    const moduleResolutionReport = resolveModules(moduleResolverInputFromAppGraph({
        manifest: graphInput.manifest,
        handles: graphInput.handles,
        ...(request.hostEvidence ? { hostEvidence: request.hostEvidence } : {}),
        ...(request.moduleAdmission ? { admission: request.moduleAdmission } : {}),
        ...(request.moduleSupport ? { support: request.moduleSupport } : {}),
        ...(request.moduleSource ? { source: request.moduleSource } : {}),
    }));
    const report = validateAppGraph({
        manifest: graphInput.manifest,
        artifacts: graphInput.artifacts,
        artifactResolution: graphInput.artifactResolution,
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
        ...(request.validationOptions ? { options: request.validationOptions } : {}),
    });
    return {
        artifactResolutionReport,
        moduleResolutionReport,
        report,
    };
}
export async function produceAppGraphValidationReport(request) {
    return finishAppGraphValidationReport(request, await resolveArtifacts(request));
}
/**
 * Run the complete resolver, module, schema, and cross-artifact pipeline over a
 * verified inline export before any consumer dereferences typed Surface data.
 */
export async function produceBundleExportAppGraphValidationReport(request) {
    const { documents, ...pipelineRequest } = request;
    const artifactResolutionReport = await resolveBundleExportArtifacts({
        manifest: request.manifest,
        documents,
        ...(request.support ? { support: request.support } : {}),
        ...(request.source ? { source: request.source } : {}),
        ...(request.digest ? { digest: request.digest } : {}),
        ...(request.schemaId ? { schemaId: request.schemaId } : {}),
    });
    return finishAppGraphValidationReport(pipelineRequest, artifactResolutionReport);
}
