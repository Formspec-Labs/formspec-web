import type {
  SurfaceBundleAcquisitionRequest,
  SurfaceBundleSnapshot,
  SurfaceBundleSource,
} from '../../ports/surface-bundle-source.ts';
import {
  SurfaceBundleSourceError,
  createSurfaceBundleSnapshot,
} from '../../ports/surface-bundle-source.ts';

export interface RawSurfaceBundleSourceConfig {
  readonly candidates: ReadonlyArray<readonly [locator: string, bytes: Uint8Array]>;
  readonly maxBytes: number;
  readonly now?: () => Date;
  readonly adapterId?: string;
}

/**
 * Static/raw-byte reference source for server-bundled assets and tests.
 * Candidate bytes are copied at construction and again for each snapshot.
 */
export class RawSurfaceBundleSource implements SurfaceBundleSource {
  private readonly candidates: ReadonlyMap<string, Uint8Array>;
  private readonly maxBytes: number;
  private readonly now: () => Date;
  private readonly adapterId: string;

  constructor(config: RawSurfaceBundleSourceConfig) {
    if (!Number.isSafeInteger(config.maxBytes) || config.maxBytes <= 0) {
      throw new Error('RawSurfaceBundleSource maxBytes must be a positive safe integer');
    }
    this.candidates = new Map(
      config.candidates.map(([locator, bytes]) => [locator, new Uint8Array(bytes)]),
    );
    this.maxBytes = config.maxBytes;
    this.now = config.now ?? (() => new Date());
    this.adapterId = config.adapterId ?? 'urn:formspec-web:surface-bundle-source:raw@1';
  }

  async acquire(request: SurfaceBundleAcquisitionRequest): Promise<SurfaceBundleSnapshot> {
    if (request.signal?.aborted) {
      throw new SurfaceBundleSourceError(
        'cancelled',
        'Surface bundle acquisition was cancelled.',
      );
    }
    const bytes = this.candidates.get(request.locator);
    if (!bytes) {
      throw new SurfaceBundleSourceError('not-found', 'Surface bundle was not found.');
    }
    if (bytes.byteLength > this.maxBytes) {
      throw new SurfaceBundleSourceError(
        'size-limit-exceeded',
        `Surface bundle exceeds the configured ${this.maxBytes}-byte limit.`,
      );
    }
    const acquiredAt = this.now();
    if (!(acquiredAt instanceof Date) || !Number.isFinite(acquiredAt.getTime())) {
      throw new SurfaceBundleSourceError('internal', 'Surface bundle source clock is invalid.');
    }
    return createSurfaceBundleSnapshot(bytes, {
      adapterId: this.adapterId,
      requestedLocator: request.locator,
      resolvedLocator: request.locator,
      acquiredAt: acquiredAt.toISOString(),
    });
  }
}

export function createRawSurfaceBundleSource(
  config: RawSurfaceBundleSourceConfig,
): RawSurfaceBundleSource {
  return new RawSurfaceBundleSource(config);
}
