import { createSubmitFailureReporter, type SubmitFailureStage } from '../../shared/submit-diagnostic.ts';
import { isLosslessHttpIdempotencyKey } from '../../shared/idempotency-key.ts';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { snapshotFiniteJson } from '@formspec-org/surface';
import type { TaskCompletion, TaskCompletionSelection, TaskOutcomeEvent, TaskSubmission, CompletedTaskOutcome } from '../../ports/task-completion.ts';
import type { CompletionLifetime } from '../../ports/response-completion.ts';
import { HttpAdapterError, HttpClient, type HttpClientConfig } from './http-client.ts';
import { snapshotWire } from './wire-json.ts';
import commonSchema from './workspec-schemas/common.schema.json';
import taskSchema from './workspec-schemas/task.schema.json';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { TaskCompletionOutcomeUnknown } from '../../ports/response-completion.ts';
import { isRecord } from '../../shared/is-record.ts';

const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv); ajv.addSchema(commonSchema); ajv.addSchema(taskSchema);
const submissionShape = ajv.compile<TaskSubmission>({ $ref: `${taskSchema.$id}#/$defs/TaskSubmission` });
const outcomeShape = ajv.compile<TaskOutcomeEvent>({ $ref: `${taskSchema.$id}#/$defs/TaskOutcomeEvent` });
const isCompleted = (event: TaskOutcomeEvent): event is CompletedTaskOutcome =>
  event.outcome === 'completed' && event.newStatus === 'submitted';
const resourceShape = ajv.compile<string>({ $ref: `${commonSchema.$id}#/$defs/WosResourceUrn` });

type PendingReceipt = { acceptedCommandRef: string; receiptUrl: string };
function pendingReceipt(error: unknown, original?: PendingReceipt): PendingReceipt {
  if (!(error instanceof HttpAdapterError) || error.status !== 202) throw error;
  const value = error.responseBody;
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'acceptedCommandRef,receiptUrl'
    || typeof value.acceptedCommandRef !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.acceptedCommandRef)
    || typeof value.receiptUrl !== 'string'
    || value.receiptUrl !== `/api/v1/accepted-commands/${value.acceptedCommandRef}?operation=task-submit`
    || original && (value.acceptedCommandRef !== original.acceptedCommandRef || value.receiptUrl !== original.receiptUrl)) {
    throw new Error('Pending task receipt mismatch');
  }
  return { acceptedCommandRef: value.acceptedCommandRef, receiptUrl: value.receiptUrl };
}
async function waitForReceipt(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(resolve, 1000);
    });
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}

/** Inactive adapter preparation: production composition must supply qualified task launch and WOS auth.
 * Wire/schema checks grant no Source signed-evidence or task authority; WOS owns those checks.
 */
export class HttpTaskCompletion implements TaskCompletion {
  private readonly reportSubmitFailure = createSubmitFailureReporter();
  private readonly client: HttpClient;
  private readonly selection: TaskCompletionSelection;
  private readonly assertCurrentAuth: () => void;
  private readonly completionTimeoutMs: number;
  constructor(config: HttpClientConfig & { selection: TaskCompletionSelection; assertCurrentAuth: () => void; completionTimeoutMs?: number }) {
    this.completionTimeoutMs = config.completionTimeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.completionTimeoutMs) || this.completionTimeoutMs <= 0
      || this.completionTimeoutMs > 2_147_483_647) throw new Error('Task completion timeout must be a finite positive timer bound');
    this.selection = snapshotWire(config.selection);
    if (Object.keys(this.selection).sort().join(',') !== 'definitionUrl,definitionVersion,processId,taskId'
      || !resourceShape(this.selection.taskId) || !resourceShape(this.selection.processId)
      || !this.selection.definitionUrl.trim() || !this.selection.definitionVersion.trim() || !config.accessToken) {
      throw new Error('Task completion requires exact task publication and a selected WOS session');
    }
    const token = config.accessToken;
    this.assertCurrentAuth = config.assertCurrentAuth;
    this.client = new HttpClient({ ...config, accessToken: async () => {
      assertSynchronousGuard(this.assertCurrentAuth);
      const value = typeof token === 'function' ? await token() : token;
      assertSynchronousGuard(this.assertCurrentAuth);
      if (!value?.trim()) throw new Error('Selected WOS session is unavailable');
      return value;
    } });
  }
  async complete(submission: TaskSubmission, operationId: string, lifetime: CompletionLifetime): Promise<CompletedTaskOutcome> {
    let stage: SubmitFailureStage = 'task-preflight';
    let dispatched = false;
    const timeout = new AbortController();
    const signal = AbortSignal.any([lifetime.signal, timeout.signal]);
    const timer = setTimeout(() => timeout.abort(new DOMException('Task completion timed out', 'TimeoutError')), this.completionTimeoutMs);
    try {
      const check = () => { signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent);
        assertSynchronousGuard(this.assertCurrentAuth); };
      check(); const body = snapshotWire(submission);
      if (!submissionShape(body) || !['definitionUrl,definitionVersion,response', 'definitionUrl,definitionVersion,response,signedDraft'].includes(Object.keys(body).sort().join(','))
        || body.definitionUrl !== this.selection.definitionUrl || body.definitionVersion !== this.selection.definitionVersion
        || body.response.definitionUrl !== body.definitionUrl || body.response.definitionVersion !== body.definitionVersion
        || body.response.status !== 'completed' || !body.response.authoredSignatures?.length
        || !isLosslessHttpIdempotencyKey(operationId)
        || new TextEncoder().encode(JSON.stringify(body)).byteLength > 2 * 1024 * 1024) throw new Error('Task completion candidate mismatch');
      stage = 'task-transport';
      const options = { signal, assertCurrent: check, maxResponseBytes: 64 * 1024, requireJson: true, successStatuses: [200] };
      let raw: unknown;
      let pending: PendingReceipt | undefined;
      try {
        raw = await this.client.postJson<unknown>(`/api/v1/tasks/${encodeURIComponent(this.selection.taskId)}/response`, body,
          { ...options, idempotencyKey: operationId, assertBeforeDispatch: () => { check(); dispatched = true; } });
      } catch (error) { pending = pendingReceipt(error); }
      const original = pending;
      while (pending) {
        await waitForReceipt(signal); check();
        try {
          // The closed decoder supplies only the original relative TaskSubmit
          // receipt. Every read resolves fresh credentials and current authority.
          raw = await this.client.getJson<unknown>(pending.receiptUrl, { ...options, requireNoStore: true });
          pending = undefined;
        } catch (error) { pending = pendingReceipt(error, original); }
      }
      stage = 'task-outcome-validation';
      check(); const event = snapshotFiniteJson(raw);
      if (!outcomeShape(event) || event.taskId !== this.selection.taskId || event.processId !== this.selection.processId
        || !isCompleted(event)) throw new Error('Task completion outcome mismatch');
      return event;
    } catch (error) {
      // Read only the adapter's numeric status; retain the original error unchanged.
      try {
        this.reportSubmitFailure(stage, error instanceof HttpAdapterError ? 'http-status'
          : error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'failed',
          error instanceof HttpAdapterError ? error.status : undefined);
      } catch { /* Error classification is observational too. */ }
      if (dispatched && error instanceof DOMException && error.name === 'TimeoutError') throw new TaskCompletionOutcomeUnknown();
      throw error;
    } finally { clearTimeout(timer); }
  }
}
