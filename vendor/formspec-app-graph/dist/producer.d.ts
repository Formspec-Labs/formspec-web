/** @filedesc Production-callable AppGraph report producer pipeline. */
import type { ArtifactResolutionReport, ModuleResolutionReport } from '@formspec-org/types';
import { type ArtifactResolverRequest } from './artifact-resolver.js';
import { type ModuleResolverAdmissionInput, type ModuleResolverSupportInput } from './module-resolver.js';
import type { AppGraphCrossArtifactValidator, AppGraphDiagnosticReport, AppGraphEvidenceSchemaValidators, AppGraphHostEvidence, AppGraphSchemaValidators, AppGraphValidationOptions, AppGraphValidationReport } from './types.js';
import { type ComponentRouteResolver } from './component-route-resolution.js';
export interface AppGraphReportProducerRequest extends ArtifactResolverRequest {
    hostEvidence?: AppGraphHostEvidence;
    moduleAdmission?: ModuleResolverAdmissionInput;
    moduleSupport?: ModuleResolverSupportInput;
    moduleSource?: string;
    surfaceLocal?: AppGraphDiagnosticReport;
    authorizationBoundary?: AppGraphDiagnosticReport;
    unsupported?: AppGraphDiagnosticReport;
    schemaValidators: AppGraphSchemaValidators;
    evidenceSchemaValidators?: AppGraphEvidenceSchemaValidators;
    crossArtifactValidators?: AppGraphCrossArtifactValidator[];
    validationOptions?: AppGraphValidationOptions;
}
export interface AppGraphReportProducerResult {
    artifactResolutionReport: ArtifactResolutionReport;
    moduleResolutionReport: ModuleResolutionReport;
    report: AppGraphValidationReport;
}
/** In-process result. The resolver is not part of JSON report transport. */
export interface PreparedAppGraphReportProducerResult extends AppGraphReportProducerResult {
    /** Pure selection over an immutable snapshot of this exact validated graph. */
    componentRouteResolver: ComponentRouteResolver;
}
export type BundleExportAppGraphReportProducerRequest = Omit<AppGraphReportProducerRequest, 'loader'> & {
    /**
     * Exact canonical URL to parsed document map from a verified inline export.
     *
     * Only own keys are documents. Values remain unknown until schema and graph
     * validation complete.
     */
    documents: Readonly<Record<string, unknown>>;
};
export declare function produceAppGraphValidationReport(request: AppGraphReportProducerRequest): Promise<PreparedAppGraphReportProducerResult>;
/**
 * Run the complete resolver, module, schema, and cross-artifact pipeline over a
 * verified inline export before any consumer dereferences typed Surface data.
 */
export declare function produceBundleExportAppGraphValidationReport(request: BundleExportAppGraphReportProducerRequest): Promise<PreparedAppGraphReportProducerResult>;
