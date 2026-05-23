import type { DraftKey, DraftStore, FormResponse } from '../../ports/draft-store.ts';
import { HttpAdapterError, HttpClient, type HttpClientConfig } from './http-client.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';

export interface HttpDraftStoreConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
  anonymousSessionToken?: string | ((key: DraftKey) => Promise<string | undefined> | string | undefined);
}

interface DraftView {
  draft_id: string;
  draft_version?: number;
}

interface DraftBinding {
  key: DraftKey;
  draftId: string;
  draftVersion?: number;
  response: FormResponse;
}

export class HttpDraftStore implements DraftStore {
  private readonly client: HttpClient;
  private readonly formIdResolver: FormIdResolver;
  private readonly anonymousSessionToken?: HttpDraftStoreConfig['anonymousSessionToken'];
  private readonly bindings = new Map<string, DraftBinding>();

  constructor(config: HttpDraftStoreConfig) {
    this.client = new HttpClient(config);
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
    this.anonymousSessionToken = config.anonymousSessionToken;
  }

  async load(key: DraftKey): Promise<FormResponse | undefined> {
    const binding = this.bindings.get(keyString(key));
    if (!binding) {
      return undefined;
    }
    try {
      await this.client.getJson<DraftView>(`/drafts/${encodeURIComponent(binding.draftId)}`);
    } catch (error) {
      if (error instanceof HttpAdapterError && error.status === 404) {
        this.bindings.delete(keyString(key));
        return undefined;
      }
      throw error;
    }
    return binding.response;
  }

  async save(key: DraftKey, response: FormResponse): Promise<void> {
    const storageKey = keyString(key);
    const existing = this.bindings.get(storageKey);
    const respondentSubject = respondentSubjectRef(key);
    const anonymousSessionToken = respondentSubject
      ? undefined
      : await this.resolveAnonymousSessionToken(key);
    if (!existing || isAnonymousDraftKey(key)) {
      await this.createDraft(key, response, {
        anonymousSessionToken,
        respondentSubject,
        storageKey,
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
    this.bindings.set(storageKey, {
      ...existing,
      draftVersion: update.draft_version,
      response,
    });
  }

  async list(subjectRef: string): Promise<DraftKey[]> {
    return Array.from(this.bindings.values())
      .filter((binding) => binding.key.subjectRef === subjectRef)
      .map((binding) => ({ ...binding.key }));
  }

  async delete(key: DraftKey): Promise<void> {
    this.bindings.delete(keyString(key));
  }

  async invalidateSubject(subjectRef: string): Promise<void> {
    for (const [key, binding] of this.bindings.entries()) {
      if (binding.key.subjectRef === subjectRef) {
        this.bindings.delete(key);
      }
    }
  }

  draftIdFor(key: DraftKey): string | undefined {
    return this.bindings.get(keyString(key))?.draftId;
  }

  private async createDraft(
    key: DraftKey,
    response: FormResponse,
    {
      anonymousSessionToken,
      respondentSubject,
      storageKey,
    }: {
      anonymousSessionToken?: string;
      respondentSubject?: string;
      storageKey: string;
    },
  ): Promise<void> {
    const formId = this.formIdResolver(key.formUrl, key.formVersion);
    const draft = await this.client.postJson<DraftView>(
      `/runtime/forms/${encodeURIComponent(formId)}/drafts`,
      {
        anonymous_session_token: anonymousSessionToken,
        anonymous_subject_ref: anonymousSubjectRef(key),
        respondent_subject_ref: anonymousSessionToken ? undefined : respondentSubject,
        draft_state: response.data,
      },
    );
    this.bindings.set(storageKey, {
      key: { ...key },
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

function keyString(key: DraftKey): string {
  return JSON.stringify({
    formUrl: key.formUrl,
    formVersion: key.formVersion ?? null,
    subjectRef: key.subjectRef ?? null,
  });
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
