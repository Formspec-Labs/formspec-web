import { HttpAdapterError } from '../adapters/http/http-client.ts';

// Exact maintained invariant messages select finite codes; messages never leave this boundary.
const prepareReasons = new Map([
  ['Preparation requires a completed unsigned pinned Response', 'candidate-invalid'],
  ['Preparation requires an existing owned draft handle', 'owned-handle-missing'],
  ['Saved draft changed before preparation', 'saved-draft-changed'],
  ['Preparation differs from the exact saved Response', 'saved-response-mismatch'],
  ['Owned draft has no matching authoritative Response snapshot', 'owned-evidence-mismatch'],
  ['Signing content requires the exact Response-pinned Definition', 'definition-mismatch'],
  ['Signing source must identify one declared content entry', 'signing-source-invalid'],
  ['Signing content entry is unavailable', 'signing-content-unavailable'],
  ['Signing content failed the shared schema', 'signing-content-invalid'],
  ['Signing content source, version or displayed locale does not match', 'signing-locale-mismatch'],
  ['Signing source is not structured data', 'signing-source-invalid'],
  ['Signing source must resolve through own data properties', 'signing-source-invalid'],
  ['Draft signing state was cleared or invalidated while an operation was running', 'context-obsolete'],
  ['A draft operation is already in progress', 'operation-pending'],
]);

export function nativePrepareDiagnostic(error: unknown): { stage: 'prepare-port'; reason: string; status?: number } {
  const status = error instanceof HttpAdapterError && Number.isInteger(error.status)
    && error.status >= 100 && error.status <= 599 ? error.status : undefined;
  return { stage: 'prepare-port',
    reason: status !== undefined ? 'http-refused' : error instanceof Error ? prepareReasons.get(error.message) ?? 'port-failed' : 'port-failed',
    ...(status !== undefined ? { status } : {}),
  };
}

export async function diagnoseNativePrepare<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    console.warn('Native form action failed', JSON.stringify(nativePrepareDiagnostic(error)));
    throw error;
  }
}
