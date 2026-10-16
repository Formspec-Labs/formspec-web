import { isRecord } from '../../shared/is-record.ts';
import canonicalize from 'canonicalize';
import type { FormDefinition } from '@formspec-org/types';
import type { EvaluationHydrationResult, EvaluationHydrationWire, NativeScreenerMappingReceipt } from '../../ports/evaluation-hydration.ts';
import type { HydratedEvaluationCandidate } from '../../ports/evaluation-hydration.ts';
import type { HydrateScreenerCandidate, ScreenerHydration } from '../../ports/screener-hydration.ts';
import type { ScreenerSelection } from '../../ports/screener-retention.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import { computeJcsSha256Digest as hash } from './response-action-ledger.ts';
import { decodeEvaluationHydrationWire } from './evaluation-hydration-wire.ts';
import { hydrationInstant as clock, rawUtf8Hash as rawHash, verifyComposedSources } from './evaluation-composition.ts';

export interface HttpScreenerHydrationConfig extends HttpClientConfig {
  readonly selection: ScreenerSelection;
  readonly selectionHash: string;
  readonly definition: FormDefinition;
  /** Independent Source composition policy pin; absence retains legacy native-only qualification. */
  readonly compositionRegistrationHash?: string;
  /** Trusted elapsed-time clock, not an asserted Source business clock. Defaults to performance.now. */
  readonly monotonicNow?: () => number;
}
const equal = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
function fail(detail: string): never { throw new Error(`Source Screener hydration ${detail}`); }
const object = (value: unknown): Record<string, unknown> => isRecord(value) ? value : fail('object mismatch');

/** Independently pinned native/composed sources; legacy HTTP remains decoded without qualification. */
export class HttpScreenerHydration implements ScreenerHydration {
  private readonly client: HttpClient;
  private readonly selection: ScreenerSelection;
  private readonly selectionHash: string;
  private readonly definition: FormDefinition;
  private readonly monotonicNow: () => number;
  private readonly compositionRegistrationHash?: string;
  constructor(config: HttpScreenerHydrationConfig) {
    this.selection = structuredClone(config.selection); this.selectionHash = config.selectionHash;
    this.compositionRegistrationHash = config.compositionRegistrationHash;
    if (this.compositionRegistrationHash !== undefined && !/^sha256:[0-9a-f]{64}$/.test(this.compositionRegistrationHash)) fail('composition pin mismatch');
    this.definition = structuredClone(config.definition); this.monotonicNow = config.monotonicNow ?? (() => performance.now());
    const scope = this.selection.evaluationSelection.scope;
    const headers = config.tenantBinding && tenantScopeHeaders(config.tenantBinding);
    if (!headers || headers['x-formspec-tenant-id'] !== scope.tenant_id || headers['x-formspec-workspace-id'] !== scope.workspace_id
      || headers['x-formspec-environment-id'] !== scope.environment_id || headers['x-formspec-cell-id'] !== scope.cell_id
      || !/^sha256:[0-9a-f]{64}$/.test(this.selection.instanceMappingHash ?? '')) fail('selection scope mismatch');
    this.client = new HttpClient(config);
  }
  async hydrate(input: HydrateScreenerCandidate): Promise<HydratedEvaluationCandidate> {
    if (input.nativeCurrentCheck !== undefined) fail('current checks require the selected mixed proof verifier');
    const { signal, assertCurrent } = input;
    const check = () => { signal.throwIfAborted(); assertCurrent(); };
    check();
    // Anchor before hashing, credentials and transport: network time never extends a quoted proof.
    const started = this.monotonicNow();
    if (!Number.isFinite(started)) fail('elapsed clock mismatch');
    const { saved, run: viewRun, association, identity } = structuredClone({ saved: input.saved, run: input.run,
      association: input.association, identity: input.identity });
    const run = viewRun.run; const selected = this.selection.evaluationSelection; const owner = run.owner;
    if (!owner.authenticated || owner.authenticated.issuer !== identity.issuer || owner.authenticated.subject !== identity.subject
      || owner.authenticated.clientId !== identity.clientId || owner.subjectRef !== owner.authenticated.subjectRef
      || owner.sessionId !== owner.authenticated.sessionId || !equal(owner, association.owner) || !equal(run.scope, selected.scope)
      || !equal(association.scope, selected.scope) || !equal(viewRun.selection, this.selection)
      || run.selectionHash !== this.selectionHash || association.selectionHash !== this.selectionHash
      || viewRun.acceptance?.qualification.status !== 'ready' || run.qualification.status !== 'ready'
      || association.runId !== run.runId || association.runRevision !== run.revision || association.evidenceHash !== run.evidenceHash
      || saved.actor.id !== owner.subjectRef || saved.evidence.subject_ref !== owner.subjectRef
      || saved.draftKey.formUrl !== selected.definitionUrl || saved.draftKey.formVersion !== selected.definitionVersion
      || saved.response.definitionUrl !== selected.definitionUrl || saved.response.definitionVersion !== selected.definitionVersion
      || !equal(saved.response.data, saved.evidence.draft_state)
      || saved.evidence.form_version_id !== selected.formVersionId || saved.evidence.status !== 'in_progress'
      || saved.evidence.draft_id !== saved.draft.id || saved.evidence.draft_version !== saved.draft.version
      || !equal(saved.response, saved.evidence.canonical_response) || association.draftId !== saved.draft.id
      || association.draftVersion !== saved.draft.version || !Number.isSafeInteger(saved.draft.version) || saved.draft.version < 1
      || !saved.draft.id || ['.', '..'].includes(saved.draft.id) || this.definition.url !== selected.definitionUrl
      || this.definition.version !== selected.definitionVersion) fail('local candidate binding mismatch');
    // Source verifies signed snapshots; every local and returned binding covers the complete Response.
    const candidateHash = await hash(saved.response);
    const { evidenceHash, ...runPreimage } = run;
    if (candidateHash !== association.candidateHash || await hash(this.selection) !== this.selectionHash
      || await hash(this.definition) !== selected.definitionHash || await hash(runPreimage) !== evidenceHash
      || await hash(run.answers) !== run.answersHash || await hash(run.determination) !== run.determinationHash) fail('local digest mismatch');
    const sources = selectedSources(this.definition, selected.requiredSources);
    const references = attachmentReferences(saved.response.data);
    if (references.length > 16) fail('attachment inventory exceeds limit');
    check();
    const value = await this.client.postJson<unknown>(`/drafts/${encodeURIComponent(saved.draft.id)}/evaluation-instances`,
      { draftVersion: saved.draft.version, candidateHash }, { signal, assertCurrent: check, timeoutMs: 10_000,
        maxResponseBytes: 2 * 1024 * 1024, successStatuses: [200], requireJson: true, requireNoStore: true });
    check();
    const view = decodeEvaluationHydrationWire(value);
    if (!equal(view.scope, selected.scope) || !equal(view.owner, owner) || !equal(view.selection, selected)
      || view.formVersionHash !== this.selection.formVersionHash || view.draftId !== saved.draft.id
      || view.draftVersion !== saved.draft.version || view.candidateHash !== candidateHash || !equal(view.sources, sources)
      || view.results.length !== Object.keys(sources).length) fail('returned candidate binding mismatch');
    const names = new Set<string>();
    for (const result of view.results) {
      if (!Object.hasOwn(sources, result.instanceName) || sources[result.instanceName] !== result.sourceRef || names.has(result.instanceName)) fail('result coverage mismatch');
      names.add(result.instanceName);
    }
    const requestHash = await hash({ operation: 'hydrate', scope: selected.scope, owner, selection: selected,
      formVersionHash: this.selection.formVersionHash, draftId: saved.draft.id, draftVersion: saved.draft.version, candidateHash, sources });
    if (view.requestHash !== requestHash || !equal(await referenceCounts(view.attachmentBindings), await referenceCounts(references))) fail('request or attachment binding mismatch');
    if (this.compositionRegistrationHash && (!view.providerReceipt || !('kind' in view.providerReceipt)
      || view.providerReceipt.kind !== 'composedSources')) fail('selected composition receipt required');
    const qualified = view.results.filter(result => result.status === 'qualified');
    let remaining = Infinity;
    if (view.providerReceipt === null) {
      if (qualified.length) fail('qualified facts lack receipt');
    } else if ('kind' in view.providerReceipt && view.providerReceipt.kind === 'composedSources') {
      remaining = await verifyComposedSources({ view, receipt: view.providerReceipt, registrationHash: this.compositionRegistrationHash, requestHash,
        verifyNative: async (receipt, result) => {
          await this.verifyNativeReceipt(receipt, view, viewRun, association, requestHash);
          await this.verifyNativeResult(receipt, result);
        } });
    } else {
      if (!('kind' in view.providerReceipt) || view.providerReceipt.kind !== 'nativeScreenerMapping') fail('native receipt required');
      const receipt = view.providerReceipt;
      await this.verifyNativeReceipt(receipt, view, viewRun, association, requestHash);
      if (qualified.length !== 1) fail('native qualified result mismatch');
      const result = qualified[0];
      await this.verifyNativeResult(receipt, result);
      const issued = clock(result.issuedAt), expires = clock(result.expiresAt), now = clock(view.qualifiedAt);
      const age = BigInt(receipt.registration.maxEvidenceAgeSeconds) * 1_000_000_000n,
        validity = BigInt(receipt.registration.maxValiditySeconds) * 1_000_000_000n;
      if (issued > now || expires <= now || issued >= expires || now - issued > age || expires - issued > validity) fail('expired or invalid proof');
      const expiryRemaining = expires - now, ageRemaining = age - (now - issued);
      remaining = Math.floor(Number(expiryRemaining < ageRemaining ? expiryRemaining : ageRemaining) / 1_000_000);
    }
    let lastElapsed = 0;
    let retired: Error | undefined;
    let elapsedExpiry = false;
    const remainingMilliseconds = () => {
      if (retired && !elapsedExpiry) throw retired;
      try {
        check(); const elapsed = this.monotonicNow() - started;
        if (!Number.isFinite(elapsed) || elapsed < lastElapsed) fail('elapsed clock mismatch');
        lastElapsed = elapsed; return Math.max(0, remaining - elapsed);
      } catch (error) {
        elapsedExpiry = false; retired = error instanceof Error ? error : new Error('Source Screener hydration context retired');
        throw retired;
      }
    };
    const current = () => {
      if (retired) throw retired;
      if (remainingMilliseconds() === 0) {
        elapsedExpiry = true; retired = new Error('Source Screener hydration expired candidate context'); throw retired;
      }
    };
    current();
    return Object.freeze({ view, assertCurrent: current, remainingMilliseconds, assertReady: () => {
      current(); if (view.results.some(result => result.status !== 'qualified')) fail('required source unavailable');
    } });
  }
  private async verifyNativeResult(receipt: NativeScreenerMappingReceipt, result: EvaluationHydrationResult) {
    if (result.status !== 'qualified' || result.instanceName !== receipt.proof.instanceName
      || result.sourceRef !== this.selection.sourceRef || result.sourceRef !== receipt.proof.sourceRef
      || result.dataHash !== receipt.proof.dataHash || result.evidenceRef !== receipt.proof.evidenceRef
      || clock(result.issuedAt) !== clock(receipt.proof.issuedAt) || clock(result.expiresAt) !== clock(receipt.proof.expiresAt)
      || await hash(result.data) !== result.dataHash) fail('native result mismatch');
  }
  private async verifyNativeReceipt(receipt: NativeScreenerMappingReceipt, view: EvaluationHydrationWire,
    original: HydrateScreenerCandidate['run'], association: HydrateScreenerCandidate['association'], requestHash: string) {
    const descriptor = receipt.registration.publicDescriptor;
    const schema = object(descriptor.outputSchema), budgets = object(descriptor.budgets);
    const { screenerSelectionHash: downstream, ...authority } = descriptor;
    const { receiptHash, ...receiptPreimage } = receipt;
    const proof = receipt.proof;
    if (receipt.requestHash !== requestHash || receiptHash !== await hash(receiptPreimage)
      || receipt.registration.registrationHash !== await hash(descriptor)
      || await hash({ ...authority, purpose: 'formspec.screener.instance.mapping-policy' }) !== this.selection.instanceMappingHash
      || downstream !== this.selectionHash || !equal(descriptor.selection, this.selection.evaluationSelection)
      || descriptor.formVersionHash !== this.selection.formVersionHash || descriptor.providerId !== receipt.registration.providerId
      || descriptor.providerVersion !== receipt.registration.providerVersion || schema.hash !== receipt.registration.outputSchemaHash
      || budgets.maxEvidenceAgeSeconds !== receipt.registration.maxEvidenceAgeSeconds || budgets.maxValiditySeconds !== receipt.registration.maxValiditySeconds
      || typeof schema.document !== 'string' || await rawHash(schema.document) !== schema.hash
      || await hash(descriptor.rules) !== descriptor.rulesHash || descriptor.instanceName !== proof.instanceName
      || descriptor.sourceRef !== proof.sourceRef || proof.sourceRef !== this.selection.sourceRef
      || !equal(proof.association, association) || proof.evidenceHash !== original.run.evidenceHash
      || proof.evidenceRef !== original.run.evidenceRef || clock(proof.issuedAt) !== clock(original.run.evaluatedAt)
      || clock(proof.expiresAt) !== clock(String(object(original.run.determination.validity).validUntil))
      || clock(association!.associatedAt) < clock(proof.issuedAt) || clock(receipt.resolvedAt) < clock(association!.associatedAt)
      || clock(receipt.resolvedAt) > clock(view.qualifiedAt)) fail('native receipt or original policy mismatch');
  }
}
function selectedSources(definition: FormDefinition, required: readonly string[]): Record<string, string> {
  const entries = Object.entries(definition.instances ?? {}).filter(([, instance]) => typeof instance.source === 'string' && required.includes(instance.source));
  if (new Set(required).size !== required.length || entries.length !== required.length
    || new Set(entries.map(([, instance]) => instance.source)).size !== required.length
    || entries.some(([name, instance]) => !name.trim() || instance.readonly === false)) fail('selected Definition sources mismatch');
  return Object.fromEntries(entries.map(([name, instance]) => [name, instance.source!]));
}
function attachmentReferences(data: unknown): unknown[] {
  const pending = [data], found: unknown[] = [];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) pending.push(...value);
    else if (isRecord(value)) {
      const entry = value;
      if (Object.hasOwn(entry, 'contentType') && (Object.hasOwn(entry, 'url') || Object.hasOwn(entry, 'data'))
        || entry.kind === 'attachment-ref' || [entry.uri, entry.url].some(uri => typeof uri === 'string' && /^urn:formspec:attachment:/i.test(uri))) found.push(value);
      else pending.push(...Object.values(entry));
    }
  }
  return found;
}
async function referenceCounts(references: readonly unknown[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const reference of references) { const digest = await hash(reference); counts[digest] = (counts[digest] ?? 0) + 1; }
  return counts;
}
