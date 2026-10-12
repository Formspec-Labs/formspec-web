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

export type NativeQualificationStage = 'source-qualification' | 'renderer-exchange' | 'source-ready' | 'review-delivery' | 'candidate-lifetime';
const qualificationReasons = new Map([
  ['native-facts-deadline', 'deadline'], ['Source initial mixed whole deadline expired', 'deadline'],
  ['native-facts-context-retired', 'context-retired'], ['native-context-obsolete', 'context-retired'],
  ['Native Screener operation retired', 'context-retired'], ['native-visit-retired', 'context-retired'],
  ['Source initial mixed retired', 'context-retired'], ['worker-retired', 'context-retired'],
  ['worker-expired', 'proof-expired'], ['worker-clock-retired', 'clock-retired'],
  ['output', 'proof-output-invalid'], ['binding', 'proof-binding-invalid'],
  ['Source initial mixed original native custody mismatch', 'proof-binding-invalid'],
  ['Source initial mixed independent authority mismatch', 'proof-binding-invalid'],
  ['Source initial mixed selected digest mismatch', 'proof-binding-invalid'],
  ['Source initial mixed required source unavailable', 'required-source-unavailable'],
  ['native-renderer-exchange-unavailable', 'renderer-unavailable'],
  ['Respondent engine exchange retired', 'renderer-retired'],
  ['native-renderer-replacement-unsupported', 'renderer-unsupported'],
  ['native-isolated-candidate-changed', 'candidate-changed'],
  ['native-source-name-unsupported', 'source-binding-invalid'],
  ['native-review-digest-profile-mismatch', 'response-digest-mismatch'],
  ['native-review-label-unavailable', 'field-metadata-unavailable'],
  ['native-review-field-unavailable', 'field-metadata-unavailable'],
  ['visit-change', 'visit-retired'], ['renderer-dispose', 'renderer-retired'],
  ['authority-change', 'authority-retired'], ['sign-retry-retired', 'retry-retired'],
]);

/** One host's existing failure boundary emits only closed codes, at most 32 times. */
export function createNativeQualificationReporter() {
  let count = 0;
  return (stage: NativeQualificationStage, error?: unknown) => {
    if (count++ >= 32) return;
    try {
      if (!['source-qualification', 'renderer-exchange', 'source-ready', 'review-delivery', 'candidate-lifetime'].includes(stage)) stage = 'source-qualification';
      const status = error instanceof HttpAdapterError && Number.isInteger(error.status)
        && error.status >= 100 && error.status <= 599 ? error.status : undefined;
      const reason = error === undefined ? 'ready' : status !== undefined ? 'http-refused'
        : error instanceof Error ? qualificationReasons.get(error.message) ?? 'qualification-failed' : 'qualification-failed';
      console.warn('Native form qualification diagnostic', JSON.stringify({ stage, reason,
        ...(status !== undefined ? { status } : {}) }));
    } catch { /* Diagnostics cannot change the existing failure handling. */ }
  };
}
