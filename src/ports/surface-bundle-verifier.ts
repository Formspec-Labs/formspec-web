import type {
  HostAdmissionCheckResult,
  PublisherTrustPolicy,
  SurfaceBundleFailedResult,
  SurfaceBundleReleasePolicy,
  SurfaceBundleSignedPayloadV1,
  SurfaceBundleUnverifiedResult,
  SurfaceBundleVerifiedResult as UpstreamVerifiedResult,
  TrustPolicyEvidence,
  ReleasePolicyEvidence,
  VerificationReceipt,
} from '@formspec-org/surface-bundle-signing';
import type {
  SurfaceBundleSnapshot,
  SurfaceBundleSourceEvidence,
} from './surface-bundle-source.ts';

export type SurfaceBundleVerifierErrorCode =
  | 'unavailable'
  | 'invalid-snapshot'
  | 'invalid-precondition'
  | 'internal';

export class SurfaceBundleVerifierError extends Error {
  constructor(
    public readonly code: SurfaceBundleVerifierErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SurfaceBundleVerifierError';
  }
}

export interface SurfaceBundleVerificationProvenance {
  readonly adapterId: string;
  readonly snapshotIdentity: string;
  readonly source: SurfaceBundleSourceEvidence;
  readonly checkedAt?: string;
  readonly signedPayloadDigest?: string;
  readonly integrityReceipt?: VerificationReceipt;
  readonly trust?: TrustPolicyEvidence;
  readonly release?: ReleasePolicyEvidence;
}

export interface SurfaceBundleVerifiedProvenance
  extends SurfaceBundleVerificationProvenance {
  readonly checkedAt: string;
  readonly signedPayloadDigest: string;
  readonly integrityReceipt: VerificationReceipt;
  readonly trust: TrustPolicyEvidence;
  readonly release: ReleasePolicyEvidence;
}

declare const releasePreconditionBrand: unique symbol;

/** Opaque capability returned only for an authenticated, current candidate. */
export interface SurfaceBundleReleasePrecondition {
  readonly [releasePreconditionBrand]: true;
}

export interface SurfaceBundleVerifiedResult {
  readonly status: 'verified';
  readonly snapshotIdentity: string;
  readonly payload: SurfaceBundleSignedPayloadV1;
  readonly provenance: SurfaceBundleVerifiedProvenance;
  readonly releasePrecondition: SurfaceBundleReleasePrecondition;
}

export interface SurfaceBundleFailedVerificationResult {
  readonly status: 'failed';
  readonly code: SurfaceBundleFailedResult['code'];
  readonly reason: string;
  readonly snapshotIdentity: string;
  readonly provenance: SurfaceBundleVerificationProvenance;
}

export interface SurfaceBundleUnverifiedVerificationResult {
  readonly status: 'unverified';
  readonly code: SurfaceBundleUnverifiedResult['code'];
  readonly reason: string;
  readonly snapshotIdentity: string;
  readonly provenance: SurfaceBundleVerificationProvenance;
}

export type SurfaceBundleVerificationResult =
  | SurfaceBundleVerifiedResult
  | SurfaceBundleFailedVerificationResult
  | SurfaceBundleUnverifiedVerificationResult;

export interface SurfaceBundleHostValidationPassed {
  readonly status: 'passed';
}

export type SurfaceBundleReleaseCommitResult =
  | {
      readonly status: 'committed';
      readonly releaseCommit: 'not-required' | 'committed' | 'already-current';
      readonly snapshotIdentity: string;
    }
  | {
      readonly status: 'refused';
      readonly code: string;
      readonly reason: string;
      readonly snapshotIdentity: string;
    }
  | {
      readonly status: 'unavailable';
      readonly code: string;
      readonly reason: string;
      readonly snapshotIdentity: string;
    };

export interface SurfaceBundleReleaseCommitRequest {
  readonly snapshot: SurfaceBundleSnapshot;
  readonly precondition: SurfaceBundleReleasePrecondition;
  /**
   * The host supplies this only after schema, AppGraph, actor, and entry
   * checks pass against the same snapshot.
   */
  readonly hostValidation: SurfaceBundleHostValidationPassed;
}

export interface SurfaceBundleVerifier {
  verify(snapshot: SurfaceBundleSnapshot): Promise<SurfaceBundleVerificationResult>;
  commitRelease(
    request: SurfaceBundleReleaseCommitRequest,
  ): Promise<SurfaceBundleReleaseCommitResult>;
}

export interface SurfaceBundleDeploymentVerificationConfig {
  /** Exact app identity this deployment is willing to run. */
  readonly expectedAppId: string;
  readonly trustPolicy: PublisherTrustPolicy;
  readonly releasePolicy: SurfaceBundleReleasePolicy;
}

/** Internal adapter binding retained here to keep the public result opaque. */
export interface SurfaceBundleReleaseBinding {
  readonly verification: UpstreamVerifiedResult;
  readonly snapshotIdentity: string;
}

export type SurfaceBundleHostCheckResult = HostAdmissionCheckResult;
