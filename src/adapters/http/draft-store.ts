import { snapshotWire } from './wire-json.ts';
import { sameResponseDataView } from '../../shared/response-data-view.ts';
import { assertTaskDraftWire } from '../../shared/task-draft-wire.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { ownedDraftResumeSelection } from '../../config/owned-draft-resume.ts';
import type { TaskDraftAssociation } from '../../ports/task-draft.ts';
import canonicalize from 'canonicalize';
import type { DraftKey, DraftReadState, DraftResumeState, DraftStore, FormResponse, OwnedDraftResumeSelection, RecoveredDraftInitialization } from '../../ports/draft-store.ts';
import { copyDraftKey, createDraftBindingRegistry, type DraftBindingRegistry } from './draft-binding-registry.ts';
import { HttpAdapterError, HttpClient, type HttpClientConfig } from './http-client.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';

export interface HttpDraftStoreConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
  formVersionId?: string;
  /** Trusted composition owner, resolved independently of the returned Source view. */
  expectedInitializationOwner?: (key: DraftKey) => Promise<string | undefined> | string | undefined;
  /** Task-owned drafts must never create an ordinary initial draft after losing their binding. */
  requireExistingBinding?: boolean;
  anonymousSessionToken?: string | ((key: DraftKey) => Promise<string | undefined> | string | undefined);
  /**
   * Cohort-supplied shared binding registry (FW-0064). When omitted, the
   * store creates a private one — adopters constructing the adapter
   * standalone (e.g. conformance tests) get the same load/save behavior; the
   * cohort path lets `HttpSubmitTransport` see the same bindings without a
   * public method leak.
   */
  bindingRegistry?: DraftBindingRegistry;
  clearAnonymousSession?: (key: DraftKey) => Promise<void>;
  qualifyReadState?: (key: DraftKey, view: OwnedDraftView, current: () => void) => Promise<DraftReadState>;
}

interface DraftView {
  draft_id: string;
  draft_version?: number;
  draft_state?: Record<string, unknown>;
  canonical_response?: FormResponse;
  is_initialization_only?: boolean;
  isInitializationOnly?: boolean;
}
export interface OwnedDraftView {
  draft_id: string; draft_version: number; draft_state: Record<string, unknown>; canonical_response: FormResponse;
  form_version_id?: string; subject_ref?: string; status?: string;
  taskDraft?: TaskDraftAssociation;
  is_initialization_only?: boolean;
  isInitializationOnly?: boolean;
}

export class HttpDraftStore implements DraftStore {
  readonly readState?: (key: DraftKey, assertCurrent?: () => void) => Promise<DraftReadState | undefined>;
  readonly resumeState?: (key: DraftKey, selection: OwnedDraftResumeSelection, assertCurrent?: () => void) => Promise<DraftResumeState>;
  private readonly client: HttpClient;
  private readonly requireExistingBinding: boolean;
  private readonly formIdResolver: FormIdResolver;
  private readonly formVersionId?: string;
  private readonly expectedInitializationOwner?: HttpDraftStoreConfig['expectedInitializationOwner'];
  private readonly initializations = new Map<string, Promise<RecoveredDraftInitialization>>();
  private readonly anonymousSessionToken?: HttpDraftStoreConfig['anonymousSessionToken'];
  private readonly bindings: DraftBindingRegistry;
  private readonly clearAnonymousSession?: HttpDraftStoreConfig['clearAnonymousSession'];
  private readonly pendingSaves = new Set<Promise<void>>();
  private clearing = 0;
  private generation = 0;
  // Explicit Clear drains existing saves; identity retirement refuses their late dispatch/results.
  private retirementGeneration = 0;

  constructor(config: HttpDraftStoreConfig) {
    this.client = new HttpClient(config);
    this.formVersionId = config.formVersionId;
    this.expectedInitializationOwner = config.expectedInitializationOwner;
    this.requireExistingBinding = config.requireExistingBinding === true;
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
    this.anonymousSessionToken = config.anonymousSessionToken;
    this.bindings = config.bindingRegistry ?? createDraftBindingRegistry();
    this.clearAnonymousSession = config.clearAnonymousSession;
    const qualify = config.qualifyReadState;
    if (qualify) {
      this.readState = (suppliedKey, current = () => {}) => {
        const key = copyDraftKey(suppliedKey);
        return this.read(key, async view => freeze(snapshotWire(await qualify(key, view, current))), current, false);
      };
      this.resumeState = async (suppliedKey, suppliedSelection, current = () => {}) => {
        const key = copyDraftKey(suppliedKey), selection = ownedDraftResumeSelection(suppliedSelection);
        if (!key.subjectRef || key.subjectRef.startsWith('anon:')) throw new Error('Owned draft resume requires an authenticated owner');
        if (selection.initializationOnly && this.requireExistingBinding) throw new Error('Task-owned draft requires its maintained task entry');
        const result = await this.read<DraftResumeState>(key, async view => {
          if (view.taskDraft !== undefined) throw new Error('Task-owned draft requires its maintained task entry');
          return freeze(snapshotWire(await qualify(key, view, current)));
        }, current, false, selection, selection.initializationOnly ? view => Promise.resolve({ kind: 'initialized', initialization: {
          draftId: view.draft_id, draftVersion: view.draft_version, formVersionId: view.form_version_id!,
          subjectRef: view.subject_ref!, isInitializationOnly: true,
        } }) : undefined);
        if (!result) throw new Error('Selected owned draft state unavailable');
        return result;
      };
    }
  }

  async load(key: DraftKey, assertCurrent: () => void = () => {}): Promise<FormResponse | undefined> {
    return this.read(key, view => Promise.resolve(view.canonical_response), assertCurrent);
  }

  async initializeDraft(key: DraftKey, formVersionId?: string): Promise<{ draftId: string; isInitializationOnly: boolean; response?: FormResponse }> {
    key = structuredClone(key);
    if (this.requireExistingBinding) throw new Error('Task drafts require their owning task entry');
    const result = await this.initializeWithKey(key, formVersionId,
      this.bindings.get(key) ? undefined : this.bindings.initializationKey(key));
    return { draftId: result.draftId, isInitializationOnly: result.isInitializationOnly,
      ...(result.response ? { response: result.response } : {}) };
  }

  async recoverInitialization(key: DraftKey, formVersionId: string, assertCurrent: () => void = () => {}): Promise<RecoveredDraftInitialization | undefined> {
    if (this.requireExistingBinding) throw new Error('Task drafts require their owning task entry');
    key = copyDraftKey(key); assertSynchronousGuard(assertCurrent);
    const retained = this.bindings.retainedInitializationKey(key);
    if (!retained) return undefined;
    return this.initializeWithKey(key, formVersionId, retained, assertCurrent);
  }

  private async initializeWithKey(key: DraftKey, formVersionId: string | undefined, attemptKey?: string,
    assertCurrent: () => void = () => {}): Promise<RecoveredDraftInitialization> {
    const generation = this.generation;
    const current = () => { assertSynchronousGuard(assertCurrent); if (generation !== this.generation || this.clearing) throw new Error('Draft initialization was retired'); };
    current();
    const existing = this.bindings.get(key);
    if (!existing && (!attemptKey || this.bindings.retainedInitializationKey(key) !== attemptKey)) throw new Error('Retained initialization attempt unavailable');
    const operationKey = existing ? `draft:${existing.draftId}` : attemptKey!;
    const inFlight = this.initializations.get(operationKey);
    if (inFlight) return inFlight;
    const operation = (async () => {
      const formId = this.formIdResolver(key.formUrl, key.formVersion);
      let versionId = formVersionId ?? this.formVersionId;
      if (!versionId) {
        const publication = await this.client.getJson<{ form_id: string; form_version_id: string; definition_url: string; definition_version: string }>(
          `/runtime/forms/${encodeURIComponent(formId)}`);
        current();
        if (publication.form_id !== formId || publication.definition_url !== key.formUrl
          || (key.formVersion !== undefined && publication.definition_version !== key.formVersion)
          || !publication.form_version_id?.trim()) throw new Error('Draft publication differs from its selected Definition');
        versionId = publication.form_version_id;
      }
      const token = await this.resolveAnonymousSessionToken(key); current();
      const expectedOwner = await this.initializationOwner(key); current();
      const draft = existing
        ? await this.client.getJson<OwnedDraftView>(`/drafts/${encodeURIComponent(existing.draftId)}`,
          { headers: bearerHeaders(token), assertCurrent: current })
        : await this.client.postJson<OwnedDraftView>(`/runtime/forms/${encodeURIComponent(formId)}/drafts`,
          { form_version_id: versionId },
          { headers: { ...bearerHeaders(token), 'Idempotency-Key': attemptKey! }, assertCurrent: current });
      current();
      if (!draft.draft_id?.trim() || !Number.isSafeInteger(draft.draft_version) || draft.draft_version < 1
        || draft.form_version_id !== versionId || draft.subject_ref !== expectedOwner || draft.status !== 'in_progress'
        || typeof draft.is_initialization_only !== 'boolean' || draft.taskDraft !== undefined) {
        throw new Error('Server draft initialization differs from its owned publication');
      }
      if (draft.is_initialization_only) {
        if (draft.draft_version !== 1 || draft.canonical_response != null || canonicalize(draft.draft_state) !== '{}') {
          throw new Error('Initialized draft already contains a Response');
        }
      } else {
        const { validateCanonicalFormResponse } = await import('../schema/surface-bundle-schema-validators.ts');
        if (!draft.canonical_response || !await validateCanonicalFormResponse(draft.canonical_response)
          || draft.canonical_response.definitionUrl !== key.formUrl || draft.canonical_response.definitionVersion !== key.formVersion
          || !sameResponseDataView(draft.canonical_response.data, draft.draft_state)) throw new Error('Retried draft has no matching canonical Response');
      }
      current();
      const previous = this.bindings.get(key);
      if (previous && previous.draftId !== draft.draft_id) throw new Error('Draft initialization conflicts with retained identity');
      this.bindings.put(key, { draftId: draft.draft_id, draftVersion: draft.draft_version,
        ...(!draft.is_initialization_only ? { response: draft.canonical_response } : {}) });
      return { draftId: draft.draft_id, draftVersion: draft.draft_version, formVersionId: versionId, subjectRef: expectedOwner,
        isInitializationOnly: draft.is_initialization_only,
        ...(!draft.is_initialization_only ? { response: snapshotWire(draft.canonical_response) } : {}) };
    })();
    this.initializations.set(operationKey, operation);
    try { return await operation; } finally { if (this.initializations.get(operationKey) === operation) this.initializations.delete(operationKey); }
  }

  private async read<T>(key: DraftKey, qualify: (view: OwnedDraftView) => Promise<T>, assertCurrent: () => void = () => {}, missingIsAbsent = true, selection?: OwnedDraftResumeSelection, qualifyInitialization?: (view: OwnedDraftView) => Promise<T>): Promise<T | undefined> {
    key = structuredClone(key);
    const generation = this.generation;
    const current = () => { assertSynchronousGuard(assertCurrent); if (generation !== this.generation) throw new Error('Draft state was cleared while loading'); };
    current();
    const previous = this.bindings.get(key);
    if (selection && previous && (previous.draftId !== selection.draftId
      || selection.expectedResponseId !== undefined && previous.responseId !== undefined && previous.responseId !== selection.expectedResponseId)) throw new Error('Owned draft resume conflicts with a retained binding');
    const binding = previous ?? (selection ? { draftId: selection.draftId, ...(selection.expectedResponseId !== undefined ? { responseId: selection.expectedResponseId } : {}) } : undefined);
    if (!binding) {
      return undefined;
    }
    try {
      const token = await this.resolveAnonymousSessionToken(key);
      current();
      const view = await this.client.getJson<OwnedDraftView>(`/drafts/${encodeURIComponent(binding.draftId)}`, {
        headers: bearerHeaders(token),
        assertCurrent: current,
        ...(!missingIsAbsent ? { successStatuses: [200] } : {}),
      });
      current();
      const response = view.canonical_response;
      if (view.is_initialization_only === true) {
        const expectedOwner = await this.initializationOwner(key); current();
        if (view.draft_id !== binding.draftId || view.draft_version !== 1 || response != null
          || view.status !== 'in_progress' || view.subject_ref !== expectedOwner || canonicalize(view.draft_state) !== '{}'
          || selection && !selection.initializationOnly || binding.responseId !== undefined
          || binding.draftVersion !== undefined && binding.draftVersion !== 1
          || selection?.initializationOnly && (response !== null || !this.formVersionId?.trim()
            || view.form_version_id !== this.formVersionId || view.taskDraft !== undefined)) throw new Error('Initialized draft differs from retained identity');
        const initialized = qualifyInitialization ? await qualifyInitialization(snapshotWire(view)) : undefined;
        current();
        if (selection && canonicalize(this.bindings.get(key)) !== canonicalize(previous)) throw new Error('Owned draft binding changed while resuming');
        this.bindings.put(key, { draftId: view.draft_id, draftVersion: view.draft_version });
        return initialized;
      }

      if (selection && view.taskDraft !== undefined) throw new Error('Task-owned draft requires its maintained task entry');
      assertTaskDraftWire(view?.taskDraft);
      const { validateCanonicalFormResponse } = await import('../schema/surface-bundle-schema-validators.ts');
      if (view.draft_id !== binding.draftId || !response || !await validateCanonicalFormResponse(response)
        || !Number.isInteger(view.draft_version) || (view.draft_version ?? -1) < 0
        || response.definitionUrl !== key.formUrl
        || (key.formVersion !== undefined && response.definitionVersion !== key.formVersion)
        || !sameResponseDataView(response.data, view.draft_state)) {
        throw new Error('Server draft has no matching canonical Response snapshot');
      }
      if (selection && response.id !== (selection.expectedResponseId ?? binding.responseId)) throw new Error('Owned draft resume Response identity differs');
      if (!missingIsAbsent && ((binding.draftVersion !== undefined && view.draft_version < binding.draftVersion)
        || (binding.responseId !== undefined && response.id !== binding.responseId))) {
        throw new Error('Owned draft state regressed from its retained identity or revision');
      }
      current();
      const result = await qualify(snapshotWire(view));
      current();
      if (selection && canonicalize(this.bindings.get(key)) !== canonicalize(previous)) throw new Error('Owned draft binding changed while resuming');
      this.bindings.put(key, { draftId: view.draft_id, draftVersion: view.draft_version, response });
      return result;
    } catch (error) {
      current();
      if (error instanceof HttpAdapterError && error.status === 404) {
        if (!missingIsAbsent) throw error;
        this.bindings.delete(key);
        return undefined;
      }
      throw error;
    }
  }

  async save(key: DraftKey, response: FormResponse, options?: { readonly assertBeforeDispatch?: () => void }): Promise<void> {
    if (this.clearing) throw new Error('Draft state is being cleared');
    const guard = options?.assertBeforeDispatch?.bind(options);
    const pending = this.saveOnce(key, response, guard ? { assertBeforeDispatch: guard } : undefined);
    this.pendingSaves.add(pending);
    try { await pending; } finally { this.pendingSaves.delete(pending); }
  }

  private async saveOnce(key: DraftKey, response: FormResponse, options?: { readonly assertBeforeDispatch?: () => void }): Promise<void> {
    const generation = this.retirementGeneration;
    const current = () => { if (generation !== this.retirementGeneration) throw new Error('Draft state was retired while saving'); };
    response = snapshotWire(response);
    const existing = this.bindings.get(key);
    const anonymousSessionToken = await this.resolveAnonymousSessionToken(key);
    current();
    if (!existing) throw new Error('Draft must be initialized before Save or Sign');

    const update = await this.client.patchJson<DraftView>(
      `/drafts/${encodeURIComponent(existing.draftId)}`,
      {
        draft_state: response.data,
        canonical_response: response,
        expected_draft_version: existing.draftVersion,
      },
      { headers: bearerHeaders(anonymousSessionToken), assertCurrent: current, assertBeforeDispatch: options?.assertBeforeDispatch },
    );
    current();
    this.bindings.put(key, {
      draftId: existing.draftId,
      draftVersion: update.draft_version,
      response,
    });
  }

  async list(subjectRef: string): Promise<DraftKey[]> {
    return this.bindings
      .entries()
      .filter(({ key }) => key.subjectRef === subjectRef)
      .map(({ key }) => ({ ...key }));
  }

  async delete(key: DraftKey): Promise<void> {
    this.clearing += 1;
    this.generation += 1;
    try {
      await Promise.allSettled([...this.pendingSaves]);
      this.bindings.delete(key);
      await this.clearAnonymousSession?.(key);
    } finally { this.clearing -= 1; }
  }

  async invalidateSubject(subjectRef: string): Promise<void> {
    this.generation += 1;
    this.retirementGeneration += 1;
    for (const { key } of this.bindings.entries()) {
      if (key.subjectRef === subjectRef) {
        await this.delete(key);
      }
    }
  }

  /** Retire cached answers and pending work; keep only owner-scoped server locators. */
  async retireSubject(subjectRef: string): Promise<void> {
    this.generation += 1;
    this.retirementGeneration += 1;
    this.clearing += 1;
    try {
      await Promise.allSettled([...this.pendingSaves]);
      for (const { key, snapshot } of this.bindings.entries()) {
        if (key.subjectRef === subjectRef) this.bindings.put(key, { draftId: snapshot.draftId,
          draftVersion: snapshot.draftVersion, responseId: snapshot.responseId });
      }
    } finally { this.clearing -= 1; }
  }

  private async initializationOwner(key: DraftKey): Promise<string> {
    const owner = this.expectedInitializationOwner ? await this.expectedInitializationOwner(key) : key.subjectRef;
    if (typeof owner !== 'string' || !owner.trim()) throw new Error('Draft initialization requires a resolved owner');
    return owner;
  }

  private async resolveAnonymousSessionToken(key: DraftKey): Promise<string | undefined> {
    if (typeof this.anonymousSessionToken === 'function') {
      return this.anonymousSessionToken(key);
    }
    return this.anonymousSessionToken;
  }
}

export function createHttpDraftStore(config: HttpDraftStoreConfig): HttpDraftStore {
  return new HttpDraftStore(config);
}

function bearerHeaders(token: string | undefined): HeadersInit {
  return token ? { authorization: `Bearer ${token}` } : {};
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
