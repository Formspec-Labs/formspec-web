/**
 * Acquires one opaque signed Surface-bundle candidate without interpreting it.
 *
 * Web ADR-0012 keeps transport evidence separate from publisher claims. The
 * same digest-bound snapshot must pass through verification and later host
 * validation; changing any byte requires a new acquisition.
 */

export type SurfaceBundleSourceErrorCode =
  | 'unavailable'
  | 'not-found'
  | 'timeout'
  | 'size-limit-exceeded'
  | 'disallowed-location'
  | 'malformed-response'
  | 'cancelled'
  | 'internal';

export class SurfaceBundleSourceError extends Error {
  constructor(
    public readonly code: SurfaceBundleSourceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SurfaceBundleSourceError';
  }
}

export interface SurfaceBundleAcquisitionRequest {
  /** Host-selected location. It must not come from unverified bundle data. */
  readonly locator: string;
  readonly signal?: AbortSignal;
}

export interface SurfaceBundleSourceEvidence {
  readonly adapterId: string;
  readonly requestedLocator: string;
  readonly resolvedLocator: string;
  readonly acquiredAt: string;
  readonly byteCount: number;
  readonly responseStatus?: number;
  readonly cacheIdentity?: string;
}

export interface SurfaceBundleSnapshot {
  /** SHA-256 of the exact acquired candidate bytes, prefixed with `sha256:`. */
  readonly identity: string;
  readonly evidence: SurfaceBundleSourceEvidence;
  /**
   * Returns a new copy on every call. Callers may mutate that copy without
   * changing the acquired snapshot.
   */
  copyBytes(): Uint8Array;
}

export interface SurfaceBundleSource {
  acquire(request: SurfaceBundleAcquisitionRequest): Promise<SurfaceBundleSnapshot>;
}

export async function createSurfaceBundleSnapshot(
  candidateBytes: Uint8Array,
  evidence: Omit<SurfaceBundleSourceEvidence, 'byteCount'>,
): Promise<SurfaceBundleSnapshot> {
  const storedBytes = new Uint8Array(candidateBytes);
  const identity = `sha256:${await sha256Hex(storedBytes)}`;
  const frozenEvidence = Object.freeze({
    ...evidence,
    byteCount: storedBytes.byteLength,
  });

  return Object.freeze({
    identity,
    evidence: frozenEvidence,
    copyBytes: () => new Uint8Array(storedBytes),
  });
}

export async function surfaceBundleSnapshotIdentity(bytes: Uint8Array): Promise<string> {
  return `sha256:${await sha256Hex(bytes)}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new SurfaceBundleSourceError(
      'internal',
      'SHA-256 is unavailable in this runtime.',
    );
  }
  const digest = new Uint8Array(
    await subtle.digest('SHA-256', bytes as BufferSource),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
