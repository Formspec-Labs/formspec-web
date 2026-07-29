import {
  admitVerifiedSurfaceBundle,
  verifySurfaceBundleCandidate,
  type KeyResolver,
  type PublisherTrustPolicy,
  type SignatureMethodRegistry,
  type SurfaceBundleReleasePolicy,
  type SurfaceBundleVerifiedResult as UpstreamVerifiedResult,
} from '@formspec-org/surface-bundle-signing';
import { WebCryptoVerifier } from '@integrity-stack/signature-adapter-webcrypto';
import type {
  SurfaceBundleFailedVerificationResult,
  SurfaceBundleReleaseBinding,
  SurfaceBundleReleaseCommitRequest,
  SurfaceBundleReleaseCommitResult,
  SurfaceBundleReleasePrecondition,
  SurfaceBundleUnverifiedVerificationResult,
  SurfaceBundleVerificationProvenance,
  SurfaceBundleVerificationResult,
  SurfaceBundleVerifiedProvenance,
  SurfaceBundleVerifiedResult,
  SurfaceBundleVerifier,
} from '../../ports/surface-bundle-verifier.ts';
import { SurfaceBundleVerifierError } from '../../ports/surface-bundle-verifier.ts';
import type { SurfaceBundleSnapshot } from '../../ports/surface-bundle-source.ts';
import { surfaceBundleSnapshotIdentity } from '../../ports/surface-bundle-source.ts';

export interface IntegritySurfaceBundleVerifierConfig {
  readonly expectedAppId: string;
  readonly methodRegistry: SignatureMethodRegistry;
  readonly keyResolver: KeyResolver;
  readonly trustPolicy: PublisherTrustPolicy;
  readonly releasePolicy: SurfaceBundleReleasePolicy;
  readonly methodUriPrefix?: string;
  readonly now?: () => Date;
  readonly adapterId?: string;
}

/**
 * Browser reference adapter for web ADR-0013.
 *
 * COSE parsing, canonicalization, method dispatch, key lookup, publisher
 * authority, and rollback policy all remain in the upstream packages.
 */
export class IntegritySurfaceBundleVerifier implements SurfaceBundleVerifier {
  private readonly expectedAppId: string;
  private readonly methodRegistry: SignatureMethodRegistry;
  private readonly trustPolicy: PublisherTrustPolicy;
  private readonly releasePolicy: SurfaceBundleReleasePolicy;
  private readonly verifier: WebCryptoVerifier;
  private readonly now?: () => Date;
  private readonly adapterId: string;
  private readonly releaseBindings =
    new WeakMap<SurfaceBundleReleasePrecondition, SurfaceBundleReleaseBinding>();

  constructor(config: IntegritySurfaceBundleVerifierConfig) {
    assertAbsoluteAppId(config.expectedAppId);
    this.expectedAppId = config.expectedAppId;
    this.methodRegistry = config.methodRegistry;
    this.trustPolicy = config.trustPolicy;
    this.releasePolicy = config.releasePolicy;
    this.verifier = new WebCryptoVerifier({
      keyResolver: config.keyResolver,
      methodUriPrefix: config.methodUriPrefix ?? 'urn:formspec:sig-method:',
    });
    this.now = config.now;
    this.adapterId =
      config.adapterId ?? 'urn:formspec-web:surface-bundle-verifier:integrity-webcrypto@1';
  }

  async verify(snapshot: SurfaceBundleSnapshot): Promise<SurfaceBundleVerificationResult> {
    const candidateBytes = copySnapshotOnce(snapshot);
    const observedIdentity = await surfaceBundleSnapshotIdentity(candidateBytes);
    if (observedIdentity !== snapshot.identity) {
      throw new SurfaceBundleVerifierError(
        'invalid-snapshot',
        'Surface bundle snapshot bytes do not match its identity.',
      );
    }

    const upstream = await verifySurfaceBundleCandidate({
      candidateBytes,
      verifier: this.verifier,
      methodRegistry: this.methodRegistry,
      trustPolicy: this.trustPolicy,
      releasePolicy: this.releasePolicy,
      ...(this.now ? { now: this.now } : {}),
    });
    const provenance = provenanceFrom(
      this.adapterId,
      snapshot,
      upstream,
    );

    if (upstream.status === 'failed') {
      return freezeFailed({
        status: 'failed',
        code: upstream.code,
        reason: upstream.reason,
        snapshotIdentity: snapshot.identity,
        provenance,
      });
    }
    if (upstream.status === 'unverified') {
      return freezeUnverified({
        status: 'unverified',
        code: upstream.code,
        reason: upstream.reason,
        snapshotIdentity: snapshot.identity,
        provenance,
      });
    }
    if (upstream.payload.manifest.id !== this.expectedAppId) {
      return freezeFailed({
        status: 'failed',
        code: 'app-unauthorized',
        reason: 'Authenticated bundle app does not match this deployment.',
        snapshotIdentity: snapshot.identity,
        provenance,
      });
    }

    const precondition = Object.freeze({}) as SurfaceBundleReleasePrecondition;
    this.releaseBindings.set(precondition, {
      verification: upstream,
      snapshotIdentity: snapshot.identity,
    });
    const verifiedProvenance: SurfaceBundleVerifiedProvenance = Object.freeze({
      adapterId: this.adapterId,
      snapshotIdentity: snapshot.identity,
      source: snapshot.evidence,
      checkedAt: upstream.checkedAt,
      signedPayloadDigest: upstream.digest,
      integrityReceipt: upstream.integrityReceipt,
      trust: upstream.trust,
      release: upstream.release,
    });
    return Object.freeze({
      status: 'verified',
      snapshotIdentity: snapshot.identity,
      payload: upstream.payload,
      provenance: verifiedProvenance,
      releasePrecondition: precondition,
    } satisfies SurfaceBundleVerifiedResult);
  }

  async commitRelease(
    request: SurfaceBundleReleaseCommitRequest,
  ): Promise<SurfaceBundleReleaseCommitResult> {
    const binding = this.releaseBindings.get(request.precondition);
    if (!binding) {
      throw new SurfaceBundleVerifierError(
        'invalid-precondition',
        'Surface bundle release precondition was not issued by this verifier.',
      );
    }
    if (request.hostValidation.status !== 'passed') {
      throw new SurfaceBundleVerifierError(
        'invalid-precondition',
        'Surface bundle host validation has not passed.',
      );
    }

    const candidateBytes = copySnapshotOnce(request.snapshot);
    const observedIdentity = await surfaceBundleSnapshotIdentity(candidateBytes);
    if (
      observedIdentity !== request.snapshot.identity
      || observedIdentity !== binding.snapshotIdentity
    ) {
      throw new SurfaceBundleVerifierError(
        'invalid-snapshot',
        'Release commit snapshot does not match the verified candidate.',
      );
    }

    const admission = await admitVerifiedSurfaceBundle({
      verification: binding.verification,
      hostChecks: () => ({ status: 'passed' }),
    });
    if (admission.status === 'admitted') {
      this.releaseBindings.delete(request.precondition);
      return Object.freeze({
        status: 'committed',
        releaseCommit: admission.releaseCommit,
        snapshotIdentity: binding.snapshotIdentity,
      });
    }
    if (admission.status === 'refused') {
      return Object.freeze({
        status: 'refused',
        code: admission.code,
        reason: admission.reason,
        snapshotIdentity: binding.snapshotIdentity,
      });
    }
    return Object.freeze({
      status: 'unavailable',
      code: admission.code,
      reason: admission.reason,
      snapshotIdentity: binding.snapshotIdentity,
    });
  }
}

export function createIntegritySurfaceBundleVerifier(
  config: IntegritySurfaceBundleVerifierConfig,
): IntegritySurfaceBundleVerifier {
  return new IntegritySurfaceBundleVerifier(config);
}

function provenanceFrom(
  adapterId: string,
  snapshot: SurfaceBundleSnapshot,
  upstream:
    | UpstreamVerifiedResult
    | {
        readonly status: 'failed' | 'unverified';
        readonly digest?: string;
        readonly checkedAt?: string;
        readonly integrityReceipt?: UpstreamVerifiedResult['integrityReceipt'];
      },
): SurfaceBundleVerificationProvenance {
  return Object.freeze({
    adapterId,
    snapshotIdentity: snapshot.identity,
    source: snapshot.evidence,
    ...(upstream.checkedAt ? { checkedAt: upstream.checkedAt } : {}),
    ...(upstream.digest ? { signedPayloadDigest: upstream.digest } : {}),
    ...(upstream.integrityReceipt
      ? { integrityReceipt: upstream.integrityReceipt }
      : {}),
    ...(upstream.status === 'verified'
      ? { trust: upstream.trust, release: upstream.release }
      : {}),
  });
}

function copySnapshotOnce(snapshot: SurfaceBundleSnapshot): Uint8Array {
  try {
    const bytes = snapshot.copyBytes();
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('copyBytes did not return Uint8Array');
    }
    return new Uint8Array(bytes);
  } catch (error) {
    throw new SurfaceBundleVerifierError(
      'invalid-snapshot',
      'Surface bundle snapshot bytes are unavailable.',
      { cause: error },
    );
  }
}

function freezeFailed(
  result: SurfaceBundleFailedVerificationResult,
): SurfaceBundleFailedVerificationResult {
  return Object.freeze(result);
}

function freezeUnverified(
  result: SurfaceBundleUnverifiedVerificationResult,
): SurfaceBundleUnverifiedVerificationResult {
  return Object.freeze(result);
}

function assertAbsoluteAppId(appId: string): void {
  let parsed: URL;
  try {
    parsed = new URL(appId);
  } catch {
    throw new Error('Surface bundle expectedAppId must be an absolute URL');
  }
  if (parsed.href !== appId) {
    throw new Error('Surface bundle expectedAppId must be a canonical absolute URL');
  }
}
