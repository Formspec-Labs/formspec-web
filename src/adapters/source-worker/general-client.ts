import canonicalize from 'canonicalize';
import { abortable } from '../../shared/abortable.ts';
import type { EvaluationProviderRegistration, EvaluationHydrationResult } from '../../ports/evaluation-hydration.ts';
import type { NativeCurrentCheck } from '../../ports/screener-retention.ts';
import type { InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { hydrationInstant } from '../http/evaluation-composition.ts';
import { requireWireJson } from '../http/wire-json.ts';
import { exchangeProofWorker } from './exchange.ts';
import { snapshotMixedInputs } from './general-protocol.ts';
import type { MixedProofInputs, MixedProofCommand } from './general-protocol.ts';
import { SMALL_CAP, snapshotInput } from './protocol.ts';
import type { ProofWorker } from './protocol.ts';
import type { InitialProofWorkerLifetime } from './client.ts';
import { decodeBoundedProofJson } from './wire.ts';
export interface MixedProofOutcome {
  readonly version: 1; readonly status: 'verified'; readonly verificationScope: 'mappedFacts';
  readonly registration: EvaluationProviderRegistration; readonly request: InitialNativeRequest;
  readonly requestHash: string; readonly registrationHash: string; readonly receiptHash: string;
  readonly qualifiedAt: string; readonly validUntil: string; readonly results: readonly EvaluationHydrationResult[];
  readonly evidenceHash: string; readonly originalSignatureRequirements: readonly never[];
}
export interface MixedProofWorkerConfig {
  readonly createWorker: () => ProofWorker<MixedProofCommand>;
  readonly module: Uint8Array | WebAssembly.Module;
  readonly maxModuleBytes: number;
  readonly wholeOperationMilliseconds: number;
  readonly monotonicNow?: () => number;
}
export type PreparedMixedProof = Omit<MixedProofInputs, 'selectionBytes'>;
export type MixedProofIndexer = (referencesBytes: Uint8Array) => Promise<Uint8Array>;
const equal = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('output');
  return value as Record<string, unknown>;
};
/** One bounded worker lifetime covers owning indexing, protected transport and verification. */
export class MixedProofWorkerClient {
  private generation = 0;
  private active?: AbortController;
  private disposed = false;
  private readonly config: MixedProofWorkerConfig;
  private readonly module: Uint8Array<ArrayBuffer> | WebAssembly.Module;
  private readonly now: () => number;
  constructor(config: MixedProofWorkerConfig) {
    if (!Number.isSafeInteger(config.wholeOperationMilliseconds) || config.wholeOperationMilliseconds < 1
      || config.wholeOperationMilliseconds > 60_000 || !Number.isSafeInteger(config.maxModuleBytes)
      || config.maxModuleBytes < 1 || config.maxModuleBytes > 16 * 1024 * 1024) throw new Error('worker-limits');
    this.config = { ...config };
    this.module = config.module instanceof WebAssembly.Module ? config.module : snapshotInput(config.module, config.maxModuleBytes);
    this.now = config.monotonicNow ?? (() => performance.now());
  }
  retireFacts(): void { this.generation++; this.active?.abort(new Error('worker-retired')); this.active = undefined; }
  dispose(): void { this.disposed = true; this.retireFacts(); }
  async verify(selected: Readonly<{ registration: EvaluationProviderRegistration; request: InitialNativeRequest; nativeCurrentCheck?: NativeCurrentCheck }>,
    prepare: (index: MixedProofIndexer, lifetime: { signal: AbortSignal; assertCurrent: () => void }) => Promise<PreparedMixedProof>,
    lifetime: InitialProofWorkerLifetime): Promise<Readonly<{ outcome: MixedProofOutcome; assertCurrent: () => void; refreshRequired: () => boolean }>> {
    lifetime = { ...lifetime, assertCurrent: lifetime.assertCurrent.bind(lifetime) };
    this.retireFacts(); const generation = this.generation;
    const active = new AbortController(); this.active = active;
    const signal = AbortSignal.any([active.signal, lifetime.signal]);
    const operationDeadline = lifetime.startedMonotonic + this.config.wholeOperationMilliseconds;
    let factsDeadline = Infinity;
    let completed = false; let expired = false;
    let lastNow = -Infinity; let retired: Error | undefined;
    const check = () => {
      if (retired) throw retired;
      try {
        signal.throwIfAborted();
        if (this.disposed || generation !== this.generation) throw new Error('worker-retired');
        assertSynchronousGuard(lifetime.assertCurrent);
        const now = this.now();
        const deadline = completed ? factsDeadline : Math.min(operationDeadline, factsDeadline);
        if (![now, deadline, lifetime.startedMonotonic, lifetime.currentAtMonotonic].every(Number.isFinite)
          || now < lastNow || now < lifetime.startedMonotonic || lifetime.currentAtMonotonic < lifetime.startedMonotonic
          || lifetime.currentAtMonotonic > now) throw new Error('worker-expired');
        lastNow = now;
        if (now >= deadline) { expired = completed; throw new Error('worker-expired'); }
        return deadline - now;
      } catch (error) {
        retired = error instanceof Error ? error : new Error('worker-retired'); active.abort(retired); throw retired;
      }
    };
    check(); requireWireJson(selected);
    const selection = structuredClone({ version: 1, ...selected, currentAt: lifetime.currentAt });
    const selectionBytes = snapshotInput(new TextEncoder().encode(JSON.stringify(selection)), SMALL_CAP);
    let worker: ProofWorker<MixedProofCommand> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      timer = setTimeout(() => active.abort(new Error('worker-expired')), check());
      worker = this.config.createWorker(); const owned = worker;
      const module = this.module instanceof Uint8Array ? this.module.slice() : this.module;
      await exchangeProofWorker(owned, { kind: 'initialize', id: 1, module } as MixedProofCommand, signal, check,
        module instanceof Uint8Array ? [module.buffer] : []); check();
      let nextId = 2;
      const prepared = await abortable(signal, prepare(async references => {
        check(); const referencesBytes = snapshotInput(references, SMALL_CAP);
        const result = await exchangeProofWorker(owned, { kind: 'index', id: nextId++, referencesBytes } as MixedProofCommand,
          signal, check, [referencesBytes.buffer]); check();
        if (!result) throw new Error('output'); return result;
      }, { signal, assertCurrent: () => { check(); } })); check();
      const inputs = snapshotMixedInputs({ ...prepared, selectionBytes });
      const view = object(decodeBoundedProofJson(inputs.hydrationBytes));
      const receipt = object(view.providerReceipt);
      const expiresAt = receipt.validUntil;
      if (typeof expiresAt !== 'string') throw new Error('receipt');
      const remaining = hydrationInstant(expiresAt) - hydrationInstant(lifetime.currentAt);
      const milliseconds = Number(remaining / 1_000_000n);
      if (remaining <= 0n || !Number.isSafeInteger(milliseconds) || milliseconds <= 0) throw new Error('worker-expired');
      factsDeadline = lifetime.currentAtMonotonic + milliseconds;
      clearTimeout(timer); timer = setTimeout(() => active.abort(new Error('worker-expired')), check());
      const result = await exchangeProofWorker(owned, { kind: 'verify', id: nextId++, inputs } as MixedProofCommand,
        signal, check, []); check();
      if (!result) throw new Error('output');
      const value = object(decodeBoundedProofJson(result));
      const keys = ['version','status','verificationScope','registration','request','requestHash','registrationHash',
        'receiptHash','qualifiedAt','validUntil','results','evidenceHash','originalSignatureRequirements'];
      if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
        || value.version !== 1 || value.status !== 'verified' || value.verificationScope !== 'mappedFacts'
        || !equal(value.registration, selection.registration) || !equal(value.request, selection.request)
        || value.requestHash !== selection.request.requestHash || value.registrationHash !== selection.registration.registrationHash
        || value.receiptHash !== receipt.receiptHash || value.qualifiedAt !== view.qualifiedAt || value.validUntil !== expiresAt
        || !equal(value.results, view.results) || typeof value.evidenceHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.evidenceHash)
        || !Array.isArray(value.originalSignatureRequirements) || value.originalSignatureRequirements.length) throw new Error('binding');
      check(); completed = true; return Object.freeze({ outcome: value as unknown as MixedProofOutcome, assertCurrent: () => { check(); }, refreshRequired: () => {
        // Expiry can be renewed by an explicit action. Owner, cancellation,
        // generation and clock retirement permanently refuse this lifetime.
        try {
        lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent);
        if (this.disposed || generation !== this.generation) throw new Error('worker-retired');
        const now = this.now();
        if (!Number.isFinite(now) || now < lastNow || now < lifetime.currentAtMonotonic) throw new Error('worker-clock-retired');
        if (retired && !expired) throw retired;
        if (!expired) signal.throwIfAborted();
        lastNow = now;
        return expired || now >= factsDeadline;
        } catch (error) {
          expired = false; retired = error instanceof Error ? error : new Error('worker-retired');
          active.abort(retired); throw retired;
        }
      } });
    } catch (error) { active.abort(error); throw error; }
    finally { if (timer !== undefined) clearTimeout(timer); worker?.terminate(); }
  }
}
