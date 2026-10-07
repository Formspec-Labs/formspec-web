import canonicalize from 'canonicalize';
import type { DraftKey, DraftStore, FormResponse } from '../../ports/draft-store.ts';
import { createDraftBindingRegistry, type DraftBindingRegistry } from './draft-binding-registry.ts';
import { HttpAdapterError, HttpClient, type HttpClientConfig } from './http-client.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';

export interface HttpDraftStoreConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
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
}

interface DraftView {
  draft_id: string;
  draft_version?: number;
  draft_state?: Record<string, unknown>;
  canonical_response?: FormResponse;
}

export class HttpDraftStore implements DraftStore {
  private readonly client: HttpClient;
  private readonly formIdResolver: FormIdResolver;
  private readonly anonymousSessionToken?: HttpDraftStoreConfig['anonymousSessionToken'];
  private readonly bindings: DraftBindingRegistry;
  private readonly clearAnonymousSession?: HttpDraftStoreConfig['clearAnonymousSession'];
  private readonly pendingSaves = new Set<Promise<void>>();
  private clearing = 0;
  private generation = 0;

  constructor(config: HttpDraftStoreConfig) {
    this.client = new HttpClient(config);
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
    this.anonymousSessionToken = config.anonymousSessionToken;
    this.bindings = config.bindingRegistry ?? createDraftBindingRegistry();
    this.clearAnonymousSession = config.clearAnonymousSession;
  }

  async load(key: DraftKey): Promise<FormResponse | undefined> {
    const generation = this.generation;
    const binding = this.bindings.get(key);
    if (!binding) {
      return undefined;
    }
    try {
      const token = await this.resolveAnonymousSessionToken(key);
      const view = await this.client.getJson<DraftView>(`/drafts/${encodeURIComponent(binding.draftId)}`, {
        headers: bearerHeaders(token),
      });
      const response = view.canonical_response;
      const { validateCanonicalFormResponse } = await import('../schema/surface-bundle-schema-validators.ts');
      if (view.draft_id !== binding.draftId || !response || !await validateCanonicalFormResponse(response)
        || !Number.isInteger(view.draft_version) || (view.draft_version ?? -1) < 0
        || response.definitionUrl !== key.formUrl
        || (key.formVersion !== undefined && response.definitionVersion !== key.formVersion)
        || canonicalize(response.data) !== canonicalize(view.draft_state)) {
        throw new Error('Server draft has no matching canonical Response snapshot');
      }
      if (generation !== this.generation) throw new Error('Draft state was cleared while loading');
      this.bindings.put(key, { draftId: view.draft_id, draftVersion: view.draft_version, response });
      return response;
    } catch (error) {
      if (error instanceof HttpAdapterError && error.status === 404) {
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
    response = structuredClone(response);
    const existing = this.bindings.get(key);
    const respondentSubject = respondentSubjectRef(key);
    const anonymousSessionToken = respondentSubject
      ? undefined
      : await this.resolveAnonymousSessionToken(key);
    if (!existing) {
      await this.createDraft(key, response, {
        anonymousSessionToken,
        respondentSubject,
      });
      return;
    }

    const update = await this.client.patchJson<DraftView>(
      `/drafts/${encodeURIComponent(existing.draftId)}`,
      {
        draft_state: response.data,
        canonical_response: response,
        expected_draft_version: existing.draftVersion,
      },
      { headers: bearerHeaders(anonymousSessionToken) },
    );
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
      { headers: bearerHeaders(anonymousSessionToken) },
    );
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
