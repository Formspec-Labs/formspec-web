/** @filedesc Shared AppGraphValidator report kernel. */
import { type AppGraphValidationRequest, type ResolvedArtifactHandle } from './types.js';
export declare function artifactHandlesFor(request: AppGraphValidationRequest): ResolvedArtifactHandle[];
export declare function validateAppGraph(request: AppGraphValidationRequest): import("./types.js").AppGraphValidationReport;
