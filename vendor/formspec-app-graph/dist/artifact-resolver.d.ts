/** @filedesc Shared ArtifactResolver kernel for App Manifest sibling refs. */
import type { ArtifactResolutionDiagnostic, ArtifactResolutionHandleStatus, ArtifactResolutionIdentity, ArtifactResolutionRef, ArtifactResolutionReport } from '@formspec-org/types';
import type { AppGraphDiagnosticReport, AppGraphValidationRequest, ResolvedArtifactHandle } from './types.js';
export interface ArtifactResolverSupportProfile {
    bundleVersions?: string[];
    artifactKinds?: string[];
    uriSchemes?: string[];
}
export interface ArtifactLoaderInput {
    slot: string;
    ref: ArtifactResolutionRef;
    artifactKind: string;
    support: ArtifactResolverSupportProfile;
}
export interface ArtifactLoaderDiagnosticInput {
    code: string;
    severity?: ArtifactResolutionDiagnostic['severity'];
    message: string;
    primarySource?: ArtifactResolutionDiagnostic['primarySource'];
    relatedSources?: ArtifactResolutionDiagnostic['relatedSources'];
    details?: Record<string, unknown>;
}
export interface ArtifactLoaderOutcome {
    status: ArtifactResolutionHandleStatus;
    document?: unknown;
    schemaId?: string;
    identity?: ArtifactResolutionIdentity;
    source?: string;
    digest?: string;
    diagnostics?: ArtifactLoaderDiagnosticInput[];
}
export type ArtifactLoader = (input: ArtifactLoaderInput) => ArtifactLoaderOutcome | Promise<ArtifactLoaderOutcome>;
export interface ArtifactResolverRequest {
    manifest: unknown;
    loader: ArtifactLoader;
    support?: ArtifactResolverSupportProfile;
    source?: string;
    digest?: string;
    schemaId?: string;
}
/**
 * An exported bundle whose sibling documents are already present in memory.
 *
 * This is the validating counterpart to renderer-specific typed
 * dereferencing. Documents stay `unknown`; the ArtifactResolver owns evidence
 * about what was loaded, not application-level casts.
 */
export interface BundleExportArtifactResolverRequest extends Omit<ArtifactResolverRequest, 'loader'> {
    documents: Readonly<Record<string, unknown>>;
}
export interface ArtifactResolutionGraphInput {
    manifest: ResolvedArtifactHandle;
    handles: ResolvedArtifactHandle[];
    artifacts: NonNullable<AppGraphValidationRequest['artifacts']>;
    artifactResolution: AppGraphDiagnosticReport;
}
/** App Manifest `$formspecBundle` versions, oldest first (App Manifest spec §2.2). */
export declare const APP_MANIFEST_VERSIONS: readonly ["2.0", "2.1", "2.2", "2.3", "2.4", "2.5"];
export type AppManifestVersion = typeof APP_MANIFEST_VERSIONS[number];
/**
 * Whether `version` is a known App Manifest version at or after `minimum`.
 * Each 2.x minor is additive, so a rule introduced in one minor holds in every later one.
 */
export declare function appManifestVersionAtLeast(version: unknown, minimum: AppManifestVersion): boolean;
export declare function artifactResolutionGraphInput(report: ArtifactResolutionReport): ArtifactResolutionGraphInput;
export declare function resolveArtifacts(request: ArtifactResolverRequest): Promise<ArtifactResolutionReport>;
/**
 * Validate an inline bundle export through the same ArtifactResolver path as
 * externally loaded artifacts.
 *
 * Only exact own keys count as bundled documents. Prototype properties are not
 * bundle contents and must never satisfy a manifest reference.
 */
export declare function resolveBundleExportArtifacts(request: BundleExportArtifactResolverRequest): Promise<ArtifactResolutionReport>;
