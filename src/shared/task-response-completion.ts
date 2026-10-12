import { ResponseCompletionRefusal } from '../ports/response-completion.ts';
import canonicalize from 'canonicalize';
import { planServiceRequest } from '@formspec-org/engine/render';
import type { RuntimeRequest } from '@formspec-org/types';
import { snapshotFiniteJson } from '@formspec-org/surface';
import type { ResponseCompletion, PreparedResponseCompletion } from '../ports/response-completion.ts';
import type { TaskCompletion, TaskCompletionSelection, TaskSubmission } from '../ports/task-completion.ts';
import { assertSynchronousGuard } from './synchronous-guard.ts';

/** Generic task completion preparation. No production caller until owning task/sign authority is qualified. */
export function createTaskResponseCompletion(config: { selection: TaskCompletionSelection; transport: TaskCompletion }): ResponseCompletion {
  const selection = snapshotFiniteJson(config.selection) as unknown as TaskCompletionSelection;
  const preparations = new WeakMap<PreparedResponseCompletion, { submission: TaskSubmission; operationId?: string }>();
  const admit = (request: RuntimeRequest) => assertTaskCompletionRequest(selection, request);
  return {
    kind: 'task', admit,
    async capture(input, lifetime) {
      const check = () => { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent); };
      check(); admit(input.request);
      const signed = snapshotFiniteJson(input.signed) as unknown as typeof input.signed;
      const invocationInput = snapshotFiniteJson(input.invocationInput) as unknown as typeof input.invocationInput;
      if (signed.response.definitionUrl !== selection.definitionUrl || signed.response.definitionVersion !== selection.definitionVersion
        || signed.response.status !== 'completed' || !signed.response.authoredSignatures?.length) throw new Error('Task completion candidate mismatch');
      const signedDraft = signed.evidence.taskDraft?.signedDraft;
      if (!signedDraft || signedDraft.draftId !== signed.draft.id
        || signedDraft.expectedSignedDraftVersion !== signed.draft.version
        || signedDraft.associationHash !== signed.evidence.taskDraft!.associationHash
        || signedDraft.taskBindingHash !== signed.evidence.taskDraft!.taskBindingHash) throw new ResponseCompletionRefusal('context-mismatch');
      const submission: TaskSubmission = { definitionUrl: selection.definitionUrl, definitionVersion: selection.definitionVersion,
        response: signed.response, signedDraft };
      const planned = planServiceRequest(input.request, { input: { ...invocationInput, taskId: selection.taskId,
        draftId: signed.draft.id, draftVersion: signed.draft.version, frozenResponse: signed.response, signedDraft }, route: {}, session: {} });
      if (planned.method !== 'POST' || planned.path !== `/api/v1/tasks/${encodeURIComponent(selection.taskId)}/response`
        || Object.keys(planned.headers).length || canonicalize(planned.body) !== canonicalize(submission)) throw new ResponseCompletionRefusal('action-unadmitted');
      check(); const prepared = Object.freeze({ kind: 'task' as const }); preparations.set(prepared, { submission: snapshotFiniteJson(submission) as unknown as TaskSubmission }); return prepared;
    },
    async complete(prepared, operationId, lifetime) {
      const check = () => { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent); };
      check(); const captured = preparations.get(prepared);
      if (!captured || !operationId.trim() || (captured.operationId && captured.operationId !== operationId)) throw new Error('Task completion preparation mismatch');
      captured.operationId = operationId;
      const rawOutcome = await config.transport.complete(captured.submission, operationId, lifetime); check();
      const outcome = snapshotFiniteJson(rawOutcome) as unknown as typeof rawOutcome;
      if (outcome.taskId !== selection.taskId || outcome.processId !== selection.processId || outcome.outcome !== 'completed'
        || outcome.newStatus !== 'submitted') throw new Error('Task completion outcome mismatch');
      return { kind: 'task', outcome, evidence: outcome };
    },
  };
}

/** Preflight the maintained task request before any durable Source launch. */
export function assertTaskCompletionRequest(selection: TaskCompletionSelection, request: RuntimeRequest): void {
  const expected = { method: 'POST', pathTemplate: '/api/v1/tasks/{taskId}/response',
    pathBindings: { taskId: { from: 'input', path: 'taskId' } },
    bodyDefaults: { definitionUrl: selection.definitionUrl, definitionVersion: selection.definitionVersion },
    bodyBindings: { '/response': { from: 'input', path: 'frozenResponse' }, '/signedDraft': { from: 'input', path: 'signedDraft' } } };
  if (request.adapter !== 'http-json' || canonicalize(request.request) !== canonicalize(expected)
    || canonicalize(request.successStatuses) !== '[200]') throw new ResponseCompletionRefusal('action-unadmitted');
  for (const [name, output] of Object.entries(request.outputs ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !['/taskId', '/processId', '/outcome', '/newStatus', '/occurredAt', '/actorRef', '/provenanceRecordRef'].includes(output.path)
      || (output.exposure !== undefined && !['internal', 'transition'].includes(output.exposure))) throw new ResponseCompletionRefusal('outputs-unsupported');
  }
}
