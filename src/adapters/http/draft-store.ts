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
}

interface DraftView {
  draft_id: string;
  draft_version?: number;
}

export class HttpDraftStore implements DraftStore {
  private readonly client: HttpClient;
  private readonly formIdResolver: FormIdResolver;
  private readonly anonymousSessionToken?: HttpDraftStoreConfig['anonymousSessionToken'];
  private readonly bindings: DraftBindingRegistry;

  constructor(config: HttpDraftStoreConfig) {
    this.client = new HttpClient(config);
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
    this.anonymousSessionToken = config.anonymousSessionToken;
    this.bindings = config.bindingRegistry ?? createDraftBindingRegistry();
  }

  async load(key: DraftKey): Promise<FormResponse | undefined> {
    const binding = this.bindings.get(key);
    if (!binding) {
      return undefined;
    }
    try {
      await this.client.getJson<DraftView>(`/drafts/${encodeURIComponent(binding.draftId)}`);
    } catch (error) {
      if (error instanceof HttpAdapterError && error.status === 404) {
        this.bindings.delete(key);
        return undefined;
      }
      throw error;
    }
    return binding.response;
  }

  async save(key: DraftKey, response: FormResponse): Promise<void> {
    const existing = this.bindings.get(key);
    const respondentSubject = respondentSubjectRef(key);
    const anonymousSessionToken = respondentSubject
      ? undefined
      : await this.resolveAnonymousSessionToken(key);
    if (!existing || isAnonymousDraftKey(key)) {
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
        expected_draft_version: existing.draftVersion,
      },
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
    this.bindings.delete(key);
  }

  async invalidateSubject(subjectRef: string): Promise<void> {
    for (const { key } of this.bindings.entries()) {
      if (key.subjectRef === subjectRef) {
        this.bindings.delete(key);
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
      },
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

function isAnonymousDraftKey(key: DraftKey): boolean {
  return !key.subjectRef || key.subjectRef.startsWith('anon:');
}

function respondentSubjectRef(key: DraftKey): string | undefined {
  if (!key.subjectRef || key.subjectRef.startsWith('anon:')) {
    return undefined;
  }
  return key.subjectRef;
}
