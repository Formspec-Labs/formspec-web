import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { ownedDraftResumeSelection } from '../../config/owned-draft-resume.ts';
import type { TaskDraftAssociation } from '../../ports/task-draft.ts';
import canonicalize from 'canonicalize';
import type { DraftKey, DraftReadState, DraftStore, FormResponse, OwnedDraftResumeSelection } from '../../ports/draft-store.ts';
import { createDraftBindingRegistry, type DraftBindingRegistry } from './draft-binding-registry.ts';
import { HttpAdapterError, HttpClient, type HttpClientConfig } from './http-client.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';

export interface HttpDraftStoreConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
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
}
export interface OwnedDraftView {
  draft_id: string; draft_version: number; draft_state: Record<string, unknown>; canonical_response: FormResponse;
  form_version_id?: string; subject_ref?: string; status?: string;
  taskDraft?: TaskDraftAssociation;
}

export class HttpDraftStore implements DraftStore {
  readonly readState?: (key: DraftKey, assertCurrent?: () => void) => Promise<DraftReadState | undefined>;
  readonly resumeState?: (key: DraftKey, selection: OwnedDraftResumeSelection, assertCurrent?: () => void) => Promise<DraftReadState>;
  private readonly client: HttpClient;
  private readonly requireExistingBinding: boolean;
  private readonly formIdResolver: FormIdResolver;
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
    this.requireExistingBinding = config.requireExistingBinding === true;
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
    this.anonymousSessionToken = config.anonymousSessionToken;
    this.bindings = config.bindingRegistry ?? createDraftBindingRegistry();
    this.clearAnonymousSession = config.clearAnonymousSession;
    const qualify = config.qualifyReadState;
    if (qualify) {
      this.readState = (suppliedKey, current = () => {}) => {
        const key = structuredClone(suppliedKey);
        return this.read(key, async view => freeze(structuredClone(await qualify(key, view, current))), current, false);
      };
      this.resumeState = async (suppliedKey, suppliedSelection, current = () => {}) => {
        const key = structuredClone(suppliedKey), selection = ownedDraftResumeSelection(suppliedSelection);
        if (!key.subjectRef || key.subjectRef.startsWith('anon:')) throw new Error('Owned draft resume requires an authenticated owner');
        const result = await this.read(key, async view => {
          if (view.taskDraft !== undefined) throw new Error('Task-owned draft requires its maintained task entry');
          return freeze(structuredClone(await qualify(key, view, current)));
        }, current, false, selection);
        if (!result) throw new Error('Selected owned draft state unavailable');
        return result;
      };
    }
  }

  async load(key: DraftKey, assertCurrent: () => void = () => {}): Promise<FormResponse | undefined> {
    return this.read(key, view => Promise.resolve(view.canonical_response), assertCurrent);
  }

  private async read<T>(key: DraftKey, qualify: (view: OwnedDraftView) => Promise<T>, assertCurrent: () => void = () => {}, missingIsAbsent = true, selection?: OwnedDraftResumeSelection): Promise<T | undefined> {
    key = structuredClone(key);
    const generation = this.generation;
    const current = () => { assertSynchronousGuard(assertCurrent); if (generation !== this.generation) throw new Error('Draft state was cleared while loading'); };
    current();
    const previous = this.bindings.get(key);
    if (selection && previous && (previous.draftId !== selection.draftId
      || previous.responseId !== undefined && previous.responseId !== selection.expectedResponseId)) throw new Error('Owned draft resume conflicts with a retained binding');
    const binding = previous ?? (selection ? { draftId: selection.draftId, responseId: selection.expectedResponseId } : undefined);
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
      const { validateCanonicalFormResponse } = await import('../schema/surface-bundle-schema-validators.ts');
      if (view.draft_id !== binding.draftId || !response || !await validateCanonicalFormResponse(response)
        || !Number.isInteger(view.draft_version) || (view.draft_version ?? -1) < 0
        || response.definitionUrl !== key.formUrl
        || (key.formVersion !== undefined && response.definitionVersion !== key.formVersion)
        || canonicalize(response.data) !== canonicalize(view.draft_state)) {
        throw new Error('Server draft has no matching canonical Response snapshot');
      }
      if (selection && response.id !== selection.expectedResponseId) throw new Error('Owned draft resume Response identity differs');
      if (!missingIsAbsent && ((binding.draftVersion !== undefined && view.draft_version < binding.draftVersion)
        || (binding.responseId !== undefined && response.id !== binding.responseId))) {
        throw new Error('Owned draft state regressed from its retained identity or revision');
      }
      current();
      const result = await qualify(structuredClone(view));
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

  async save(key: DraftKey, response: FormResponse): Promise<void> {
    if (this.clearing) throw new Error('Draft state is being cleared');
    const pending = this.saveOnce(key, response);
    this.pendingSaves.add(pending);
    try { await pending; } finally { this.pendingSaves.delete(pending); }
  }

  private async saveOnce(key: DraftKey, response: FormResponse): Promise<void> {
    const generation = this.retirementGeneration;
    const current = () => { if (generation !== this.retirementGeneration) throw new Error('Draft state was retired while saving'); };
    response = structuredClone(response);
    const existing = this.bindings.get(key);
    const respondentSubject = respondentSubjectRef(key);
    const anonymousSessionToken = respondentSubject
      ? undefined
      : await this.resolveAnonymousSessionToken(key);
    current();
    if (!existing) {
      if (this.requireExistingBinding) throw new Error('Task draft binding is unavailable; relaunch the owning task');
      await this.createDraft(key, response, {
        anonymousSessionToken,
        respondentSubject,
      }, current);
      return;
    }

    const update = await this.client.patchJson<DraftView>(
      `/drafts/${encodeURIComponent(existing.draftId)}`,
      {
        draft_state: response.data,
        canonical_response: response,
        expected_draft_version: existing.draftVersion,
      },
      { headers: bearerHeaders(anonymousSessionToken), assertCurrent: current },
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

  private async createDraft(
    key: DraftKey,
    response: FormResponse,
    {
      anonymousSessionToken,
      respondentSubject,
    }: {
      anonymousSessionToken?: string;
      respondentSubject?: string;
    },
    current: () => void = () => {},
  ): Promise<void> {
    const formId = this.formIdResolver(key.formUrl, key.formVersion);
    const draft = await this.client.postJson<DraftView>(
      `/runtime/forms/${encodeURIComponent(formId)}/drafts`,
      {
        anonymous_session_token: anonymousSessionToken,
        anonymous_subject_ref: anonymousSubjectRef(key),
        respondent_subject_ref: anonymousSessionToken ? undefined : respondentSubject,
        party_ref: key.partyRef,
        draft_state: response.data,
        canonical_response: response,
      },
      { headers: bearerHeaders(anonymousSessionToken), assertCurrent: current },
    );
    current();
    this.bindings.put(key, {
      draftId: draft.draft_id,
      draftVersion: draft.draft_version,
      response,
    });
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

function anonymousSubjectRef(key: DraftKey): string | undefined {
  return key.subjectRef?.startsWith('anon:') ? key.subjectRef : undefined;
}

function respondentSubjectRef(key: DraftKey): string | undefined {
  if (!key.subjectRef || key.subjectRef.startsWith('anon:')) {
    return undefined;
  }
  return key.subjectRef;
}

function bearerHeaders(token: string | undefined): HeadersInit {
  return token ? { authorization: `Bearer ${token}` } : {};
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
