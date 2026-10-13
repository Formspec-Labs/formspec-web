import { NATIVE_SOURCE_OPERATION_MILLISECONDS } from '../../shared/native-operation-budget.ts';
import { abortable } from '../../shared/abortable.ts';
import canonicalize from 'canonicalize';
import { snapshotFiniteJson } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import type { CompletionLifetime } from '../../ports/response-completion.ts';
import type { SavedResponseDraft } from '../../ports/response-signing.ts';
import type { TaskDraftAssociation } from '../../ports/task-draft.ts';
import type { EvaluationHydrationWire, HydratedEvaluationCandidate, SavedCandidateHydration } from '../../ports/evaluation-hydration.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { computeJcsSha256Digest as hash } from './response-action-ledger.ts';
import type { MixedHydrationWire } from '../../ports/mixed-proof.ts';
import { decodeMixedHydration } from './mixed-proof-wire.ts';
import { decodeEvaluationHydrationWire } from './evaluation-hydration-wire.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

/** Selected owning proof implementation; schema decoding alone cannot qualify facts. */
export interface TaskHydrationReceiptVerifier {
  verify(input: Readonly<{ view: EvaluationHydrationWire | MixedHydrationWire; saved: SavedResponseDraft; hydrationBytes: Uint8Array<ArrayBuffer> }>, lifetime: CompletionLifetime): Promise<Readonly<{
    /** Remaining original proof validity measured from request dispatch, never a renewed lease. */
    validForMilliseconds: number;
  }>>;
}
export interface HttpTaskCandidateHydrationConfig extends HttpClientConfig {
  readonly definition: FormDefinition;
  readonly selection: EvaluationHydrationWire['selection'];
  readonly formVersionHash: string;
  readonly taskDraft: TaskDraftAssociation;
  readonly subjectRef: string;
  readonly identity: Readonly<{ issuer: string; subject: string; clientId: string | null }>;
  readonly assertCurrent: () => void;
  readonly receiptVerifier?: TaskHydrationReceiptVerifier;
  readonly elapsedNow?: () => number;
}
const equal = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);
function fail(detail: string): never { throw new Error(`Source task candidate hydration ${detail}`); }

/** Reads Source's actual task-authorized candidate route; supplies no Screener evidence. */
export class HttpTaskCandidateHydration implements SavedCandidateHydration {
  private readonly client: HttpClient;
  private readonly pins: Pick<HttpTaskCandidateHydrationConfig, 'definition' | 'selection' | 'formVersionHash' | 'taskDraft' | 'subjectRef' | 'identity'>;
  private readonly sourceCurrent: () => void;
  private readonly verifier?: TaskHydrationReceiptVerifier['verify'];
  private readonly clock: () => number;
  private readonly lifetime: CompletionLifetime;
  private generation = 0;
  private active?: AbortController;
  private disposed = false;
  private lastElapsed = -Infinity;

  constructor(config: HttpTaskCandidateHydrationConfig, lifetime: CompletionLifetime) {
    this.pins = structuredClone({ definition: config.definition, selection: config.selection,
      formVersionHash: config.formVersionHash, taskDraft: config.taskDraft, subjectRef: config.subjectRef, identity: config.identity });
    this.sourceCurrent = config.assertCurrent;
    this.verifier = config.receiptVerifier?.verify.bind(config.receiptVerifier);
    this.clock = config.elapsedNow ?? (() => performance.now());
    this.lifetime = { signal: lifetime.signal, assertCurrent: lifetime.assertCurrent };
    assertTaskHydrationSelection(config);
    const { taskDraft } = this.pins;
    if (taskDraft.version !== 1 || !/^sha256:[a-f0-9]{64}$/.test(taskDraft.associationHash)
      || !/^sha256:[a-f0-9]{64}$/.test(taskDraft.taskBindingHash)) fail('task association mismatch');
    const token = config.accessToken;
    this.client = new HttpClient({ ...config, accessToken: async () => {
      this.check(); const value = typeof token === 'function' ? await token() : token; this.check();
      if (!value?.trim()) fail('selected bearer unavailable');
      return value;
    } });
  }
  private now(): number {
    const value = this.clock();
    if (!Number.isFinite(value) || value < this.lastElapsed) fail('elapsed clock mismatch');
    this.lastElapsed = value;
    return value;
  }
  private check(): void {
    if (this.disposed) fail('disposed');
    this.lifetime.signal.throwIfAborted();
    assertSynchronousGuard(this.lifetime.assertCurrent);
    assertSynchronousGuard(this.sourceCurrent);
  }
  retireFacts(): void { this.generation++; this.active?.abort(new Error('Source task candidate retired')); this.active = undefined; }
  dispose(): void { this.disposed = true; this.retireFacts(); }

  async qualifySaved(input: SavedResponseDraft, lifetime: CompletionLifetime): Promise<HydratedEvaluationCandidate> {
    this.retireFacts();
    const generation = this.generation;
    const active = new AbortController(); this.active = active;
    const operation = new AbortController();
    const timer = setTimeout(() => operation.abort(new Error('native-facts-deadline')), NATIVE_SOURCE_OPERATION_MILLISECONDS);
    const signal = AbortSignal.any([this.lifetime.signal, lifetime.signal, active.signal, operation.signal]);
    try {
      return await abortable(signal, (async () => {
        const check = () => { signal.throwIfAborted(); this.check(); assertSynchronousGuard(lifetime.assertCurrent);
          if (generation !== this.generation) fail('candidate retired'); };
        check();
        const started = this.now();
        const saved = structuredClone(input);
        const { selection, definition, taskDraft, subjectRef, identity, formVersionHash } = this.pins;
        const evidence = saved.evidence;
        if (!evidence.taskDraft || evidence.taskDraft.version !== taskDraft.version
          || evidence.taskDraft.associationHash !== taskDraft.associationHash || evidence.taskDraft.taskBindingHash !== taskDraft.taskBindingHash
          || evidence.subject_ref !== subjectRef || saved.actor.id !== subjectRef || saved.draftKey.subjectRef !== subjectRef
          || evidence.form_version_id !== selection.formVersionId || evidence.status !== 'in_progress'
          || evidence.draft_id !== saved.draft.id || evidence.draft_version !== saved.draft.version
          || !saved.draft.id.trim() || ['.', '..'].includes(saved.draft.id) || !Number.isSafeInteger(saved.draft.version) || saved.draft.version < 1
          || saved.draftKey.formUrl !== selection.definitionUrl || saved.draftKey.formVersion !== selection.definitionVersion
          || saved.response.definitionUrl !== selection.definitionUrl || saved.response.definitionVersion !== selection.definitionVersion
          || !equal(saved.response, evidence.canonical_response) || !equal(saved.response.data, evidence.draft_state)
          || await hash(definition) !== selection.definitionHash) fail('saved candidate binding mismatch');
        const entries = Object.entries(definition.instances ?? {}).filter(([, value]) => typeof value.source === 'string');
        const required = selection.requiredSources;
        if (new Set(required).size !== required.length || entries.length !== required.length
          || entries.some(([name, value]) => !name.trim() || !required.includes(value.source!) || value.readonly === false)
          || new Set(entries.map(([, value]) => value.source)).size !== required.length) fail('selected source coverage mismatch');
        const sources = Object.fromEntries(entries.map(([name, value]) => [name, value.source!]));
        const candidateHash = await hash(saved.response);
        check();
        const raw = await this.client.postJsonWithBytes<unknown>(`/drafts/${encodeURIComponent(saved.draft.id)}/evaluation-instances`,
          { draftVersion: saved.draft.version, candidateHash }, { signal, assertCurrent: check, assertBeforeDispatch: check,
            successStatuses: [200], requireJson: true, requireNoStore: true, timeoutMs: NATIVE_SOURCE_OPERATION_MILLISECONDS, maxResponseBytes: 2 * 1024 * 1024 });
        check();
        // Task compositions use Source's strict TOP2/receipt3 family; legacy
        // hydration keeps its unchanged TOP1 decoder and proof requirements.
        const mixed = raw.value !== null && typeof raw.value === 'object' && !Array.isArray(raw.value)
          && Object.hasOwn(raw.value, 'version') && (raw.value as { version: unknown }).version === 2;
        const decoded = mixed ? decodeMixedHydration(raw.value) : decodeEvaluationHydrationWire(raw.value);
        const view = snapshotFiniteJson(decoded) as unknown as EvaluationHydrationWire | MixedHydrationWire;
        const owner = view.owner;
        if (!equal(view.scope, selection.scope) || !equal(view.selection, selection) || view.formVersionHash !== formVersionHash
          || view.draftId !== saved.draft.id || view.draftVersion !== saved.draft.version || view.candidateHash !== candidateHash
          || !equal(view.sources, sources) || owner.subjectRef !== subjectRef || !owner.authenticated
          || owner.authenticated.subjectRef !== subjectRef || owner.authenticated.sessionId !== owner.sessionId
          || owner.authenticated.issuer !== identity.issuer || owner.authenticated.subject !== identity.subject
          || owner.authenticated.clientId !== identity.clientId) fail('returned candidate binding mismatch');
        const requestHash = await hash({ operation: 'hydrate', scope: selection.scope, owner, selection,
          formVersionHash, draftId: saved.draft.id, draftVersion: saved.draft.version, candidateHash, sources });
        if (view.requestHash !== requestHash || view.results.length !== entries.length) fail('request binding mismatch');
        const names = new Set<string>();
        for (const result of view.results) {
          if (!Object.hasOwn(sources, result.instanceName) || sources[result.instanceName] !== result.sourceRef
            || names.has(result.instanceName)) fail('result coverage mismatch');
          names.add(result.instanceName);
          if (result.status === 'qualified' && await hash(result.data) !== result.dataHash) fail('result data digest mismatch');
        }
        // Actual attachment ownership and bytes remain Source's task-authorized operation.
        // The independently selected verifier checks original task-origin proof and custody;
        // a qualified-looking response cannot bypass a missing verifier.
        const qualified = view.results.some(result => result.status === 'qualified');
        let deadline = Infinity;
        if (qualified) {
          if (!view.providerReceipt || !this.verifier) fail('task-origin proof verifier unavailable');
          const proof = await abortable(signal, this.verifier({ view, saved, hydrationBytes: raw.utf8Bytes.slice() }, { signal, assertCurrent: check }));
          if (!Number.isSafeInteger(proof.validForMilliseconds) || proof.validForMilliseconds <= 0 || !Number.isFinite(started + proof.validForMilliseconds)) fail('original proof validity unavailable');
          deadline = started + proof.validForMilliseconds;
        }
        let retired: Error | undefined;
        let observedRemaining = Infinity;
        const current = () => {
          if (retired) throw retired;
          try { check(); observedRemaining = deadline - this.now(); if (observedRemaining <= 0) fail('original proof expired'); }
          catch (error) { retired = error instanceof Error ? error : new Error('Source task candidate retired'); throw retired; }
        };
        current();
        return Object.freeze({ view, assertCurrent: current, remainingMilliseconds: () => { current(); return observedRemaining; }, assertReady: () => {
          current(); if (view.results.some(result => result.status !== 'qualified')) fail('selected sources pending or unavailable');
        } });
      })());
    } finally { clearTimeout(timer); }
  }
}

/** The pinned Definition selects whether external candidate facts are needed. */
export function taskRequiresExternalHydration(definition: FormDefinition): boolean {
  const declarations = Object.values(definition.instances ?? {}).filter(instance => Object.hasOwn(instance, 'source'));
  if (declarations.some(instance => typeof instance.source !== 'string' || !instance.source.trim()))
    fail('invalid authored source declaration');
  return declarations.length > 0;
}

/** Validate every operator selection before Source launch creates a durable draft. */
export function assertTaskHydrationSelection(config: Omit<HttpTaskCandidateHydrationConfig, 'taskDraft'>): void {
  const headers = config.tenantBinding && tenantScopeHeaders(config.tenantBinding);
  const { selection, definition, formVersionHash, subjectRef, identity } = config;
  const entries = Object.entries(definition.instances ?? {}).filter(([, value]) => typeof value.source === 'string');
  if (new Set(selection.requiredSources).size !== selection.requiredSources.length || entries.length !== selection.requiredSources.length
    || entries.some(([name, value]) => !name.trim() || !selection.requiredSources.includes(value.source!) || value.readonly === false)
    || new Set(entries.map(([, value]) => value.source)).size !== selection.requiredSources.length) fail('selected source coverage mismatch');
  if (!headers || headers['x-formspec-tenant-id'] !== selection.scope.tenant_id
    || headers['x-formspec-workspace-id'] !== selection.scope.workspace_id
    || headers['x-formspec-environment-id'] !== selection.scope.environment_id
    || headers['x-formspec-cell-id'] !== selection.scope.cell_id
    || definition.url !== selection.definitionUrl || definition.version !== selection.definitionVersion
    || ![subjectRef, identity.issuer, identity.subject, selection.formId, selection.formVersionId].every(value => typeof value === 'string' && value.trim())
    || !/^sha256:[a-f0-9]{64}$/.test(formVersionHash) || !/^sha256:[a-f0-9]{64}$/.test(selection.definitionHash)
    || !(identity.clientId === null || typeof identity.clientId === 'string' && identity.clientId.trim())
    || !config.accessToken) fail('explicit owner or publication selection mismatch');
}
