import { exchangeProofWorker } from './exchange.ts';
import canonicalize from 'canonicalize';
import type { EvaluationProviderRegistration } from '../../ports/evaluation-hydration.ts';
import type { InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
import type { InitialProofReadBundle } from '../http/initial-mixed-proof-reader.ts';
import { decodeInitialMixedHydration } from '../http/initial-mixed-proof-wire.ts';
import { hydrationInstant } from '../http/evaluation-composition.ts';
import { freezeWireJson, requireWireJson } from '../http/wire-json.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { IMAGE_CAP, SMALL_CAP, snapshotInput } from './protocol.ts';
import type { ProofWorker, ProofWorkerInputs, ProofWorkerCommand } from './protocol.ts';
import { decodeInitialProofOutcome, selectionBytes } from './wire.ts';
import type { InitialProofOutcome } from './wire.ts';

export interface InitialProofWorkerLifetime {
  readonly signal: AbortSignal;
  /** Must fence owner, session, publication, candidate, route and engine generation. */
  readonly assertCurrent: () => void;
  /** Captured before hydration, using the same monotonic clock as the client. */
  readonly startedMonotonic: number;
  /** Independently captured UTC time and simultaneous monotonic reading. */
  readonly currentAt: string;
  readonly currentAtMonotonic: number;
}
export interface CurrentInitialProof {
  readonly outcome: InitialProofOutcome;
  /** Call at every awaited replacement/adoption boundary, including final installation. */
  readonly assertCurrent: () => void;
}
export interface InitialProofWorkerConfig {
  readonly createWorker: () => ProofWorker;
  readonly module: Uint8Array | WebAssembly.Module;
  readonly maxModuleBytes: number;
  readonly wholeOperationMilliseconds: number;
  readonly monotonicNow?: () => number;
}
export function createDedicatedProofWorker<Command = ProofWorkerCommand>(url: URL): ProofWorker<Command> {
  return new Worker(url, { type: 'module' });
}
const equal = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);

/** Owns transport/lifetime only. The dedicated worker delegates proof semantics to Source. */
export class InitialMixedProofWorkerClient {
  private readonly config: InitialProofWorkerConfig;
  private readonly module: Uint8Array<ArrayBuffer> | WebAssembly.Module;
  private readonly now: () => number;
  private generation = 0;
  private active?: AbortController;
  private disposed = false;

  constructor(config: InitialProofWorkerConfig) {
    if (!Number.isSafeInteger(config.wholeOperationMilliseconds) || config.wholeOperationMilliseconds < 1
      || config.wholeOperationMilliseconds > 60_000 || !Number.isSafeInteger(config.maxModuleBytes) || config.maxModuleBytes < 1) {
      throw new Error('worker-limits');
    }
    this.module = config.module instanceof WebAssembly.Module ? config.module : snapshotInput(config.module, config.maxModuleBytes);
    this.config = { ...config };
    this.now = config.monotonicNow ?? (() => performance.now());
  }
  retireFacts(): void {
    this.generation++;
    this.active?.abort(new Error('worker-retired'));
    this.active = undefined;
  }
  dispose(): void { this.disposed = true; this.retireFacts(); }

  async verify(selected: Readonly<{ registration: EvaluationProviderRegistration; request: InitialNativeRequest }>,
    bundle: InitialProofReadBundle, inputLifetime: InitialProofWorkerLifetime): Promise<CurrentInitialProof> {
    this.retireFacts();
    const generation = this.generation;
    const active = new AbortController(); this.active = active;
    const { signal: callerSignal, assertCurrent, startedMonotonic, currentAt, currentAtMonotonic } = inputLifetime;
    const signal = AbortSignal.any([callerSignal, active.signal]);
    let lastNow = -Infinity;
    let deadline = startedMonotonic + this.config.wholeOperationMilliseconds;
    let retired: Error | undefined;
    const check = () => {
      if (retired) throw retired;
      try {
        signal.throwIfAborted();
        if (this.disposed || generation !== this.generation) throw new Error('worker-retired');
        assertSynchronousGuard(assertCurrent);
        const now = this.now();
        if (!Number.isFinite(startedMonotonic) || !Number.isFinite(currentAtMonotonic) || !Number.isFinite(deadline)
          || !Number.isFinite(now) || now < lastNow || now < startedMonotonic
          || currentAtMonotonic < startedMonotonic || currentAtMonotonic > now || now >= deadline) throw new Error('worker-expired');
        lastNow = now;
        return deadline - now;
      } catch (error) {
        retired = error instanceof Error ? error : new Error('worker-retired');
        throw retired;
      }
    };
    let worker: ProofWorker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      check();
      requireWireJson(selected);
      const selection = structuredClone({ version: 1 as const, ...selected, currentAt });
      freezeWireJson(selection);
      if (!equal(bundle.expectedRequest, selection.request) || bundle.proofs.length !== 2) throw new Error('binding');
      const native = bundle.proofs.filter(proof => proof.decoded.kind === 'native');
      const image = bundle.proofs.filter(proof => proof.decoded.kind === 'image');
      if (native.length !== 1 || image.length !== 1) throw new Error('unsupported-scope');
      // Snapshot before initialization awaits; only these copies enter the worker.
      const inputs: ProofWorkerInputs = { selection: selectionBytes(selection),
        hydration: snapshotInput(bundle.hydrationBytes, SMALL_CAP), native: snapshotInput(native[0].utf8Bytes, SMALL_CAP),
        image: snapshotInput(image[0].utf8Bytes, IMAGE_CAP) };
      const view = decodeInitialMixedHydration(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(inputs.hydration)));
      const expiresAt = view.providerReceipt.validUntil;
      if (!expiresAt) throw new Error('receipt');
      const remainingNanoseconds = hydrationInstant(expiresAt) - hydrationInstant(currentAt);
      // Round down; never extend the original nanosecond expiry for a browser clock.
      const remainingMilliseconds = Number(remainingNanoseconds / 1_000_000n);
      if (remainingNanoseconds <= 0n || !Number.isSafeInteger(remainingMilliseconds) || remainingMilliseconds <= 0) throw new Error('worker-expired');
      deadline = Math.min(deadline, currentAtMonotonic + remainingMilliseconds);
      const remaining = check();
      timer = setTimeout(() => active.abort(new Error('worker-expired')), remaining);
      worker = this.config.createWorker();
      const module = this.module instanceof Uint8Array ? this.module.slice() : this.module;
      await exchangeProofWorker(worker, { kind: 'initialize', id: 1, module }, signal, check,
        module instanceof Uint8Array ? [module.buffer] : []);
      check();
      const result = await exchangeProofWorker(worker, { kind: 'verify', id: 2, inputs }, signal, check,
        [inputs.selection.buffer, inputs.hydration.buffer, inputs.native.buffer, inputs.image.buffer]);
      check();
      if (!(result instanceof Uint8Array)) throw new Error('output');
      const outcome = decodeInitialProofOutcome(result);
      if (outcome.requestHash !== selection.request.requestHash || outcome.registrationHash !== selection.registration.registrationHash
        || outcome.receiptHash !== view.providerReceipt.receiptHash || outcome.qualifiedAt !== view.qualifiedAt
        || outcome.expiresAt !== expiresAt || !equal(outcome.results, view.results)) throw new Error('binding');
      check();
      // This is current verified data, not a signing or storage capability. Host adoption
      // must retain this guard through the maintained replacement/lease exchange path.
      return Object.freeze({ outcome, assertCurrent: () => { check(); } });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      worker?.terminate();
      // Leave the generation controller alive so retireFacts/dispose retires returned facts.
    }
  }

}
