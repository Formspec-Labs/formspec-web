import {
  produceBundleExportAppGraphValidationReport,
  type AppGraphReportProducerResult,
  type BundleExportAppGraphReportProducerRequest,
} from '@formspec-org/app-graph';
import {
  bundleIsRenderable,
  dereferenceBundleExport,
  type BundleManifest,
  type ResolvedBundle,
} from '@formspec-org/surface';
import type {
  SurfaceBundleAcquisitionRequest,
  SurfaceBundleSnapshot,
  SurfaceBundleSource,
} from '../ports/surface-bundle-source.ts';
import { SurfaceBundleSourceError } from '../ports/surface-bundle-source.ts';
import type {
  SurfaceBundleReleaseCommitResult,
  SurfaceBundleVerifiedResult,
  SurfaceBundleVerifier,
} from '../ports/surface-bundle-verifier.ts';

export type SurfaceAdmissionFailureCode =
  | 'source-refused'
  | 'verification-failed'
  | 'app-graph-invalid'
  | 'release-refused'
  | 'bundle-not-renderable';

export type SurfaceAdmissionUnsupportedCode = 'verification-unsupported';

export type SurfaceAdmissionAdapterErrorCode =
  | 'admission-cancelled'
  | 'source-unavailable'
  | 'verification-unavailable'
  | 'validation-unavailable'
  | 'release-unavailable'
  | 'render-preparation-unavailable'
  | 'unexpected-adapter-error';

export type SurfaceAdmissionState =
  | { readonly status: 'checking' }
  | {
      readonly status: 'failure';
      readonly code: SurfaceAdmissionFailureCode;
      readonly diagnosticCode?: string;
    }
  | {
      readonly status: 'unsupported';
      readonly code: SurfaceAdmissionUnsupportedCode;
      readonly diagnosticCode?: string;
    }
  | {
      readonly status: 'adapter-error';
      readonly code: SurfaceAdmissionAdapterErrorCode;
      readonly diagnosticCode?: string;
    }
  | {
      readonly status: 'admitted';
      readonly snapshot: SurfaceBundleSnapshot;
      readonly verification: SurfaceBundleVerifiedResult;
      readonly validation: AppGraphReportProducerResult;
      readonly releaseCommit: Extract<
        SurfaceBundleReleaseCommitResult,
        { readonly status: 'committed' }
      >;
      readonly bundle: ResolvedBundle;
    };

export type SurfaceBundleValidationConfig = Omit<
  BundleExportAppGraphReportProducerRequest,
  'manifest' | 'documents' | 'source' | 'digest'
>;

export interface SurfaceAdmissionInput {
  readonly source: SurfaceBundleSource;
  readonly verifier: SurfaceBundleVerifier;
  readonly request: SurfaceBundleAcquisitionRequest;
  readonly validation: SurfaceBundleValidationConfig;
  /** Host generation check used with AbortSignal to retire replaced work. */
  readonly isCurrentAdmission?: () => boolean;
  readonly onValidationReport?: (result: AppGraphReportProducerResult) => void;
}

/**
 * Runs the web ADR-0012/0013 admission sequence over one immutable snapshot.
 *
 * Every non-admitted state contains host-owned codes only. Authenticated
 * payload, source evidence, and graph diagnostics become render inputs only in
 * the final `admitted` variant.
 */
export async function admitSurfaceBundle(
  input: SurfaceAdmissionInput,
): Promise<SurfaceAdmissionState> {
  if (!admissionIsCurrent(input)) return cancelledAdmission();

  let snapshot: SurfaceBundleSnapshot;
  try {
    snapshot = await input.source.acquire(input.request);
  } catch (error) {
    if (!admissionIsCurrent(input)) return cancelledAdmission();
    return sourceFailure(error);
  }
  if (!admissionIsCurrent(input)) return cancelledAdmission();

  let verification;
  try {
    verification = await input.verifier.verify(snapshot);
  } catch {
    if (!admissionIsCurrent(input)) return cancelledAdmission();
    return Object.freeze({
      status: 'adapter-error',
      code: 'unexpected-adapter-error',
    });
  }
  if (!admissionIsCurrent(input)) return cancelledAdmission();

  if (verification.status === 'failed') {
    return Object.freeze({
      status: 'failure',
      code: 'verification-failed',
      diagnosticCode: verification.code,
    });
  }
  if (verification.status === 'unverified') {
    if (verification.code === 'integrity-unsupported') {
      return Object.freeze({
        status: 'unsupported',
        code: 'verification-unsupported',
        diagnosticCode: verification.code,
      });
    }
    return Object.freeze({
      status: 'adapter-error',
      code: 'verification-unavailable',
      diagnosticCode: verification.code,
    });
  }
  if (
    verification.snapshotIdentity !== snapshot.identity
    || verification.provenance.snapshotIdentity !== snapshot.identity
  ) {
    return Object.freeze({
      status: 'adapter-error',
      code: 'verification-unavailable',
      diagnosticCode: 'snapshot-identity-mismatch',
    });
  }

  if (!documentsAreManifestClosed(
    verification.payload.manifest,
    verification.payload.documents,
  )) {
    return Object.freeze({
      status: 'failure',
      code: 'app-graph-invalid',
      diagnosticCode: 'unmanifested-document',
    });
  }

  let validation: AppGraphReportProducerResult;
  try {
    validation = await produceBundleExportAppGraphValidationReport({
      ...input.validation,
      manifest: verification.payload.manifest,
      documents: verification.payload.documents,
      source: `surface-bundle:${snapshot.identity}`,
      digest: verification.provenance.signedPayloadDigest,
    });
  } catch {
    if (!admissionIsCurrent(input)) return cancelledAdmission();
    return Object.freeze({
      status: 'adapter-error',
      code: 'validation-unavailable',
    });
  }
  // Report delivery is an externally visible side effect. Recheck the host
  // generation after validation and immediately before calling it.
  if (!admissionIsCurrent(input)) return cancelledAdmission();
  try {
    input.onValidationReport?.(validation);
  } catch {
    if (!admissionIsCurrent(input)) return cancelledAdmission();
    return Object.freeze({
      status: 'adapter-error',
      code: 'validation-unavailable',
    });
  }
  if (!admissionIsCurrent(input)) return cancelledAdmission();
  if (!validation.report.ok) {
    return Object.freeze({
      status: 'failure',
      code: 'app-graph-invalid',
    });
  }

  // Dereference and structural renderability are admission checks, not
  // post-commit preparation. A monotonic release must never advance for a
  // candidate the renderer cannot consume.
  let bundle: ResolvedBundle;
  try {
    bundle = dereferenceBundleExport({
      manifest: verification.payload.manifest as BundleManifest,
      documents: verification.payload.documents,
    });
  } catch {
    return Object.freeze({
      status: 'adapter-error',
      code: 'render-preparation-unavailable',
    });
  }
  if (!bundleIsRenderable(bundle)) {
    return Object.freeze({
      status: 'failure',
      code: 'bundle-not-renderable',
    });
  }

  // Release commit advances durable monotonic state. Nothing may run between
  // this generation check and the commit invocation. Schema, graph, actor,
  // entry, dereference, and renderability checks have all completed first.
  if (!admissionIsCurrent(input)) return cancelledAdmission();
  let releaseCommit: SurfaceBundleReleaseCommitResult;
  try {
    releaseCommit = await input.verifier.commitRelease({
      snapshot,
      precondition: verification.releasePrecondition,
      hostValidation: { status: 'passed' },
    });
  } catch {
    if (!admissionIsCurrent(input)) return cancelledAdmission();
    return Object.freeze({
      status: 'adapter-error',
      code: 'unexpected-adapter-error',
    });
  }
  if (!admissionIsCurrent(input)) return cancelledAdmission();
  if (releaseCommit.status === 'refused') {
    return Object.freeze({
      status: 'failure',
      code: 'release-refused',
      diagnosticCode: releaseCommit.code,
    });
  }
  if (releaseCommit.status === 'unavailable') {
    return Object.freeze({
      status: 'adapter-error',
      code: 'release-unavailable',
      diagnosticCode: releaseCommit.code,
    });
  }
  if (releaseCommit.snapshotIdentity !== snapshot.identity) {
    return Object.freeze({
      status: 'adapter-error',
      code: 'release-unavailable',
      diagnosticCode: 'snapshot-identity-mismatch',
    });
  }

  return Object.freeze({
    status: 'admitted',
    snapshot,
    verification,
    validation,
    releaseCommit,
    bundle,
  });
}

const ARRAY_ARTIFACT_SLOTS = [
  'definitions',
  'components',
  'registries',
  'surfaces',
  'screeners',
  'dataSources',
  'locales',
  'mappings',
] as const;

const SINGLE_ARTIFACT_SLOTS = [
  'experience',
  'responseActions',
  'component',
  'theme',
  'references',
  'ontology',
] as const;

function documentsAreManifestClosed(
  manifest: Readonly<Record<string, unknown>>,
  documents: Readonly<Record<string, unknown>>,
): boolean {
  const referenced = new Set<string>();
  for (const slot of ARRAY_ARTIFACT_SLOTS) {
    const value = Object.prototype.hasOwnProperty.call(manifest, slot)
      ? manifest[slot]
      : undefined;
    if (!Array.isArray(value)) continue;
    for (const ref of value) addRefUrl(referenced, ref);
  }
  for (const slot of SINGLE_ARTIFACT_SLOTS) {
    const value = Object.prototype.hasOwnProperty.call(manifest, slot)
      ? manifest[slot]
      : undefined;
    addRefUrl(referenced, value);
  }
  return Object.keys(documents).every((url) => referenced.has(url));
}

function addRefUrl(urls: Set<string>, value: unknown): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const ref = value as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(ref, 'url')
    && typeof ref.url === 'string'
  ) {
    urls.add(ref.url);
  }
}

function admissionIsCurrent(input: SurfaceAdmissionInput): boolean {
  if (input.request.signal?.aborted) return false;
  try {
    return input.isCurrentAdmission?.() ?? true;
  } catch {
    return false;
  }
}

function cancelledAdmission(): SurfaceAdmissionState {
  return Object.freeze({
    status: 'adapter-error',
    code: 'admission-cancelled',
    diagnosticCode: 'cancelled',
  });
}

function sourceFailure(error: unknown): SurfaceAdmissionState {
  if (!(error instanceof SurfaceBundleSourceError)) {
    return Object.freeze({
      status: 'adapter-error',
      code: 'unexpected-adapter-error',
    });
  }
  if (
    error.code === 'unavailable'
    || error.code === 'not-found'
    || error.code === 'timeout'
    || error.code === 'cancelled'
    || error.code === 'internal'
  ) {
    return Object.freeze({
      status: 'adapter-error',
      code: 'source-unavailable',
      diagnosticCode: error.code,
    });
  }
  return Object.freeze({
    status: 'failure',
    code: 'source-refused',
    diagnosticCode: error.code,
  });
}
