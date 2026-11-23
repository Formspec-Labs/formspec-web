/** @filedesc Shared AppGraphValidator report kernel. */
import { type AppGraphCrossArtifactValidator, type AppGraphValidationRequest, type ResolvedArtifactHandle } from './types.js';
export declare function artifactHandlesFor(request: AppGraphValidationRequest): ResolvedArtifactHandle[];
export declare function prepareAppGraphValidation(request: AppGraphValidationRequest): {
    canRunCrossArtifactChecks: boolean;
    finish(validators?: AppGraphCrossArtifactValidator[] | undefined): import("./types.js").AppGraphValidationReport;
};
export declare function validateAppGraph(request: AppGraphValidationRequest): import("./types.js").AppGraphValidationReport;
