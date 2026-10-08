import { HttpAdapterError } from '../adapters/http/http-client.ts';
import { OidcAssuranceError } from '../adapters/identity/oidc.ts';

type AdmissionStage = 'package' | 'publication' | 'identity' | 'saved-access';

/** Retain the cause for handling; logs copy only finite stage/status and numeric ACR. */
export class NativePackageAdmissionError extends Error {
  constructor(readonly stage: AdmissionStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Native form admission failed', { cause });
    this.name = 'NativePackageAdmissionError';
  }
}

export async function atNativeAdmissionStage<T>(stage: AdmissionStage, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (cause) {
    throw cause instanceof NativePackageAdmissionError ? cause : new NativePackageAdmissionError(stage, cause);
  }
}

export function nativeAdmissionDiagnostic(error: unknown): { stage: AdmissionStage | 'load-or-recovery'; status?: number; reason?: 'unmapped-acr' | 'below-minimum'; acr?: string } {
  if (!(error instanceof NativePackageAdmissionError)) return { stage: 'load-or-recovery' };
  if (error.stage !== 'package' && error.stage !== 'publication' && error.stage !== 'identity' && error.stage !== 'saved-access') {
    return { stage: 'load-or-recovery' };
  }
  const cause = error.cause;
  return {
    stage: error.stage,
    ...(cause instanceof HttpAdapterError && Number.isInteger(cause.status) && cause.status >= 100 && cause.status <= 599 ? { status: cause.status } : {}),
    ...(cause instanceof OidcAssuranceError && (cause.reason === 'unmapped-acr' || cause.reason === 'below-minimum')
      ? { reason: cause.reason, ...(typeof cause.numericAcr === 'string' && /^[0-9]{1,3}$/.test(cause.numericAcr) ? { acr: cause.numericAcr } : {}) } : {}),
  };
}
