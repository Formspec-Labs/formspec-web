import type {
  SurfaceBundleReleaseCommitRequest,
  SurfaceBundleReleaseCommitResult,
  SurfaceBundleVerificationResult,
  SurfaceBundleVerifier,
} from '../../ports/surface-bundle-verifier.ts';
import { SurfaceBundleVerifierError } from '../../ports/surface-bundle-verifier.ts';
import type { SurfaceBundleSnapshot } from '../../ports/surface-bundle-source.ts';

export function unavailableSurfaceBundleVerifier(
  message = 'Signed Surface bundle verification is not configured for this deployment.',
): SurfaceBundleVerifier {
  return Object.freeze({
    async verify(
      _snapshot: SurfaceBundleSnapshot,
    ): Promise<SurfaceBundleVerificationResult> {
      throw new SurfaceBundleVerifierError('unavailable', message);
    },
    async commitRelease(
      _request: SurfaceBundleReleaseCommitRequest,
    ): Promise<SurfaceBundleReleaseCommitResult> {
      throw new SurfaceBundleVerifierError('unavailable', message);
    },
  });
}
