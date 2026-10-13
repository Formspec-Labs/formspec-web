/** Fixed metadata only: callers never supply errors, requests, or business identifiers. */
export type SubmitFailureStage = 'host-admission' | 'host-result-fence' | 'controller-admission'
  | 'controller-frozen-validation' | 'controller-review' | 'controller-completion-preflight' | 'controller-effect'
  | 'task-preflight' | 'task-transport' | 'task-outcome-validation';
export type SubmitFailureKind = 'failed' | 'refused' | 'http-status' | 'timeout';

/** Bound console output per owner instance; observation must never change Submit handling. */
export function createSubmitFailureReporter() {
  let count = 0;
  return (stage: SubmitFailureStage, kind: SubmitFailureKind = 'failed', status?: number): void => {
    if (count++ >= 32) return;
    try {
      const httpStatus = Number.isInteger(status) && status! >= 100 && status! <= 599 ? status : undefined;
      console.warn('Native form Submit diagnostic', JSON.stringify({ stage, kind,
        ...(kind === 'http-status' && httpStatus !== undefined ? { status: httpStatus } : {}) }));
    } catch { /* Diagnostics cannot change action handling. */ }
  };
}
