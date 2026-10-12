import { wosTenantScopeHeaders } from '../../profiles/wos-tenant-headers.ts';
import { isLosslessHttpIdempotencyKey } from '../../shared/idempotency-key.ts';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { snapshotFiniteJson } from '@formspec-org/surface';
import type { TaskCompletion, TaskCompletionSelection, TaskOutcomeEvent, TaskSubmission, CompletedTaskOutcome } from '../../ports/task-completion.ts';
import type { CompletionLifetime } from '../../ports/response-completion.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import commonSchema from './workspec-schemas/common.schema.json';
import taskSchema from './workspec-schemas/task.schema.json';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';

const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv); ajv.addSchema(commonSchema); ajv.addSchema(taskSchema);
const submissionShape = ajv.compile<TaskSubmission>({ $ref: `${taskSchema.$id}#/$defs/TaskSubmission` });
const outcomeShape = ajv.compile<TaskOutcomeEvent>({ $ref: `${taskSchema.$id}#/$defs/TaskOutcomeEvent` });
const resourceShape = ajv.compile<string>({ $ref: `${commonSchema.$id}#/$defs/WosResourceUrn` });

/** Inactive adapter preparation: production composition must supply qualified task launch and WOS auth.
 * Wire/schema checks grant no Source signed-evidence or task authority; WOS owns those checks.
 */
export class HttpTaskCompletion implements TaskCompletion {
  private readonly client: HttpClient;
  private readonly scopeHeaders: Readonly<Record<string, string>>;
  private readonly selection: TaskCompletionSelection;
  private readonly assertCurrentAuth: () => void;
  constructor(config: HttpClientConfig & { selection: TaskCompletionSelection; assertCurrentAuth: () => void }) {
    this.scopeHeaders = wosTenantScopeHeaders(config.tenantBinding);
    this.selection = snapshotFiniteJson(config.selection) as unknown as TaskCompletionSelection;
    if (Object.keys(this.selection).sort().join(',') !== 'definitionUrl,definitionVersion,processId,taskId'
      || !resourceShape(this.selection.taskId) || !resourceShape(this.selection.processId)
      || !this.selection.definitionUrl.trim() || !this.selection.definitionVersion.trim() || !config.accessToken) {
      throw new Error('Task completion requires exact task publication and a selected WOS session');
    }
    const token = config.accessToken;
    this.assertCurrentAuth = config.assertCurrentAuth;
    this.client = new HttpClient({ ...config, tenantBinding: undefined, accessToken: async () => {
      assertSynchronousGuard(this.assertCurrentAuth);
      const value = typeof token === 'function' ? await token() : token;
      assertSynchronousGuard(this.assertCurrentAuth);
      if (!value?.trim()) throw new Error('Selected WOS session is unavailable');
      return value;
    } });
  }
  async complete(submission: TaskSubmission, operationId: string, lifetime: CompletionLifetime): Promise<CompletedTaskOutcome> {
    const check = () => { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent);
      assertSynchronousGuard(this.assertCurrentAuth); };
    check(); const body = snapshotFiniteJson(submission) as unknown as TaskSubmission;
    if (!submissionShape(body) || !['definitionUrl,definitionVersion,response', 'definitionUrl,definitionVersion,response,signedDraft'].includes(Object.keys(body).sort().join(','))
      || body.definitionUrl !== this.selection.definitionUrl || body.definitionVersion !== this.selection.definitionVersion
      || body.response.definitionUrl !== body.definitionUrl || body.response.definitionVersion !== body.definitionVersion
      || body.response.status !== 'completed' || !body.response.authoredSignatures?.length
      || !isLosslessHttpIdempotencyKey(operationId)
      || new TextEncoder().encode(JSON.stringify(body)).byteLength > 2 * 1024 * 1024) throw new Error('Task completion candidate mismatch');
    const raw = await this.client.postJson<unknown>(`/api/v1/tasks/${encodeURIComponent(this.selection.taskId)}/response`, body,
      { headers: this.scopeHeaders, idempotencyKey: operationId, signal: lifetime.signal, assertCurrent: check, assertBeforeDispatch: check,
        timeoutMs: 10_000, maxResponseBytes: 64 * 1024, requireJson: true, successStatuses: [200] });
    check(); const event = snapshotFiniteJson(raw) as unknown;
    if (!outcomeShape(event) || event.taskId !== this.selection.taskId || event.processId !== this.selection.processId
      || event.outcome !== 'completed' || event.newStatus !== 'submitted') throw new Error('Task completion outcome mismatch');
    return event as CompletedTaskOutcome;
  }
}
