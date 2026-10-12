import { snapshotNativeCurrentCheck } from './native-current-check.ts';
import { MixedProofWorkerClient, type MixedProofWorkerConfig } from '../source-worker/general-client.ts';
import { decodeBoundedProofJson } from '../source-worker/wire.ts';
import { HttpMixedProofReader } from './mixed-proof-reader.ts';
import { decodeMixedHydration } from './mixed-proof-wire.ts';
import { abortable } from '../../shared/abortable.ts';
import canonicalize from 'canonicalize';
import type { FormDefinition } from '../../ports/definition-source.ts';
import type { EvaluationProviderRegistration, HydratedEvaluationCandidate } from '../../ports/evaluation-hydration.ts';
import type { InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
import type { HydrateScreenerCandidate, ScreenerHydration } from '../../ports/screener-hydration.ts';
import type { ScreenerSelection } from '../../ports/screener-retention.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { InitialMixedProofWorkerClient, type InitialProofWorkerConfig } from '../source-worker/client.ts';
import type { HttpPublishedDefinition } from './definition-source.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import { HttpInitialMixedProofReader } from './initial-mixed-proof-reader.ts';
import { decodeInitialMixedHydration } from './initial-mixed-proof-wire.ts';
import { computeJcsSha256Digest as hash } from './response-action-ledger.ts';
import { freezeWireJson, requireWireJson } from './wire-json.ts';

export interface NativeScreenerHydrationFactoryContext {
  readonly source: HttpClientConfig;
  readonly definition: FormDefinition;
  readonly publication: HttpPublishedDefinition;
  readonly selection: ScreenerSelection;
  readonly selectionHash: string;
  readonly compositionRegistrationHash?: string;
}
export type NativeScreenerHydrationFactory = (context: NativeScreenerHydrationFactoryContext) => ScreenerHydration;
interface MixedScreenerHydrationBase extends NativeScreenerHydrationFactoryContext {
  /** Complete pre-sign Source publication selected independently of returned proof packets. */
  readonly formVersion: Readonly<Record<string, unknown>>;
  /** Owning public registration selected before any candidate transport. */
  readonly registration: EvaluationProviderRegistration;
  readonly monotonicNow?: () => number;
  readonly utcNow?: () => string;
  /** Deployment authority may retire publication/registration/module selection. */
  readonly assertCurrent: () => void;
}
export type HttpInitialMixedScreenerHydrationConfig = MixedScreenerHydrationBase & (
  | { readonly worker: InitialProofWorkerConfig; readonly generalWorker?: never }
  | { readonly generalWorker: MixedProofWorkerConfig; readonly worker?: never }
);
const equal = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
function fail(detail: string): never { throw new Error(`Source initial mixed ${detail}`); }

/** Composes maintained transport and Source-owned verification; contains no mapping rules. */
export class HttpInitialMixedScreenerHydration implements ScreenerHydration {
  private readonly config: HttpInitialMixedScreenerHydrationConfig;
  private readonly client: HttpClient;
  private readonly reader?: HttpInitialMixedProofReader;
  private readonly worker?: InitialMixedProofWorkerClient;
  private readonly generalWorker?: MixedProofWorkerClient;
  private readonly mixedReader?: HttpMixedProofReader;
  private readonly wholeMilliseconds: number;
  private readonly now: () => number;
  private readonly utc: () => string;
  private generation = 0;
  private active?: AbortController;
  private disposed = false;
  constructor(config: HttpInitialMixedScreenerHydrationConfig) {
    requireWireJson({ formVersion: config.formVersion, registration: config.registration, selection: config.selection });
    if (!!config.worker === !!config.generalWorker) fail('exactly one verifier selection required');
    const worker = config.generalWorker ?? config.worker!;
    this.wholeMilliseconds = worker.wholeOperationMilliseconds;
    this.config = { ...config, assertCurrent: config.assertCurrent.bind(config),
      ...(config.generalWorker ? { generalWorker: { ...config.generalWorker } } : { worker: { ...config.worker! } }), definition: structuredClone(config.definition), publication: structuredClone(config.publication),
      formVersion: structuredClone(config.formVersion), registration: structuredClone(config.registration), selection: structuredClone(config.selection) } as HttpInitialMixedScreenerHydrationConfig;
    freezeWireJson(this.config.formVersion); freezeWireJson(this.config.registration); freezeWireJson(this.config.selection);
    this.now = config.monotonicNow?.bind(config) ?? (() => performance.now());
    this.utc = config.utcNow?.bind(config) ?? (() => new Date().toISOString());
    this.client = new HttpClient(config.source);
    if (config.generalWorker) {
      this.generalWorker = new MixedProofWorkerClient({ ...config.generalWorker, monotonicNow: this.now });
      this.mixedReader = new HttpMixedProofReader(config.source);
    } else {
      this.reader = new HttpInitialMixedProofReader({ ...config.source, monotonicNow: this.now,
        limits: { wholeOperationMilliseconds: worker.wholeOperationMilliseconds, aggregateProofWireBytes: 50 * 1024 * 1024 } });
      this.worker = new InitialMixedProofWorkerClient({ ...config.worker!, monotonicNow: this.now });
    }
  }
  retireFacts(): void { this.generation++; this.active?.abort(); this.active = undefined; this.worker?.retireFacts(); this.generalWorker?.retireFacts(); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.retireFacts(); this.worker?.dispose(); this.generalWorker?.dispose(); }
  async hydrate(input: HydrateScreenerCandidate): Promise<HydratedEvaluationCandidate> {
    this.retireFacts();
    if (this.disposed) fail('disposed');
    const generation = this.generation, active = new AbortController(); this.active = active;
    const parentSignal = input.signal; const callerCurrent = input.assertCurrent.bind(input);
    const signal = AbortSignal.any([parentSignal, active.signal]);
    const startedMonotonic = this.now();
    let lastMonotonic = startedMonotonic;
    let completedGeneral = false;
    let retired: unknown;
    const check = () => {
      if (retired !== undefined) throw retired;
      try {
        signal.throwIfAborted();
        if (this.disposed || generation !== this.generation) fail('retired');
        const now = this.now();
        if (!Number.isFinite(now) || !Number.isFinite(startedMonotonic) || now < lastMonotonic
          || (!completedGeneral && now - startedMonotonic >= this.wholeMilliseconds)) fail('whole deadline expired');
        lastMonotonic = now;
        assertSynchronousGuard(callerCurrent); assertSynchronousGuard(this.config.assertCurrent);
      } catch (error) { retired = error instanceof Error ? error : new Error('Source initial mixed retired'); active.abort(retired); throw retired; }
    };
    check();
    const timer = setTimeout(() => active.abort(new Error('Source initial mixed whole deadline expired')), this.wholeMilliseconds);
    const clearDeadline = () => clearTimeout(timer); signal.addEventListener('abort', clearDeadline, { once: true });
    try {
      const selected = this.config.selection.evaluationSelection;
      // Retention and association are port-issued current authority, independent of hydration/proof responses.
      const { saved, run: retained, association, nativeCurrentCheck: selectedCheck, identity } = structuredClone({ saved: input.saved, run: input.run, association: input.association, nativeCurrentCheck: input.nativeCurrentCheck, identity: input.identity });
      const owner = retained.run.owner;
      const nativeCurrentCheck = selectedCheck === undefined ? undefined : snapshotNativeCurrentCheck(selectedCheck);
      if (nativeCurrentCheck && (!this.generalWorker || association !== undefined || saved.response.authoredSignatures?.length !== 1
        || nativeCurrentCheck.selectionHash !== retained.run.selectionHash || nativeCurrentCheck.runId !== retained.run.runId
        || nativeCurrentCheck.runRevision !== retained.run.revision)) fail('current check selection mismatch');
      if (!nativeCurrentCheck && (!association || !equal(association.scope, selected.scope) || !equal(owner, association.owner)
        || association.selectionHash !== this.config.selectionHash || association.runId !== retained.run.runId
        || association.runRevision !== retained.run.revision || association.evidenceHash !== retained.run.evidenceHash
        || association.draftId !== saved.draft.id || association.draftVersion !== saved.draft.version)) fail('original association mismatch');
      const publication = this.config.publication, formVersion = this.config.formVersion;
      if (!equal(retained.selection, this.config.selection) || retained.run.selectionHash !== this.config.selectionHash
        || retained.acceptance?.qualification.status !== 'ready' || retained.run.qualification.status !== 'ready'
        || !equal(retained.run.scope, selected.scope) || owner.authenticated.issuer !== identity.issuer
        || owner.authenticated.subject !== identity.subject || owner.authenticated.clientId !== identity.clientId
        || owner.subjectRef !== owner.authenticated.subjectRef || owner.sessionId !== owner.authenticated.sessionId
        || saved.actor.id !== owner.subjectRef || saved.evidence.subject_ref !== owner.subjectRef
        || saved.draftKey.subjectRef !== owner.subjectRef || saved.evidence.status !== 'in_progress'
        || saved.draftKey.formUrl !== selected.definitionUrl || saved.draftKey.formVersion !== selected.definitionVersion
        || saved.response.definitionUrl !== selected.definitionUrl || saved.response.definitionVersion !== selected.definitionVersion
        || saved.evidence.form_version_id !== selected.formVersionId || saved.evidence.draft_id !== saved.draft.id
        || saved.evidence.draft_version !== saved.draft.version || !equal(saved.response, saved.evidence.canonical_response)
        || !equal(saved.response.data, saved.evidence.draft_state) || !Number.isSafeInteger(saved.draft.version) || saved.draft.version < 1
        || !saved.draft.id || ['.', '..'].includes(saved.draft.id)
        || publication.form_id !== selected.formId || publication.form_version_id !== selected.formVersionId
        || publication.definition_hash !== selected.definitionHash || !equal(publication.definition, this.config.definition)
        || formVersion.form_id !== selected.formId || formVersion.form_version_id !== selected.formVersionId
        || formVersion.definition_url !== selected.definitionUrl || formVersion.definition_version !== selected.definitionVersion
        || formVersion.definition_hash !== selected.definitionHash || formVersion.status !== 'active'
        || typeof formVersion.definition_json !== 'string' || !equal(JSON.parse(formVersion.definition_json), this.config.definition)
        || this.config.compositionRegistrationHash !== this.config.registration.registrationHash) fail('independent authority mismatch');
      const entries = Object.entries(this.config.definition.instances ?? {}).filter(([, instance]) =>
        typeof instance.source === 'string');
      if (new Set(selected.requiredSources).size !== selected.requiredSources.length || entries.length !== selected.requiredSources.length
        || new Set(entries.map(([, instance]) => instance.source)).size !== entries.length
        || entries.some(([name, instance]) => !name.trim() || instance.readonly === false || !selected.requiredSources.includes(instance.source!))) fail('source inventory mismatch');
      const sources = Object.fromEntries(entries.map(([name, instance]) => [name, instance.source!]));
      const candidateHash = await abortable(signal, hash(saved.response)); check();
      const unsigned = structuredClone(saved.response); delete unsigned.authoredSignatures;
      const signedBaseHash = nativeCurrentCheck ? await abortable(signal, hash(unsigned)) : undefined;
      const formVersionHash = await abortable(signal, hash(formVersion)); check();
      if ((association && candidateHash !== association.candidateHash) || formVersionHash !== this.config.selection.formVersionHash
        || await abortable(signal, hash(this.config.selection)) !== this.config.selectionHash || await abortable(signal, hash(this.config.definition)) !== selected.definitionHash) fail('selected digest mismatch');
      check();
      // Maintained Source EvaluationRequestBinding preimage, using the maintained JCS digest utility.
      const binding = { operation: 'hydrate' as const, scope: selected.scope, owner, selection: selected, formVersionHash,
        draftId: saved.draft.id, draftVersion: saved.draft.version, candidateHash, sources };
      const request: InitialNativeRequest = { operation: 'hydrate', scope: selected.scope, owner, selection: selected,
        formVersion, draftId: saved.draft.id, draftVersion: saved.draft.version, canonicalResponse: { ...saved.response },
        candidateHash, sources, requestHash: await abortable(signal, hash(binding)) };
      check(); freezeWireJson(request);
      const hydration = await this.client.postJsonWithBytes<unknown>(`/drafts/${encodeURIComponent(saved.draft.id)}/evaluation-instances`,
        { draftVersion: saved.draft.version, candidateHash, ...(nativeCurrentCheck ? { nativeCurrentCheck } : {}) }, { signal, assertCurrent: check, timeoutMs: Math.max(1, Math.min(10_000, Math.ceil(this.wholeMilliseconds - (this.now() - startedMonotonic)))),
          maxResponseBytes: 2 * 1024 * 1024, successStatuses: [200], requireJson: true, requireNoStore: true });
      check();
      let view: HydratedEvaluationCandidate['view'];
      let proofCurrent: () => void;
      let refreshRequired: (() => boolean) | undefined;
      if (this.generalWorker) {
        const currentAt = this.utc(); const currentAtMonotonic = this.now(); check();
        const proof = await this.generalWorker.verify({ request, registration: this.config.registration, ...(nativeCurrentCheck ? { nativeCurrentCheck } : {}) }, async (index, lifetime) => {
          const bundle = await this.mixedReader!.readAll(hydration, request, index, lifetime); check();
          const parsed = decodeBoundedProofJson(bundle.proofIndexBytes) as { references: {
            native?: Record<string, { run: unknown; association: unknown; snapshot: { selection: unknown; selectionHash: string; formVersion: unknown } }>;
            nativeCurrentChecks?: Record<string, { run: unknown; snapshot: { selection: unknown; selectionHash: string; formVersion: unknown };
              original: { association: { draftId: string; draftVersion: number; candidateHash: string; owner: unknown; scope: unknown; selectionHash: string };
                snapshot: { selection: unknown; selectionHash: string; formVersion: unknown } } }>;
          } };
          if (nativeCurrentCheck) {
            const records = Object.entries(parsed.references.nativeCurrentChecks ?? {}).filter(([name]) => request.sources[name] === this.config.selection.sourceRef);
            const record = records[0]?.[1]; const original = record?.original;
            if (records.length !== 1 || !record || !original || !equal(record.run, retained.run)
              || !equal(record.snapshot.selection, this.config.selection) || record.snapshot.selectionHash !== this.config.selectionHash
              || !equal(record.snapshot.formVersion, formVersion) || !equal(original.snapshot.selection, this.config.selection)
              || original.snapshot.selectionHash !== this.config.selectionHash || !equal(original.snapshot.formVersion, formVersion)
              || original.association.draftId !== saved.draft.id
              || !(original.association.draftVersion === saved.draft.version && original.association.candidateHash === candidateHash
                || original.association.draftVersion + 1 === saved.draft.version && original.association.candidateHash === signedBaseHash
                  && saved.response.extensions?.['x-formspec-signing-content']?.draftVersion === original.association.draftVersion) || !equal(original.association.owner, owner)
              || !equal(original.association.scope, selected.scope) || original.association.selectionHash !== this.config.selectionHash
              || Object.keys(parsed.references.native ?? {}).some(name => request.sources[name] === this.config.selection.sourceRef)) fail('current native custody mismatch');
          } else {
            const native = Object.entries(parsed.references.native ?? {}).filter(([name]) => request.sources[name] === this.config.selection.sourceRef);
            if (native.length !== 1 || !equal(native[0][1].run, retained.run) || !equal(native[0][1].association, association)
              || !equal(native[0][1].snapshot.selection, this.config.selection)
              || native[0][1].snapshot.selectionHash !== this.config.selectionHash
              || !equal(native[0][1].snapshot.formVersion, formVersion)) fail('original native custody mismatch');
          }
          return bundle;
        }, { signal, assertCurrent: check, startedMonotonic, currentAt, currentAtMonotonic }); check(); proof.assertCurrent();
        view = decodeMixedHydration(decodeBoundedProofJson(hydration.utf8Bytes));
        proofCurrent = proof.assertCurrent;
        refreshRequired = proof.refreshRequired;
      } else {
      const bundle = await this.reader!.readAll(hydration, request, { signal, assertCurrent: check, startedMonotonic }); check();
      const native = bundle.proofs.find(proof => proof.decoded.kind === 'native')?.decoded;
      if (!native || native.kind !== 'native' || !equal(native.records.run, retained.run) || !equal(native.records.association, association)
        || !equal(native.records.snapshot.selection, this.config.selection) || native.records.snapshot.selectionHash !== this.config.selectionHash
        || !equal(native.records.snapshot.formVersion, formVersion)) fail('original native custody mismatch');
      const currentAt = this.utc(); const currentAtMonotonic = this.now(); check();
      const proof = await this.worker!.verify({ request, registration: this.config.registration }, bundle,
        { signal, assertCurrent: check, startedMonotonic, currentAt, currentAtMonotonic }); check(); proof.assertCurrent();
      view = decodeInitialMixedHydration(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bundle.hydrationBytes)));
      proofCurrent = proof.assertCurrent;
      }
      check(); proofCurrent();
      completedGeneral = !!this.generalWorker;
      return Object.freeze({ view, ...(nativeCurrentCheck ? { nativeCurrentCheck } : {}), ...(refreshRequired ? { refreshRequired: () => { check(); return refreshRequired!(); } } : {}), assertCurrent: () => { check(); proofCurrent(); },
        assertReady: () => { check(); proofCurrent(); if (view.results.some(result => result.status !== 'qualified')) fail('required source unavailable'); } });
    } catch (error) { active.abort(error); throw error; }
    finally { clearTimeout(timer); signal.removeEventListener('abort', clearDeadline); }
  }
}
