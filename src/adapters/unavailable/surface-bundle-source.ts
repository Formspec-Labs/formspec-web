import type {
  SurfaceBundleAcquisitionRequest,
  SurfaceBundleSnapshot,
  SurfaceBundleSource,
} from '../../ports/surface-bundle-source.ts';
import { SurfaceBundleSourceError } from '../../ports/surface-bundle-source.ts';

export function unavailableSurfaceBundleSource(
  message = 'Signed Surface bundle acquisition is not configured for this deployment.',
): SurfaceBundleSource {
  return Object.freeze({
    async acquire(
      _request: SurfaceBundleAcquisitionRequest,
    ): Promise<SurfaceBundleSnapshot> {
      throw new SurfaceBundleSourceError('unavailable', message);
    },
  });
}
