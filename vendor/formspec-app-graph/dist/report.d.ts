/** @filedesc Deterministic report helpers for AppGraphValidator output. */
import type { ModuleResolutionSourcePointer } from '@formspec-org/types';
import { type AppGraphDiagnostic, type AppGraphEvidenceSchemaResult, type AppGraphPhaseStatus, type AppGraphSchemaResult, type AppGraphSourcePointer, type AppGraphSupportProfile, type AppGraphValidationReport, type ResolvedArtifactHandle } from './types.js';
export declare function compareDiagnostics(left: AppGraphDiagnostic, right: AppGraphDiagnostic): number;
export declare function normalizeDiagnostics(diagnostics?: readonly AppGraphDiagnostic[]): AppGraphDiagnostic[];
export declare function diagnosticSourceForHandle(handle: ResolvedArtifactHandle, jsonPointer?: string): AppGraphSourcePointer;
export declare function appGraphSourceFromModuleSource(source: ModuleResolutionSourcePointer | undefined): AppGraphSourcePointer | undefined;
export declare function artifactIdentityKey(handle: ResolvedArtifactHandle): string;
export interface CreateAppGraphReportInput {
    artifactCount: number;
    loadedArtifactCount: number;
    diagnostics?: AppGraphDiagnostic[];
    schemaResults?: AppGraphSchemaResult[];
    evidenceResults?: AppGraphEvidenceSchemaResult[];
    phases?: AppGraphPhaseStatus[];
    support?: AppGraphSupportProfile;
}
export declare function createAppGraphReport(input: CreateAppGraphReportInput): AppGraphValidationReport;
