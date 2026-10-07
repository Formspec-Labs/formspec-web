import canonicalize from 'canonicalize';
import { extractServiceRequestOutputs, invokeResponseActionAsync, planServiceRequest, resolveResponseAction, resolveResponseActionValidationTuple, resolveServiceRequest, type ResponseActionInvocationResult } from '@formspec-org/engine/render';
import type { ResponseActionInvoker, SubmitResult } from '@formspec-org/react';
import type { SurfaceWidgetActionExecutor, SurfaceWidgetActionSource } from '@formspec-org/surface-react';
import type { FormDefinition, FormResponse, SigningContentSource, ValidationOverride } from '@formspec-org/types';
import type { DraftKey } from '../ports/draft-store.ts';
import type { AdmittedResponseAction, PreparedResponseSigning, ResponseSigning, SavedResponseDraft, SignedResponseSigning } from '../ports/response-signing.ts';
import type { IntakeHandoff, SubmitConfirmation, SubmitTransport } from '../ports/submit-transport.ts';
import { generateIdempotencyKey } from './idempotency-key.ts';

export type ResponseActionRole = 'saveInitial' | 'saveOwned' | 'prepare' | 'sign' | 'submit' | 'paper';
export type ResponseActionControllerReason = 'action-unadmitted' | 'context-mismatch' | 'response-invalid' | 'branch-mismatch' | 'outputs-unsupported' | 'review-unready' | 'operation-conflict' | 'operation-pending' | 'context-obsolete' | 'restoration-unresolved' | 'port-failed';
export interface QualifiedResponseActionRole extends Omit<AdmittedResponseAction, 'requestRef'> {
  requestRef?: string;
  widgetSource?: SurfaceWidgetActionSource;
  responseSource?: { inputName: string; catalogRef: string; sourceRef: string };
}
export interface ResponseActionControllerContext {
  definition: FormDefinition;
  draftKey: DraftKey;
  publication: { formId: string; formVersionId: string };
  responseId: string;
  generation: string;
  /** Absent before initial Save; server-verified port evidence establishes the actor pin. */
  expectedActor?: string;
}
export interface ResponseActionReviewContext {
  response: FormResponse;
  draft: SavedResponseDraft['draft'];
  actor: SavedResponseDraft['actor'];
  source: SigningContentSource;
  locale: string;
  generation: string;
}
export interface ResponseActionControllerSnapshot {
  phase: 'idle' | ResponseActionRole | 'saved' | 'prepared' | 'signed' | 'submitted' | 'refused' | 'failed';
  owned: boolean;
  reason?: ResponseActionControllerReason;
  saved?: SavedResponseDraft;
  prepared?: PreparedResponseSigning;
  signed?: SignedResponseSigning;
  confirmation?: SubmitConfirmation;
}
export interface ResponseActionControllerConfig {
  context: ResponseActionControllerContext;
  roles: Partial<Record<ResponseActionRole, QualifiedResponseActionRole>>;
  restoredResponse?: FormResponse;
  signing: ResponseSigning;
  submitTransport: SubmitTransport;
  validateResponse: (response: unknown) => boolean | Promise<boolean>;
  validateFrozenResponse: (response: FormResponse, tuple: ValidationOverride) =>
    (SubmitResult & { validationTuple: ValidationOverride }) | Promise<SubmitResult & { validationTuple: ValidationOverride }>;
  hashResponse: (response: FormResponse) => Promise<string>;
  signingContext: () => { source: SigningContentSource; locale: string };
  reviewReady: (context: Readonly<ResponseActionReviewContext>, stage: 'unsigned' | 'signed') => boolean;
  buildHandoff: (response: FormResponse) => IntakeHandoff | Promise<IntakeHandoff>;
}
interface Delivery {
  identity: string;
  operationId: string;
  pending?: Promise<Record<string, string>>;
  handoff?: IntakeHandoff;
  baselineDraft: SavedResponseDraft['draft'] | null;
  retired?: boolean;
}
class ControllerRefusal extends Error {
  constructor(readonly code: ResponseActionControllerReason) { super(code); }
}

/** Port-only controller. Loaded artifacts select roles; no product IDs or transport paths select them. */
export function createResponseActionController(config: ResponseActionControllerConfig) {
  const context = freeze(structuredClone(config.context));
  const roles = freeze(structuredClone(config.roles));
  const restored = config.restoredResponse ? freeze(structuredClone(config.restoredResponse)) : undefined;
  let epoch = 0;
  let invalidated = false;
  let owned = restored !== undefined;
  let actor = context.expectedActor;
  let saved: SavedResponseDraft | undefined;
  // Keep the actual cohort preparation privately: its WeakMap identity authorizes Sign.
  let prepared: PreparedResponseSigning | undefined;
  let signed: SignedResponseSigning | undefined;
  let busy: string | undefined;
  let snapshot: ResponseActionControllerSnapshot = freeze({ phase: 'idle', owned });
  const listeners = new Set<() => void>();
  const deliveries = new Map<string, Delivery>();

  function publish(phase: ResponseActionControllerSnapshot['phase'], reason?: ResponseActionControllerReason, confirmation?: SubmitConfirmation) {
    snapshot = freeze(structuredClone({ phase, owned, ...(reason ? { reason } : {}),
      ...(saved ? { saved } : {}), ...(prepared ? { prepared } : {}), ...(signed ? { signed } : {}), ...(confirmation ? { confirmation } : {}) }));
    for (const listener of listeners) listener();
  }
  function current(generation: number) { if (invalidated || generation !== epoch) throw new ControllerRefusal('context-obsolete'); }
  function roleFor(document: unknown, actionRef: string): [ResponseActionRole, QualifiedResponseActionRole] {
    const matches = Object.entries(roles).filter(([, role]) => role.actionRef === actionRef && same(role.document, document));
    if (matches.length !== 1) throw new ControllerRefusal('action-unadmitted');
    return matches[0] as [ResponseActionRole, QualifiedResponseActionRole];
  }
  function requestFor(role: ResponseActionRole, admission: QualifiedResponseActionRole) {
    const resolution = resolveResponseAction(admission.document, admission.actionRef);
    const action = resolution.action;
    if (!resolution.resolved || !action || admission.document.scope === 'app'
      || admission.document.targetDefinition?.url !== context.definition.url) throw new ControllerRefusal('action-unadmitted');
    resolveResponseActionValidationTuple(action);
    if (action.effects?.length !== 1) throw new ControllerRefusal('action-unadmitted');
    const effect = action.effects[0];
    if (role === 'paper') {
      if (effect.type !== 'hostEvent' || effect.eventName === 'formspec-submit') throw new ControllerRefusal('action-unadmitted');
      return undefined;
    }
    if (effect.type !== 'serviceRequest' || effect.requestRef !== admission.requestRef
      || effect.idempotencyKey !== '@invocation.id' || !admission.artifactRef || !admission.artifactDigest) throw new ControllerRefusal('action-unadmitted');
    const request = resolveServiceRequest(admission.document['x-formspec-runtime'], admission.requestRef!);
    if (!same(request.successStatuses, [200])) throw new ControllerRefusal('action-unadmitted');
    const fields = role === 'submit' ? ['/response_id', '/status']
      : ['/draft_id', '/form_version_id', '/subject_ref', '/draft_version', '/draft_state', '/canonical_response', '/status'];
    for (const [name, output] of Object.entries(request.outputs ?? {})) {
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !fields.includes(output.path)
        || (output.exposure !== undefined && !['internal', 'transition'].includes(output.exposure))
        || (output.exposure === 'transition' && !['/draft_id', '/form_version_id', '/subject_ref', '/status', '/response_id'].includes(output.path))) {
        throw new ControllerRefusal('outputs-unsupported');
      }
    }
    return request;
  }
  async function validateResponse(response: FormResponse) {
    if (response.id !== context.responseId || response.definitionUrl !== context.definition.url
      || response.definitionVersion !== context.definition.version || !await config.validateResponse(response)) throw new ControllerRefusal('response-invalid');
    if (context.draftKey.formUrl !== response.definitionUrl || context.draftKey.formVersion !== response.definitionVersion
      || !context.publication.formVersionId || !context.publication.formId) throw new ControllerRefusal('context-mismatch');
  }
  async function checkEvidence(result: SavedResponseDraft, expected?: FormResponse) {
    await validateResponse(result.response);
    if (!same(result.draftKey, context.draftKey) || typeof result.actor.id !== 'string' || !result.actor.id.trim()
      || typeof result.draft.id !== 'string' || !result.draft.id.trim() || !/^[a-f0-9]{64}$/.test(result.draft.responseHash)
      || (actor && actor !== result.actor.id)
      || result.evidence.subject_ref !== result.actor.id || result.evidence.form_version_id !== context.publication.formVersionId
      || result.evidence.draft_id !== result.draft.id || result.evidence.draft_version !== result.draft.version
      || !Number.isSafeInteger(result.draft.version) || result.draft.version < 1 || result.evidence.status !== 'in_progress'
      || !same(result.evidence.canonical_response, result.response) || !same(result.evidence.draft_state, result.response.data)
      || (expected && !same(result.response, expected)) || result.draft.responseHash !== await config.hashResponse(result.response)) {
      throw new ControllerRefusal('context-mismatch');
    }
  }
  function review(result: PreparedResponseSigning | SignedResponseSigning, stage: 'unsigned' | 'signed', wording: { source: SigningContentSource; locale: string }) {
    if (!same(result.content.source, wording.source) || result.content.locale !== wording.locale
      || !config.reviewReady(freeze(structuredClone({ response: result.response, draft: result.draft, actor: result.actor,
        ...wording, generation: context.generation })), stage)) throw new ControllerRefusal('review-unready');
  }
  async function perform(role: ResponseActionRole, admission: QualifiedResponseActionRole, response: FormResponse,
    input: Record<string, unknown>, deliveryId: string, source: unknown, generation: number) {
    const request = requestFor(role, admission);
    await validateResponse(response);
    current(generation);
    if (restored?.authoredSignatures?.length && !signed) throw new ControllerRefusal('restoration-unresolved');
    const wording = freeze(structuredClone(config.signingContext()));
    const subject = role === 'sign' ? prepared : role === 'submit' ? signed : saved;
    if (role === 'sign' || role === 'submit') {
      if (!subject || !same(subject.response, response)) throw new ControllerRefusal('context-mismatch');
      review(subject as PreparedResponseSigning, role === 'sign' ? 'unsigned' : 'signed', wording);
      if (role === 'sign' && (input.draftId !== subject.draft.id || input.draftVersion !== subject.draft.version
        || input.responseId !== response.id || input.responseHash !== subject.draft.responseHash
        || !same(input.source, wording.source) || input.locale !== wording.locale
        || typeof input.signerName !== 'string' || !input.signerName.trim() || input.consentAccepted !== true)) throw new ControllerRefusal('context-mismatch');
      if (role === 'submit' && (input.draftId !== subject.draft.id || input.draftVersion !== subject.draft.version
        || !same(input.canonical_response, response))) throw new ControllerRefusal('context-mismatch');
      const allowed = role === 'sign' ? ['draftId', 'draftVersion', 'responseId', 'responseHash', 'source', 'locale', 'signerName', 'consentAccepted']
        : ['draftId', 'draftVersion', 'canonical_response'];
      if (Object.keys(input).some(key => !allowed.includes(key))) throw new ControllerRefusal('context-mismatch');
    }
    let delivery = deliveries.get(deliveryId);
    const identity = canonicalize({ admission, role, source, generation, context,
      responseHash: await config.hashResponse(response), draft: delivery ? delivery.baselineDraft : subject?.draft ?? null, input, wording })!;
    current(generation);
    delivery = deliveries.get(deliveryId);
    if (delivery && delivery.identity !== identity) throw new ControllerRefusal('operation-conflict');
    if (delivery?.pending) return delivery.pending;
    if (delivery?.retired) throw new ControllerRefusal('operation-conflict');
    if (busy) throw new ControllerRefusal('operation-pending');
    if (!delivery) {
      if ((role === 'saveInitial' && owned) || (role === 'saveOwned' && !owned) || (role === 'prepare' && (!owned || !saved))
        || (role === 'sign' && signed) || ((role === 'saveInitial' || role === 'saveOwned' || role === 'prepare') && signed)) throw new ControllerRefusal('branch-mismatch');
      delivery = { identity, operationId: generateIdempotencyKey(), baselineDraft: subject?.draft ?? null };
      deliveries.set(deliveryId, delivery);
    }
    const operation = delivery;
    busy = deliveryId;
    publish(role);
    const pending = (async () => {
      // The cohort owns hidden locator planning on a restored owned Save with no exposed evidence.
      if (request && (role !== 'saveOwned' || saved)) {
        const planned = planServiceRequest(request, { input: { ...input, formId: context.publication.formId,
          draftId: subject?.draft.id, draftVersion: subject?.draft.version,
          frozenResponse: response }, route: {}, session: {} });
        if ((role === 'sign' || role === 'submit') && (planned.method !== 'POST'
          || planned.path !== `/drafts/${encodeURIComponent(subject!.draft.id)}/${role}`)) throw new ControllerRefusal('action-unadmitted');
        if (role === 'submit' && (!same(planned.body, { canonical_response: response })
          || Object.keys(planned.headers).length)) throw new ControllerRefusal('action-unadmitted');
      }
      current(generation);
      if (role === 'paper') { publish('paper'); return {}; }
      const action = admission as AdmittedResponseAction;
      let result: SavedResponseDraft;
      if (role === 'saveInitial' || role === 'saveOwned') {
        result = await config.signing.saveDraft({ ...context, formVersionId: context.publication.formVersionId,
          formId: context.publication.formId,
          response, operationId: operation.operationId, action });
        current(generation); await checkEvidence(result, response); current(generation);
        saved = result; actor = result.actor.id; owned = true; prepared = undefined;
        publish('saved');
      } else if (role === 'prepare') {
        const preparation = await config.signing.prepare({ ...context, formVersionId: context.publication.formVersionId,
          response, source: wording.source, locale: wording.locale, action });
        current(generation); await checkEvidence(preparation, response); current(generation);
        if (!same(preparation.content.source, wording.source) || preparation.content.locale !== wording.locale) throw new ControllerRefusal('context-mismatch');
        prepared = preparation; saved = preparation; actor = preparation.actor.id;
        result = preparation;
        publish('prepared');
      } else if (role === 'sign') {
        review(prepared!, 'unsigned', wording);
        const signature = await config.signing.sign({ preparation: prepared!, operationId: operation.operationId,
          assent: { signerName: input.signerName as string, consentAccepted: true }, action });
        current(generation); await checkEvidence(signature); current(generation);
        if (!same(signature.content, prepared!.content) || !signature.response.authoredSignatures?.length
          || signature.verification.mode !== 'delegated-service-key' || !signature.verification.provider || !signature.verification.keyId) throw new ControllerRefusal('context-mismatch');
        signed = signature; saved = signature; result = signature;
        publish('signed');
      } else {
        operation.handoff ??= freeze(structuredClone(await config.buildHandoff(signed!.response)));
        current(generation);
        if (!same(operation.handoff.extensions?.['x-formspec-response'], signed!.response)
          || !same(operation.handoff.definitionRef, { url: signed!.response.definitionUrl, version: signed!.response.definitionVersion })
          || operation.handoff.responseRef !== `response:${signed!.response.id}`
          || operation.handoff.responseHash !== `sha256:${signed!.draft.responseHash}`
          || (operation.handoff.subjectRef !== undefined && operation.handoff.subjectRef !== actor)) throw new ControllerRefusal('context-mismatch');
        review(signed!, 'signed', wording);
        const confirmation = await config.submitTransport.submit(operation.handoff, operation.operationId);
        current(generation);
        const outputs = extractServiceRequestOutputs(request!, { response_id: confirmation.referenceNumber, status: confirmation.status });
        publish('submitted', undefined, confirmation);
        return { ...outputs.transitionBindings };
      }
      const outputs = extractServiceRequestOutputs(request!, result.evidence);
      if (role === 'saveInitial' || role === 'saveOwned' || role === 'prepare') operation.retired = true;
      return { ...outputs.transitionBindings };
    })();
    operation.pending = pending;
    try { return await pending; }
    finally { operation.pending = undefined; if (busy === deliveryId) busy = undefined; }
  }
  function fail(error: unknown, generation: number) {
    if (generation !== epoch) return 'context-obsolete';
    const reason = error instanceof ControllerRefusal ? error.code : 'port-failed';
    if (reason !== 'context-obsolete') publish(error instanceof ControllerRefusal ? 'refused' : 'failed', reason);
    return reason;
  }
  const definitionInvoker: ResponseActionInvoker<SubmitResult> = async input => {
    const generation = epoch;
    const deliveryId = input.invocationContext?.invocationId ?? generateIdempotencyKey();
    try {
      const [role, admission] = roleFor(input.document, input.actionRef);
      if (!['saveInitial', 'saveOwned', 'prepare', 'paper'].includes(role)) throw new ControllerRefusal('action-unadmitted');
      requestFor(role, admission);
      return await invokeResponseActionAsync(admission.document, input.actionRef, { ...input.ports,
        dispatchHostEvent: () => { current(generation); publish('paper'); },
        resolveIdempotencyKey: () => deliveryId,
        dispatchEffect: async (_effect, detail) => {
          try {
            const transitionBindings = await perform(role, admission, freeze(structuredClone(detail.response)), {}, deliveryId,
              { nodeId: input.nodeId ?? null }, generation);
            return { outcome: { type: 'serviceRequest', status: 'succeeded' }, transitionBindings };
          } catch (error) { return { type: 'serviceRequest', status: 'failed', reason: fail(error, generation) }; }
        },
      }, input.nodeId, { ...input.invocationContext, invocationId: deliveryId });
    } catch (error) {
      return failure(input.document, input.actionRef, deliveryId, fail(error, generation));
    }
  };
  const widgetExecutor: SurfaceWidgetActionExecutor = async input => {
    const generation = epoch;
    try {
      const [role, admission] = roleFor(input.document, input.actionRef);
      if (!['sign', 'submit', 'paper'].includes(role) || !same(admission.widgetSource, input.source)
        || !input.responseContext || !admission.responseSource
        || input.responseContext.inputName !== admission.responseSource.inputName
        || !same(input.responseContext.source, { catalogRef: admission.responseSource.catalogRef, sourceRef: admission.responseSource.sourceRef })
        || !same(input.responseContext.definition, context.definition)) throw new ControllerRefusal('context-mismatch');
      const response = freeze(structuredClone(input.responseContext.response));
      const selected = freeze(structuredClone(input.input ?? {}));
      requestFor(role, admission);
      await validateResponse(response);
      current(generation);
      if (role !== 'paper' && !same(response, (role === 'sign' ? prepared : signed)?.response)) throw new ControllerRefusal('context-mismatch');
      const tuple = resolveResponseActionValidationTuple(resolveResponseAction(admission.document, input.actionRef).action!);
      const validated = freeze(structuredClone(await config.validateFrozenResponse(response, freeze(structuredClone(tuple)))));
      current(generation);
      if (!same(validated.response, response) || !same(validated.validationTuple, tuple)
        || !validated.validationReport || validated.validationReport.definitionUrl !== response.definitionUrl
        || validated.validationReport.definitionVersion !== response.definitionVersion) throw new ControllerRefusal('context-mismatch');
      const invocation = await invokeResponseActionAsync<SubmitResult>(admission.document, input.actionRef, {
        submit: () => validated,
        dispatchHostEvent: () => { current(generation); publish('paper'); }, resolveIdempotencyKey: () => input.invocationId,
        dispatchEffect: async () => {
          try {
            const transitionBindings = await perform(role, admission, response, selected, input.invocationId, input.source, generation);
            return { outcome: { type: 'serviceRequest', status: 'succeeded' }, transitionBindings };
          } catch (error) { return { type: 'serviceRequest', status: 'failed', reason: fail(error, generation) }; }
        },
      }, undefined, { invocationId: input.invocationId, actionArtifact: { artifactRef: admission.artifactRef, artifactDigest: admission.artifactDigest } });
      if (invocation.status === 'blocked' && generation === epoch && !invalidated) publish('refused', 'response-invalid');
      return invocation;
    } catch (error) { return failure(input.document, input.actionRef, input.invocationId, fail(error, generation)); }
  };
  return {
    definitionInvoker, widgetExecutor,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    invalidate() {
      epoch++; invalidated = true; owned = false; saved = undefined; prepared = undefined; signed = undefined;
      publish('refused', 'context-obsolete');
    },
  };
}
function failure(document: Parameters<ResponseActionInvoker>[0]['document'], actionRef: string, invocationId: string,
  reason: ResponseActionControllerReason): ResponseActionInvocationResult<SubmitResult> {
  return { status: 'failed', invocationId, resolution: resolveResponseAction(document, actionRef), validationTuple: null,
    detail: null, effectTrace: [], failureReason: reason };
}
function same(a: unknown, b: unknown): boolean { return canonicalize(a) === canonicalize(b); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
