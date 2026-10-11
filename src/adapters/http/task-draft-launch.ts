import canonicalize from 'canonicalize';
import { snapshotFiniteJson } from '@formspec-org/surface';
import type { FormResponse } from '@formspec-org/types';
import type { TaskDraftLaunchSelection } from '../../ports/task-draft.ts';
import type { VerifiedDraftEvidence } from '../../ports/response-signing.ts';
import type { CompletionLifetime } from '../../ports/response-completion.ts';
import { isLosslessHttpIdempotencyKey } from '../../shared/idempotency-key.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

/** Launches or resumes the Source-owned task draft. No initial-draft fallback exists. */
export class HttpTaskDraftLaunch {
  private readonly client: HttpClient;
  private readonly selection: TaskDraftLaunchSelection;
  private readonly owner: string;
  private readonly definition: Readonly<{ url: string; version: string }>;
  private readonly assertCurrent: () => void;
  private readonly validateResponse: (value: unknown) => boolean | Promise<boolean>;
  constructor(config: HttpClientConfig & {
    selection: TaskDraftLaunchSelection;
    expectedSubjectRef: string;
    definition: Readonly<{ url: string; version: string }>;
    assertCurrent: () => void;
    validateResponse: (value: unknown) => boolean | Promise<boolean>;
  }) {
    this.selection = snapshotFiniteJson(config.selection) as unknown as TaskDraftLaunchSelection;
    this.definition = snapshotFiniteJson(config.definition) as unknown as typeof config.definition;
    this.owner = config.expectedSubjectRef;
    this.assertCurrent = config.assertCurrent;
    this.validateResponse = config.validateResponse;
    const selection = this.selection;
    if (Object.keys(selection).sort().join(',') !== 'expectedTaskRevision,formVersionHash,formVersionId,taskId,version'
      || selection.version !== 1 || ![selection.taskId, selection.expectedTaskRevision, selection.formVersionId,
        this.owner, this.definition.url, this.definition.version].every(value => typeof value === 'string' && value.trim())
      || !/^sha256:[a-f0-9]{64}$/.test(selection.formVersionHash) || !config.accessToken) {
      throw new Error('Task draft launch requires an explicit current owner, task and full publication');
    }
    const token = config.accessToken;
    this.client = new HttpClient({ ...config, accessToken: async () => {
      assertSynchronousGuard(this.assertCurrent);
      const value = typeof token === 'function' ? await token() : token;
      assertSynchronousGuard(this.assertCurrent);
      if (!value?.trim()) throw new Error('Selected Source task session is unavailable');
      return value;
    } });
  }
  async launch(operationId: string, lifetime: CompletionLifetime): Promise<VerifiedDraftEvidence> {
    const check = () => { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent);
      assertSynchronousGuard(this.assertCurrent); };
    check();
    if (!isLosslessHttpIdempotencyKey(operationId)) throw new Error('Task draft launch requires a stable Idempotency-Key');
    const raw = await this.client.postJson<unknown>('/runtime/task-drafts', this.selection, {
      idempotencyKey: operationId, signal: lifetime.signal, assertCurrent: check, assertBeforeDispatch: check,
      requireJson: true, successStatuses: [200], timeoutMs: 10_000, maxResponseBytes: 2 * 1024 * 1024,
    });
    check();
    const view = snapshotFiniteJson(raw) as unknown as VerifiedDraftEvidence;
    const response: FormResponse | undefined = view?.canonical_response;
    if (!view || typeof view.draft_id !== 'string' || !view.draft_id.trim()
      || view.form_version_id !== this.selection.formVersionId || view.subject_ref !== this.owner
      || view.status !== 'in_progress' || !Number.isSafeInteger(view.draft_version) || view.draft_version < 1
      || view.taskDraft?.version !== 1 || !/^sha256:[a-f0-9]{64}$/.test(view.taskDraft.associationHash)
      || !/^sha256:[a-f0-9]{64}$/.test(view.taskDraft.taskBindingHash)
      || !response || canonicalize(response.data) !== canonicalize(view.draft_state) || response.definitionUrl !== this.definition.url || response.definitionVersion !== this.definition.version
      || !await this.validateResponse(response)) throw new Error('Task draft launch returned a mismatched owned draft');
    check();
    return view;
  }
}
