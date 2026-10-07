import canonicalize from 'canonicalize';
import { extractServiceRequestOutputs, hashSigningContent, planServiceRequest, resolveAuthoredSigningContent, resolveServiceRequest } from '@formspec-org/engine/render';
import { canonicalResponseHandoffBytes } from '@formspec-org/integrity-canonical';
import { decodeCoseSign1WithMethodUri } from '@formspec-org/integrity-cose';
import { targetDefinitionMatches, type FormResponse } from '@formspec-org/types';
import type { DraftKey, DraftStore } from '../../ports/draft-store.ts';
import { ResponseSigningUnresolvedError, type AdmittedResponseAction, type SaveResponseDraftInput, type SavedResponseDraft, type VerifiedDraftEvidence, type PrepareResponseSigningInput, type PreparedResponseSigning, type ResponseSigning, type SignPreparedResponseInput, type SignedResponseSigning } from '../../ports/response-signing.ts';
import { assertUuidV7IdempotencyKey, isUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';
import type { DraftResumeMetadataStore } from '../browser/draft-resume-metadata.ts';
import type { DraftBindingRegistry } from './draft-binding-registry.ts';
import type { HttpClient } from './http-client.ts';

/** All checks use maintained schemas and signed-profile digest implementation injected by the host. */
export interface HttpResponseSigningPolicy {
  validateResponse: (value: unknown) => boolean | Promise<boolean>;
  validateContent: (value: unknown) => boolean;
  signingProfileDigest: (response: FormResponse) => Promise<string>;
  keyId: string;
  now?: () => string;
}

/** Shared by draft edits, Prepare, Sign, Submit and clear; no state getter is exposed. */
export class ResponseSigningScopeFence {
  private readonly generations = new Map<string, number>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly clearing = new Set<string>();

  constructor(readonly scopeFor: (key: DraftKey) => string) {}
  capture(key: DraftKey): number { return this.generations.get(this.scopeFor(key)) ?? 0; }
  /** Retire local authority without deleting drafts or cancelling dispatched requests. */
  invalidate(key: DraftKey): void {
    this.generations.set(this.scopeFor(key), this.capture(key) + 1);
  }
  assertCurrent(key: DraftKey, generation: number): void {
    if (this.capture(key) !== generation || this.clearing.has(this.scopeFor(key))) {
      throw new Error('Draft signing state was cleared or invalidated while an operation was running');
    }
  }
  run<T>(key: DraftKey, operation: (generation: number) => Promise<T>): Promise<T> {
    const scope = this.scopeFor(key);
    if (this.clearing.has(scope) || this.pending.has(scope)) return Promise.reject(new Error('A draft operation is already in progress'));
    const generation = this.capture(key);
    const pending = Promise.resolve().then(() => operation(generation)).then(value => {
      this.assertCurrent(key, generation);
      return value;
    });
    this.pending.set(scope, pending);
    void pending.finally(() => { if (this.pending.get(scope) === pending) this.pending.delete(scope); }).catch(() => {});
    return pending;
  }
  async clear(key: DraftKey, operation: () => Promise<void>): Promise<void> {
    const scope = this.scopeFor(key);
    if (this.clearing.has(scope)) throw new Error('Draft state is already being cleared');
    this.clearing.add(scope);
    this.invalidate(key);
    try {
      await this.pending.get(scope)?.catch(() => {});
      await operation();
    } finally { this.clearing.delete(scope); }
  }
}

interface DraftView {
  draft_id: string;
  form_version_id: string;
  subject_ref: string;
  draft_version: number;
  draft_state: unknown;
  canonical_response: FormResponse;
  status: 'in_progress';
}
interface PreparationContext {
  input: PrepareResponseSigningInput | SaveResponseDraftInput;
  generation: number;
}
interface FrozenAct {
  identity: string;
  input: SignPreparedResponseInput;
  context: PreparationContext;
  candidate: FormResponse;
  version: number;
  result?: SignedResponseSigning;
  pending?: Promise<SignedResponseSigning>;
}
interface PendingMarker { scope: string; operationId: string; draftId: string; version: number }

export interface HttpResponseSigningConfig extends HttpResponseSigningPolicy {
  client: HttpClient;
  drafts: DraftStore;
  bindings: DraftBindingRegistry;
  fence: ResponseSigningScopeFence;
  formIdFor: (key: DraftKey) => string;
  ownerFor: (key: DraftKey) => Promise<{ token?: string; subjectRef: string }>;
  resumeMetadata?: DraftResumeMetadataStore;
}

export class HttpResponseSigning implements ResponseSigning {
  private readonly preparations = new WeakMap<PreparedResponseSigning, PreparationContext>();
  private readonly acts = new Map<string, FrozenAct>();
  constructor(private readonly config: HttpResponseSigningConfig) {
    if (!config.keyId.trim()) throw new Error('Delegated signing key identity is required');
  }

  private readonly saves = new Map<string, { identity: string; scope: string; generation: number; settled: boolean; pending: Promise<SavedResponseDraft> }>();

  saveDraft(input: SaveResponseDraftInput): Promise<SavedResponseDraft> {
    assertUuidV7IdempotencyKey(input.operationId);
    input = structuredClone(input);
    const identity = canonicalize(input)!;
    const generation = this.config.fence.capture(input.draftKey);
    const previous = this.saves.get(input.operationId);
    if (previous) {
      if (previous.identity !== identity) return Promise.reject(new Error('A Save retry must preserve its frozen operation'));
      this.config.fence.assertCurrent(input.draftKey, previous.generation);
      if (previous.settled) return Promise.reject(new Error('This Save operation is retired; start a new explicit act instead of replaying stale readiness'));
      return previous.pending;
    }
    const pending = this.config.fence.run(input.draftKey, async generation => {
      this.refuseUnresolved(input.draftKey);
      if (!input.formId?.trim() || input.formId !== this.config.formIdFor(input.draftKey)) throw new Error('Save publication form id differs from the configured form');
      await this.validateUnsigned(input);
      const context = { input, generation };
      const binding = this.config.bindings.get(input.draftKey);
      const existing = binding ? await this.read(context, binding.draftId) : undefined;
      if (binding && (existing!.draft_version !== binding.draftVersion
        || existing!.canonical_response.authoredSignatures?.length)) throw new Error('Saved draft changed before Save');
      this.qualifySaveAction(input.action, input, binding?.draftId, existing?.draft_version);
      this.current(context);
      const scope = this.config.fence.scopeFor(input.draftKey);
      if (!binding) this.writeCreateMarkers([...this.createMarkers(), { scope, operationId: input.operationId,
        definitionUrl: input.definition.url, definitionVersion: input.definition.version,
        candidateHash: await handoffHash(input.response) }]);
      this.current(context);
      try { await this.config.drafts.save(input.draftKey, input.response); }
      catch (error) { this.current(context); if (!binding) throw error; }
      this.current(context);
      const savedBinding = this.config.bindings.get(input.draftKey);
      if (!savedBinding) throw new ResponseSigningUnresolvedError();
      const saved = await this.read(context, savedBinding.draftId);
      if (saved.draft_version !== (existing ? existing.draft_version + 1 : 1)
        || !same(saved.canonical_response, input.response)) throw new Error('Save differs from the exact saved Response');
      extractServiceRequestOutputs(this.admittedRequest(input.action, input.response), saved);
      const result = await this.savedResult(input.draftKey, saved);
      this.current(context);
      this.config.bindings.put(input.draftKey, { draftId: saved.draft_id, draftVersion: saved.draft_version, response: saved.canonical_response });
      if (!binding) this.writeCreateMarkers(this.createMarkers().filter(marker => marker.scope !== scope));
      return result;
    });
    this.saves.set(input.operationId, { identity, scope: this.config.fence.scopeFor(input.draftKey), generation, settled: false, pending });
    void pending.finally(() => { const entry = this.saves.get(input.operationId); if (entry) entry.settled = true; }).catch(() => {});
    return pending;
  }

  private async validateUnsigned(input: Pick<SaveResponseDraftInput, 'definition' | 'formVersionId' | 'response' | 'draftKey'>): Promise<void> {
    if (!input.formVersionId?.trim() || !input.response.id?.trim()
      || input.response.authoredSignatures?.length || input.response.extensions?.['x-formspec-signing-content']
      || input.response.definitionUrl !== input.definition.url || input.response.definitionVersion !== input.definition.version
      || input.draftKey.formUrl !== input.definition.url || input.draftKey.formVersion !== input.definition.version
      || !await this.config.validateResponse(input.response)) throw new Error('Save requires an unsigned pinned Response');
  }

  private qualifySaveAction(action: Readonly<AdmittedResponseAction>, input: Pick<SaveResponseDraftInput, 'draftKey' | 'response'> & { formId?: string }, id?: string, version?: number): void {
    const request = this.admittedRequest(action, input.response);
    const planned = planServiceRequest(request, { input: { formId: input.formId ?? this.config.formIdFor(input.draftKey), draftId: id, draftVersion: version, frozenResponse: input.response } });
    const path = id ? `/drafts/${encodeURIComponent(id)}`
      : `/runtime/forms/${encodeURIComponent(this.config.formIdFor(input.draftKey))}/drafts`;
    const body = { draft_state: input.response.data, canonical_response: input.response,
      ...(id ? { expected_draft_version: version } : {}) };
    // The physical DraftStore adds only its existing private owner/party credentials on CREATE.
    if (planned.method !== (id ? 'PATCH' : 'POST') || planned.path !== path
      || Object.keys(planned.headers).length || !same(planned.body, body)
      || !same(planned.successStatuses, [200])) throw new Error('Authored Save request differs from the exact private draft operation');
  }

  private admittedRequest(action: Readonly<AdmittedResponseAction>, response: FormResponse) {
    const matches = action.document.actions.filter(item => item.id === action.actionRef);
    const effect = matches[0]?.effects?.[0];
    if (!action.artifactRef?.trim() || !/^sha256:[a-f0-9]{64}$/.test(action.artifactDigest)
      || action.document.scope === 'app' || !targetDefinitionMatches(action.document.targetDefinition, { url: response.definitionUrl, version: response.definitionVersion })
      || matches.length !== 1 || matches[0].effects?.length !== 1 || effect?.type !== 'serviceRequest'
      || effect.requestRef !== action.requestRef || effect.idempotencyKey !== '@invocation.id') throw new Error('Draft operation requires one admitted Response-scoped service request');
    const request = resolveServiceRequest(action.document['x-formspec-runtime'], action.requestRef);
    const allowed = new Set(['/draft_id', '/form_version_id', '/subject_ref', '/draft_version', '/draft_state', '/canonical_response', '/status']);
    if (Object.values(request.outputs ?? {}).some(output => !allowed.has(output.path)
      || (output.exposure && output.exposure !== 'internal' && !['/draft_id', '/form_version_id', '/subject_ref', '/status'].includes(output.path)))) {
      throw new Error('Draft operation declares unsupported outputs');
    }
    return request;
  }

  private async savedResult(key: DraftKey, view: DraftView): Promise<SavedResponseDraft> {
    const evidence: VerifiedDraftEvidence = {
      draft_id: view.draft_id, form_version_id: view.form_version_id, subject_ref: view.subject_ref,
      draft_version: view.draft_version, draft_state: view.draft_state as Record<string, unknown>,
      canonical_response: view.canonical_response, status: view.status,
    };
    return freeze(structuredClone({ draftKey: key, response: view.canonical_response,
      draft: { id: view.draft_id, version: view.draft_version, responseHash: await handoffHash(view.canonical_response) },
      actor: { id: view.subject_ref }, evidence }));
  }

  prepare(input: PrepareResponseSigningInput): Promise<PreparedResponseSigning> {
    input = structuredClone(input);
    return this.config.fence.run(input.draftKey, async generation => {
      this.refuseUnresolved(input.draftKey);
      if (!input.formVersionId || input.response.status !== 'completed' || !input.response.id
        || input.response.authoredSignatures?.length || input.response.extensions?.['x-formspec-signing-content'] || !input.response.displayedLocale
        || input.response.definitionUrl !== input.definition.url || input.response.definitionVersion !== input.definition.version
        || input.draftKey.formUrl !== input.definition.url || input.draftKey.formVersion !== input.definition.version
        || !await this.config.validateResponse(input.response)) throw new Error('Preparation requires a completed unsigned pinned Response');
      const content = resolveAuthoredSigningContent({ ...input, validateContent: this.config.validateContent });
      const binding = this.config.bindings.get(input.draftKey);
      if (!binding || !Number.isSafeInteger(binding.draftVersion)) throw new Error('Preparation requires an existing owned draft handle');
      const context = { input, generation };
      const existing = await this.read(context, binding.draftId);
      if (existing.draft_version !== binding.draftVersion || existing.canonical_response.id !== input.response.id
        || existing.canonical_response.authoredSignatures?.length) {
        throw new Error('Saved draft changed before preparation');
      }
      this.qualifySaveAction(input.action, input, binding.draftId, existing.draft_version);
      try { await this.config.drafts.save(input.draftKey, input.response); }
      catch { this.current(context); }
      this.current(context);
      const saved = await this.read(context, binding.draftId);
      if (saved.draft_version !== existing.draft_version + 1 || !same(saved.canonical_response, input.response)) {
        throw new Error('Preparation differs from the exact saved Response');
      }
      this.config.bindings.put(input.draftKey, { draftId: saved.draft_id, draftVersion: saved.draft_version, response: saved.canonical_response });
      extractServiceRequestOutputs(this.admittedRequest(input.action, input.response), saved);
      const prepared = freeze({ ...await this.savedResult(input.draftKey, saved), content });
      this.current(context);
      this.preparations.set(prepared, context);
      return prepared;
    });
  }

  async sign(input: SignPreparedResponseInput): Promise<SignedResponseSigning> {
    assertUuidV7IdempotencyKey(input.operationId);
    const context = this.preparations.get(input.preparation);
    if (!context) return Promise.reject(new Error('Signing requires this cohort’s frozen preparation'));
    this.current(context);
    input = freeze(structuredClone(input));
    const identity = canonicalize({ scope: this.config.fence.scopeFor(input.preparation.draftKey),
      generation: context.generation, preparation: input.preparation, assent: input.assent, action: input.action });
    if (!identity) return Promise.reject(new Error('Invalid signing operation identity'));
    const activation = this.activations.get(input.operationId);
    if (activation) {
      if (activation.identity !== identity) return Promise.reject(new Error('A signing retry must preserve its frozen act'));
      return activation.pending;
    }
    const previous = this.acts.get(input.operationId);
    if (previous) {
      if (previous.identity !== identity) return Promise.reject(new Error('A signing retry must preserve its frozen act'));
      if (previous.pending) return previous.pending;
    }
    const pending = this.config.fence.run(context.input.draftKey, async () => {
      let act = previous;
      if (!act) {
        this.refuseUnresolved(context.input.draftKey);
        if (input.assent.consentAccepted !== true || !input.assent.signerName.trim()) throw new Error('Actual signer name and consent are required');
        // Capture time and detached act before the first network mutation; retries reuse them.
        const signedAt = (this.config.now ?? (() => new Date().toISOString()))();
        if (!Number.isFinite(Date.parse(signedAt))) throw new Error('Signing time must be RFC3339');
        const version = input.preparation.draft.version + 1;
        const candidate = structuredClone(input.preparation.response);
        candidate.extensions = { ...candidate.extensions, 'x-formspec-signing-content': {
          version: '1.0', draftId: input.preparation.draft.id, draftVersion: version,
          actorRef: input.preparation.actor.id, signerName: input.assent.signerName, signedAt,
          consentAccepted: true, content: input.preparation.content,
          documentHash: await hashSigningContent(input.preparation.content, this.config.validateContent), documentHashAlgorithm: 'sha-256',
        } };
        act = { identity, input: freeze(structuredClone(input)), context, candidate: freeze(candidate), version };
        this.validateAction(act);
        if (!await this.config.validateResponse(candidate)) throw new Error('Signing candidate failed the Response schema');
        this.current(context);
        this.acts.set(input.operationId, act);
        this.mark(act);
      }
      const result = await this.execute(act);
      act.result = result;
      this.unmark(act);
      return result;
    });
    if (previous) previous.pending = pending;
    // The first act is created asynchronously, so join concurrent activation by operation identity.
    this.activations.set(input.operationId, { identity, pending });
    void pending.finally(() => {
      this.activations.delete(input.operationId);
      const act = this.acts.get(input.operationId);
      if (act) act.pending = undefined;
    }).catch(() => {});
    return pending;
  }
  private readonly activations = new Map<string, { identity: string; pending: Promise<SignedResponseSigning> }>();

  clearScope(key: DraftKey): void {
    const scope = this.config.fence.scopeFor(key);
    for (const [id, save] of this.saves) {
      if (save.scope === scope) this.saves.delete(id);
    }
    for (const [id, act] of this.acts) if (this.config.fence.scopeFor(act.context.input.draftKey) === scope) this.acts.delete(id);
    this.writeMarkers(this.markers().filter(marker => marker.scope !== scope));
    this.writeCreateMarkers(this.createMarkers().filter(marker => marker.scope !== scope));
  }
  assertEditable(key: DraftKey): void { this.refuseUnresolved(key); }

  private async execute(act: FrozenAct): Promise<SignedResponseSigning> {
    const { context, input } = act;
    const id = input.preparation.draft.id;
    let saved = await this.read(context, id);
    if (saved.draft_version === act.version + 1) return this.acceptSigned(act, saved);
    if (saved.draft_version === input.preparation.draft.version && same(saved.canonical_response, input.preparation.response)) {
      this.current(context);
      try {
        await this.config.drafts.save(context.input.draftKey, act.candidate);
      } catch {
        this.current(context);
        // A lost mutation reply is reconciled only against this exact frozen candidate.
      }
      saved = await this.read(context, id);
    }
    if (saved.draft_version !== act.version || !same(saved.canonical_response, act.candidate)) {
      throw new Error('Saved signing candidate changed; redisplay and explicit assent are required');
    }
    const planned = this.validateAction(act);
    const owner = await this.config.ownerFor(context.input.draftKey);
    this.current(context);
    let signed: DraftView;
    try {
      signed = await this.config.client.postJson<DraftView>(planned.path, planned.body, {
        headers: { ...planned.headers, ...bearer(owner.token) }, idempotencyKey: input.operationId,
        successStatuses: planned.successStatuses,
      });
    } catch (error) {
      this.current(context);
      const recovered = await this.read(context, id);
      if (recovered.draft_version === act.version + 1) return this.acceptSigned(act, recovered);
      if (recovered.draft_version !== act.version || !same(recovered.canonical_response, act.candidate)) {
        throw new Error('The unresolved signing operation conflicts with the saved draft');
      }
      throw error;
    }
    this.current(context);
    return this.acceptSigned(act, signed);
  }

  private validateAction(act: FrozenAct) {
    const { document, actionRef, requestRef, artifactRef, artifactDigest } = act.input.action;
    const matches = document.actions.filter(action => action.id === actionRef);
    const effect = matches[0]?.effects?.[0];
    if (!artifactRef || !artifactDigest || document.scope === 'app'
      || document.targetDefinition?.url !== act.candidate.definitionUrl || matches.length !== 1
      || matches[0].effects?.length !== 1 || effect?.type !== 'serviceRequest'
      || effect.requestRef !== requestRef || effect.idempotencyKey !== '@invocation.id') throw new Error('Sign requires one admitted Response-scoped service request');
    const request = this.admittedRequest(act.input.action, act.candidate);
    const planned = planServiceRequest(request, { input: {
      draftId: act.input.preparation.draft.id, draftVersion: act.version, frozenResponse: act.candidate,
    } });
    if (planned.method !== 'POST' || !same(planned.successStatuses, [200])
      || planned.path !== `/drafts/${encodeURIComponent(act.input.preparation.draft.id)}/sign`
      || !same(planned.body, { draft_version: act.version, canonical_response: act.candidate })) {
      throw new Error('Authored signing request does not match the exact owned candidate');
    }
    return planned;
  }

  private async read(context: PreparationContext, id: string): Promise<DraftView> {
    const owner = await this.config.ownerFor(context.input.draftKey);
    this.current(context);
    let view: DraftView;
    try { view = await this.config.client.getJson<DraftView>(`/drafts/${encodeURIComponent(id)}`, { headers: bearer(owner.token) }); }
    catch (error) { this.current(context); throw error; }
    this.current(context);
    await this.validateView(context, id, view, owner.subjectRef);
    this.current(context);
    return view;
  }
  private async validateView(context: PreparationContext, id: string, view: DraftView, actor: string): Promise<void> {
    const response = view?.canonical_response;
    if (!view || view.draft_id !== id || view.form_version_id !== context.input.formVersionId
      || view.status !== 'in_progress' || view.subject_ref !== actor || !Number.isSafeInteger(view.draft_version) || view.draft_version < 0
      || !response || !await this.config.validateResponse(response)
      || response.id !== context.input.response.id || response.definitionUrl !== context.input.definition.url
      || response.definitionVersion !== context.input.definition.version || !same(response.data, view.draft_state)) {
      throw new Error('Owned draft has no matching authoritative Response snapshot');
    }
  }
  private async acceptSigned(act: FrozenAct, view: DraftView): Promise<SignedResponseSigning> {
    const { context, candidate } = act;
    await this.validateView(context, act.input.preparation.draft.id, view, act.input.preparation.actor.id);
    extractServiceRequestOutputs(this.admittedRequest(act.input.action, act.candidate), view);
    const response = view.canonical_response;
    const unsigned = structuredClone(response);
    delete unsigned.authoredSignatures;
    const signatures = response.authoredSignatures;
    const signature = signatures?.[0];
    const commitment = candidate.extensions?.['x-formspec-signing-content'];
    const payload = signature?.signedPayload;
    const digest = await this.config.signingProfileDigest(candidate);
    if (view.draft_version !== act.version + 1 || !same(unsigned, candidate) || signatures?.length !== 1
      || !signature || !commitment || signature.signatureProvider !== 'urn:formspec:provider:delegated-response@1'
      || !signature.signatureValue || signature.signerId !== commitment.actorRef || signature.signerName !== commitment.signerName
      || signature.consentAccepted !== true || signature.documentId !== commitment.content.documentId
      || signature.signingIntent !== commitment.content.signingIntent || signature.documentHash !== commitment.documentHash
      || signature.documentHashAlgorithm !== 'sha-256' || signature.consentTextRef !== commitment.content.electronicConsent.textRef
      || signature.consentVersion !== commitment.content.electronicConsent.version || signature.affirmationText !== commitment.content.affirmationText
      || payload?.canonicalization !== 'formspec-response-signing-v1' || payload.digestAlgorithm !== 'sha-256'
      || payload.digest !== digest || payload.responseId !== candidate.id || payload.definitionUrl !== candidate.definitionUrl
      || payload.definitionVersion !== candidate.definitionVersion || payload.signedAt !== commitment.signedAt
      || payload.signingIntent !== commitment.content.signingIntent) throw new Error('Delegated signing evidence differs from the frozen candidate');
    const decoded = decodeCoseSign1WithMethodUri(base64Bytes(signature.signatureValue), 'urn:formspec:sig-method:');
    if (decoded.methodUri !== 'urn:formspec:sig-method:ed25519-cose-sign1@1' || decoded.cose.alg !== -8
      || decoded.cose.payload !== null || decoded.cose.signature.length !== 64
      || !decoded.cose.kid || new TextDecoder('utf-8', { fatal: true }).decode(decoded.cose.kid) !== this.config.keyId) {
      throw new Error('Delegated signing envelope differs from its configured method or key pin');
    }
    this.current(context);
    const result = freeze({ ...act.input.preparation, ...await this.savedResult(context.input.draftKey, view), response,
      verification: { mode: 'delegated-service-key' as const, provider: signature.signatureProvider, keyId: this.config.keyId } });
    this.current(context);
    this.config.bindings.put(context.input.draftKey, { draftId: view.draft_id, draftVersion: view.draft_version, response: result.response });
    return result;
  }
  private current(context: PreparationContext): void { this.config.fence.assertCurrent(context.input.draftKey, context.generation); }
  private createMarkers(): { scope: string; operationId: string; definitionUrl: string; definitionVersion: string; candidateHash: string }[] {
    const value = this.config.resumeMetadata?.read('response-draft-create-operations');
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(marker => !marker || typeof marker.scope !== 'string'
      || typeof marker.operationId !== 'string' || !marker.scope || !isUuidV7IdempotencyKey(marker.operationId)
      || typeof marker.definitionUrl !== 'string' || !marker.definitionUrl.trim()
      || typeof marker.definitionVersion !== 'string' || !marker.definitionVersion.trim()
      || typeof marker.candidateHash !== 'string' || !/^[a-f0-9]{64}$/.test(marker.candidateHash)
      || Object.keys(marker).some(key => !['scope', 'operationId', 'definitionUrl', 'definitionVersion', 'candidateHash'].includes(key)))) throw new ResponseSigningUnresolvedError();
    return value;
  }
  private writeCreateMarkers(markers: { scope: string; operationId: string; definitionUrl: string; definitionVersion: string; candidateHash: string }[]): void {
    if (!this.config.resumeMetadata) throw new ResponseSigningUnresolvedError();
    if (markers.length) this.config.resumeMetadata.write('response-draft-create-operations', markers);
    else this.config.resumeMetadata.remove('response-draft-create-operations');
  }
  private markers(): PendingMarker[] {
    const value = this.config.resumeMetadata?.read('response-signing-operations');
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(marker => !marker || typeof marker.scope !== 'string'
      || typeof marker.operationId !== 'string' || typeof marker.draftId !== 'string' || !Number.isSafeInteger(marker.version))) {
      throw new ResponseSigningUnresolvedError();
    }
    return value;
  }
  private writeMarkers(markers: PendingMarker[]): void {
    if (markers.length) this.config.resumeMetadata?.write('response-signing-operations', markers);
    else this.config.resumeMetadata?.remove('response-signing-operations');
  }
  private refuseUnresolved(key: DraftKey): void {
    const scope = this.config.fence.scopeFor(key);
    if (this.createMarkers().some(marker => marker.scope === scope) || this.markers().some(marker => marker.scope === scope)
      || [...this.acts.values()].some(act => !act.result && this.config.fence.scopeFor(act.context.input.draftKey) === scope)) {
      throw new ResponseSigningUnresolvedError();
    }
  }
  private mark(act: FrozenAct): void {
    this.writeMarkers([...this.markers(), { scope: this.config.fence.scopeFor(act.context.input.draftKey),
      operationId: act.input.operationId, draftId: act.input.preparation.draft.id, version: act.version }]);
  }
  private unmark(act: FrozenAct): void { this.writeMarkers(this.markers().filter(marker => marker.operationId !== act.input.operationId)); }
}

function same(left: unknown, right: unknown): boolean { return canonicalize(left) === canonicalize(right); }
function bearer(token?: string): Record<string, string> { return token ? { authorization: `Bearer ${token}` } : {}; }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
async function handoffHash(response: FormResponse): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', canonicalResponseHandoffBytes(response));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function base64Bytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Signing envelope must be standard base64');
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}
