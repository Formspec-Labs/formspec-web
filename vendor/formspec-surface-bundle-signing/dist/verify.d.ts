import type { ParsedSurfaceBundleCandidate, SurfaceBundleAdmissionResult, SurfaceBundleAdmitInput, SurfaceBundleVerificationResult, SurfaceBundleVerifyInput } from './types.js';
export declare const SURFACE_BUNDLE_PROFILE: "formspec-surface-bundle-signing-v1";
export declare const SURFACE_BUNDLE_SIGNING_DOMAIN: "formspec.surface-bundle.signed-payload.v1";
export declare class SurfaceBundleProfileError extends Error {
    constructor(message: string);
}
/**
 * Parses one candidate snapshot and returns its recursively frozen signed
 * payload plus copied COSE bytes. Callers cannot supply a pre-parsed object.
 */
export declare function parseSurfaceBundleCandidate(candidateBytes: Uint8Array): ParsedSurfaceBundleCandidate;
/**
 * Constructs `domain || NUL || JCS(payload)` after applying the complete
 * profile-level input checks.
 */
export declare function buildSurfaceBundlePreimage(payload: unknown): Uint8Array;
export declare function verifySurfaceBundleCandidate(input: SurfaceBundleVerifyInput): Promise<SurfaceBundleVerificationResult>;
/**
 * Runs host-owned schema, graph, actor, entry, and dereference checks before
 * the final atomic release commit. It accepts only a verified result issued by
 * this module.
 */
export declare function admitVerifiedSurfaceBundle(input: SurfaceBundleAdmitInput): Promise<SurfaceBundleAdmissionResult>;
