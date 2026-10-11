import canonicalize from 'canonicalize';
import type { EvaluationHydrationWire, EvaluationProviderRegistration } from '../../ports/evaluation-hydration.ts';
import type { InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
import type { NativeCurrentCheck } from '../../ports/screener-retention.ts';
import { MixedProofWorkerClient, type MixedProofWorkerConfig } from '../source-worker/general-client.ts';
import { decodeBoundedProofJson } from '../source-worker/wire.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { computeJcsSha256Digest as hash } from './response-action-ledger.ts';
import { HttpMixedProofReader } from './mixed-proof-reader.ts';
import { hydrationInstant } from './evaluation-composition.ts';
import type { HttpClientConfig } from './http-client.ts';
import type { TaskHydrationReceiptVerifier } from './task-candidate-hydration.ts';
import { snapshotNativeCurrentCheck } from './native-current-check.ts';

/** Trusted host selects complete public policies before reading a task candidate.
 * Source's maintained worker verifies original signatures and mapped facts.
 */
export function createTaskMixedProofVerifier(config: {
  readonly source: HttpClientConfig;
  readonly publication: Readonly<Record<string, unknown>>;
  readonly registration: EvaluationProviderRegistration;
  readonly selection: EvaluationHydrationWire['selection'];
  readonly worker: MixedProofWorkerConfig;
  readonly nativeCurrentCheck?: NativeCurrentCheck;
  readonly monotonicNow?: () => number;
  readonly utcNow?: () => string;
  assertCurrent(): void;
}): TaskHydrationReceiptVerifier {
  const publication = structuredClone(config.publication);
  const registration = structuredClone(config.registration);
  const selection = structuredClone(config.selection);
  const nativeCurrentCheck = config.nativeCurrentCheck === undefined ? undefined : snapshotNativeCurrentCheck(config.nativeCurrentCheck);
  const source = { ...config.source, tenantBinding: config.source.tenantBinding ? structuredClone(config.source.tenantBinding) : undefined };
  const workerConfig = { ...config.worker, createWorker: config.worker.createWorker.bind(config.worker),
    module: config.worker.module instanceof Uint8Array ? config.worker.module.slice() : config.worker.module };
  const assertCurrent = config.assertCurrent.bind(config);
  const now = config.monotonicNow?.bind(config) ?? (() => performance.now());
  const utc = config.utcNow?.bind(config) ?? (() => new Date().toISOString());
  return { async verify(input, lifetime) {
    const signal = lifetime.signal;
    const callerCurrent = lifetime.assertCurrent.bind(lifetime);
    const check = () => { signal.throwIfAborted(); assertSynchronousGuard(callerCurrent); assertSynchronousGuard(assertCurrent); };
    check();
    const view = structuredClone(input.view), saved = structuredClone(input.saved);
    const hydrationBytes = input.hydrationBytes.slice();
    const startedMonotonic = now();
    const currentAt = utc(), currentAtMonotonic = now();
    if (canonicalize(decodeBoundedProofJson(hydrationBytes)) !== canonicalize(view)
      || canonicalize(view.selection) !== canonicalize(selection)
      || view.draftId !== saved.draft.id || view.draftVersion !== saved.draft.version
      || view.candidateHash !== await hash(saved.response) || view.formVersionHash !== await hash(publication))
      throw new Error('Task proof candidate or publication differs');
    check();
    const request: InitialNativeRequest = { operation: 'hydrate', scope: view.scope, owner: view.owner,
      selection, formVersion: publication, draftId: saved.draft.id, draftVersion: saved.draft.version,
      canonicalResponse: { ...saved.response }, candidateHash: view.candidateHash, requestHash: view.requestHash, sources: view.sources };
    if (await hash({ operation: request.operation, scope: request.scope, owner: request.owner,
      selection, formVersionHash: view.formVersionHash, draftId: request.draftId, draftVersion: request.draftVersion,
      candidateHash: request.candidateHash, sources: request.sources }) !== request.requestHash)
      throw new Error('Task proof request binding differs');
    check();
    const worker = new MixedProofWorkerClient({ ...workerConfig, monotonicNow: now });
    const reader = new HttpMixedProofReader(source);
    try {
      const proof = await worker.verify({ request, registration, ...(nativeCurrentCheck ? { nativeCurrentCheck } : {}) },
        (index, context) => reader.readAll({ value: view, utf8Bytes: hydrationBytes }, request, index, context),
        { signal, assertCurrent: check, startedMonotonic, currentAt, currentAtMonotonic });
      check(); proof.assertCurrent();
      const elapsed = now() - currentAtMonotonic;
      const remaining = Number((hydrationInstant(proof.outcome.validUntil) - hydrationInstant(currentAt)) / 1_000_000n) - Math.ceil(elapsed);
      if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isSafeInteger(remaining) || remaining <= 0)
        throw new Error('Original task proof validity expired');
      check();
      return { validForMilliseconds: remaining };
    } finally { worker.dispose(); }
  } };
}
