import { ResponseCompletionRefusal } from '../ports/response-completion.ts';
import { snapshotFiniteJson } from '@formspec-org/surface';
import canonicalize from 'canonicalize';
import { planServiceRequest } from '@formspec-org/engine/render';
import type { FormResponse, RuntimeRequest } from '@formspec-org/types';
import type { ResponseCompletion, PreparedResponseCompletion } from '../ports/response-completion.ts';
import type { IntakeHandoff, SubmitTransport, SubmitOptions } from '../ports/submit-transport.ts';
import { assertSynchronousGuard } from './synchronous-guard.ts';

/** Maintained intake behavior isolated from the controller's whole-response signing lifecycle. */
export function createIntakeResponseCompletion(config: {
  buildHandoff: (response: FormResponse) => IntakeHandoff | Promise<IntakeHandoff>;
  submitTransport: SubmitTransport;
}): ResponseCompletion {
  const preparations = new WeakMap<PreparedResponseCompletion, { handoff: IntakeHandoff; options?: SubmitOptions; operationId?: string }>();
  const admit = (request: RuntimeRequest) => {
    if (canonicalize(request.successStatuses) !== '[200]') throw new ResponseCompletionRefusal('action-unadmitted');
    for (const [name, output] of Object.entries(request.outputs ?? {})) {
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !['/response_id', '/status'].includes(output.path)
        || (output.exposure !== undefined && !['internal', 'transition'].includes(output.exposure))) throw new ResponseCompletionRefusal('outputs-unsupported');
    }
  };
  return {
    kind: 'intake', admit,
    async capture(input, lifetime) {
      const check = () => { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent); };
      check(); admit(input.request);
      const signed = snapshotFiniteJson(input.signed) as unknown as typeof input.signed;
      const invocationInput = snapshotFiniteJson(input.invocationInput) as unknown as typeof input.invocationInput;
      const options = input.submitOptions?.nativeCurrentCheck ? snapshotFiniteJson(input.submitOptions) as SubmitOptions : undefined;
      const planned = planServiceRequest(input.request, { input: { ...invocationInput, draftId: signed.draft.id,
        draftVersion: signed.draft.version, frozenResponse: signed.response }, route: {}, session: {} });
      if (planned.method !== 'POST' || planned.path !== `/drafts/${encodeURIComponent(signed.draft.id)}/submit`
        || Object.keys(planned.headers).length || ![canonicalize({ canonical_response: signed.response }),
          canonicalize({ canonical_response: signed.response, signing_requested: false })].includes(canonicalize(planned.body))) {
        throw new ResponseCompletionRefusal('action-unadmitted');
      }
      const handoff = snapshotFiniteJson(await config.buildHandoff(signed.response)) as unknown as IntakeHandoff; check();
      if (canonicalize(handoff.extensions?.['x-formspec-response']) !== canonicalize(signed.response)
        || canonicalize(handoff.definitionRef) !== canonicalize({ url: signed.response.definitionUrl, version: signed.response.definitionVersion })
        || handoff.responseRef !== `response:${signed.response.id}` || handoff.responseHash !== `sha256:${signed.draft.responseHash}`
        || (handoff.subjectRef !== undefined && handoff.subjectRef !== signed.actor.id)) throw new ResponseCompletionRefusal('context-mismatch');
      const prepared = Object.freeze({ kind: 'intake' as const }); preparations.set(prepared, { handoff, options }); return prepared;
    },
    async complete(prepared, operationId, lifetime) {
      const check = () => { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent); };
      check(); const captured = preparations.get(prepared);
      if (!captured || !operationId.trim() || (captured.operationId && captured.operationId !== operationId)) throw new Error('Intake completion preparation mismatch');
      captured.operationId = operationId;
      const rawConfirmation = await (captured.options ? config.submitTransport.submit(captured.handoff, operationId, check, captured.options)
        : config.submitTransport.submit(captured.handoff, operationId, check)); check();
      const confirmation = snapshotFiniteJson(rawConfirmation) as unknown as typeof rawConfirmation;
      return { kind: 'intake', confirmation, evidence: { response_id: confirmation.referenceNumber, status: confirmation.status } };
    },
  };
}
