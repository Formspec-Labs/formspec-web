import { ResponseCompletionRefusal } from '../ports/response-completion.ts';
import canonicalize from 'canonicalize';
import { extractServiceRequestOutputs, invokeResponseActionAsync, planServiceRequest, resolveResponseAction, resolveResponseActionValidationTuple, resolveServiceRequest, type ResponseActionInvocationResult } from '@formspec-org/engine/render';
import type { ResponseActionInvoker, SubmitResult } from '@formspec-org/react';
import type { SurfaceWidgetActionExecutor, SurfaceWidgetActionSource } from '@formspec-org/surface-react';
import type { FormDefinition, FormResponse, SigningContentSource, ValidationOverride } from '@formspec-org/types';
import type { ApplicationCaseReceipt, ApplicationLifecycle, ApplicationCaseLookupUnavailable } from '../ports/application-lifecycle.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { AdmittedResponseAction, PendingResponseSigning, PreparedResponseSigning, ResponseSigning, SavedResponseDraft, SignedResponseSigning } from '../ports/response-signing.ts';
import type { IntakeHandoff, SubmitConfirmation, SubmitTransport, SubmitOptions } from '../ports/submit-transport.ts';
import type { ResponseCompletion, PreparedResponseCompletion, ResponseCompletionResult } from '../ports/response-completion.ts';
import { createIntakeResponseCompletion } from './intake-response-completion.ts';
import { generateIdempotencyKey, isUuidV7IdempotencyKey } from './idempotency-key.ts';

export type ResponseActionRole = 'startApplication' | 'saveInitial' | 'saveOwned' | 'prepare' | 'sign' | 'submit' | 'paper';
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
  application?: ApplicationCaseReceipt;
  applicationLookup?: ApplicationCaseLookupUnavailable;
  retrySignAvailable?: true;
  pendingSign?: true;
  reason?: ResponseActionControllerReason;
  saved?: SavedResponseDraft;
  prepared?: PreparedResponseSigning;
  signed?: SignedResponseSigning;
  confirmation?: SubmitConfirmation;
  completion?: ResponseCompletionResult;
}
export interface ResponseActionControllerConfig {
  applicationLifecycle?: ApplicationLifecycle;
  restoredApplication?: ApplicationCaseReceipt;
  restoredApplicationLookup?: ApplicationCaseLookupUnavailable;
  context: ResponseActionControllerContext;
  roles: Partial<Record<ResponseActionRole, QualifiedResponseActionRole>>;
  restoredResponse?: FormResponse;
  signing: ResponseSigning;
  submitTransport?: SubmitTransport;
  completion?: ResponseCompletion;
  captureSubmitOptions?: (signed: SignedResponseSigning) => SubmitOptions | Promise<SubmitOptions>;
  validateResponse: (response: unknown) => boolean | Promise<boolean>;
  validateFrozenResponse: (response: FormResponse, tuple: ValidationOverride) =>
    (SubmitResult & { validationTuple: ValidationOverride }) | Promise<SubmitResult & { validationTuple: ValidationOverride }>;
  hashResponse: (response: FormResponse) => Promise<string>;
  signingContext: () => { source: SigningContentSource; locale: string };
  reviewReady: (context: Readonly<ResponseActionReviewContext>, stage: 'unsigned' | 'signed') => boolean;
  /** Await downstream checks after durable publication; rejection never changes the committed effect. */
  afterCommittedDraft?: (saved: SavedResponseDraft) => void | Promise<void>;
  /** Trusted adapter reconciles owned results first and freshly gates every uncommitted Sign write. */
  reconcileSignRetries?: true;
  buildHandoff?: (response: FormResponse) => IntakeHandoff | Promise<IntakeHandoff>;
}
interface SignRetry {
  request: Parameters<SurfaceWidgetActionExecutor>[0];
  identity: string;
  validated: Awaited<ReturnType<ResponseActionControllerConfig['validateFrozenResponse']>>;
}
interface Delivery {
  identity: string;
  operationId: string;
  pending?: Promise<Record<string, string>>;
  completionPreparation?: PreparedResponseCompletion;
  baselineDraft: SavedResponseDraft['draft'] | null;
  signRetry?: SignRetry;
  retired?: boolean;
  completed?: Record<string, string>;
}
class ControllerRefusal extends Error {
  constructor(readonly code: ResponseActionControllerReason) { super(code); }
}

/** Port-only controller. Loaded artifacts select roles; no product IDs or transport paths select them. */
export function createResponseActionController(config: ResponseActionControllerConfig) {
  const context = freeze(structuredClone(config.context));
  const roles = freeze(structuredClone(config.roles));
  const restored = config.restoredResponse ? freeze(structuredClone(config.restoredResponse)) : undefined;
  const completion = config.completion ?? (config.buildHandoff && config.submitTransport
    ? createIntakeResponseCompletion({ buildHandoff: config.buildHandoff, submitTransport: config.submitTransport }) : undefined);
  const lifetime = new AbortController();
  let completionResult: ResponseCompletionResult | undefined;
  let epoch = 0;
  let invalidated = false;
  let owned = restored !== undefined;
  let actor = context.expectedActor;
  let application = config.restoredApplication ? freeze(structuredClone(config.restoredApplication)) : undefined;
  let applicationLookup = config.restoredApplicationLookup ? freeze(structuredClone(config.restoredApplicationLookup)) : undefined;
  let saved: SavedResponseDraft | undefined;
  // Keep the actual cohort preparation privately: its WeakMap identity authorizes Sign.
  let prepared: PreparedResponseSigning | undefined;
  let pendingOperationId: string | undefined;
  let signed: SignedResponseSigning | undefined;
  let busy: string | undefined;
  let retryableSign: SignRetry | undefined;
  let retryingSign: Promise<Awaited<ReturnType<SurfaceWidgetActionExecutor>>> | undefined;
  let confirmedDelivery: string | undefined;
  let completedSubmit: { identity: string; result: ResponseActionInvocationResult<SubmitResult> } | undefined;
  let snapshot: ResponseActionControllerSnapshot = freeze({ phase: 'idle', owned, ...(application ? { application } : {}), ...(applicationLookup ? { applicationLookup } : {}) });
  const listeners = new Set<() => void>();
  const deliveries = new Map<string, Delivery>();

  function publish(phase: ResponseActionControllerSnapshot['phase'], reason?: ResponseActionControllerReason) {
    snapshot = freeze(structuredClone({ phase, owned, ...(pendingOperationId ? { pendingSign: true } : {}), ...(retryableSign && !busy ? { retrySignAvailable: true } : {}), ...(reason ? { reason } : {}),
      ...(application ? { application } : {}), ...(applicationLookup ? { applicationLookup } : {}), ...(saved ? { saved } : {}), ...(prepared ? { prepared } : {}), ...(signed ? { signed } : {}), ...(completionResult ? { completion: completionResult, ...(completionResult.kind === 'intake' ? { confirmation: completionResult.confirmation } : {}) } : {}) }));
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
    const tuple = resolveResponseActionValidationTuple(action);
    if (role === 'startApplication' && (action.intent !== 'x-start-application'
      || !same(tuple, { profile: 'off', blocking: 'non-blocking', persistence: 'none' }))) throw new ControllerRefusal('action-unadmitted');
    if (action.effects?.length !== 1) throw new ControllerRefusal('action-unadmitted');
    const effect = action.effects[0];
    if (role === 'paper') {
      if (effect.type !== 'hostEvent' || effect.eventName === 'formspec-submit') throw new ControllerRefusal('action-unadmitted');
      return undefined;
    }
    if (effect.type !== 'serviceRequest' || effect.requestRef !== admission.requestRef
      || effect.idempotencyKey !== '@invocation.id' || !admission.artifactRef || !admission.artifactDigest) throw new ControllerRefusal('action-unadmitted');
    const request = resolveServiceRequest(admission.document['x-formspec-runtime'], admission.requestRef!);
    if (role === 'submit') {
      if (!completion) throw new ControllerRefusal('action-unadmitted');
      completion.admit(request);
      return request;
    }
    if (!same(request.successStatuses, [200])) throw new ControllerRefusal('action-unadmitted');
    const fields = role === 'startApplication' ? ['/caseLedgerId', '/caseReference', '/draftRef', '/status']
      : ['/draft_id', '/form_version_id', '/subject_ref', '/draft_version', '/draft_state', '/canonical_response', '/status'];
    for (const [name, output] of Object.entries(request.outputs ?? {})) {
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !fields.includes(output.path)
        || (output.exposure !== undefined && !['internal', 'transition'].includes(output.exposure))
        || (output.exposure === 'transition' && (role === 'startApplication' || !['/draft_id', '/form_version_id', '/subject_ref', '/status', '/response_id'].includes(output.path)))) {
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
  async function afterCommit(result: SavedResponseDraft) {
    try { await config.afterCommittedDraft?.(freeze(structuredClone(result))); }
    catch { /* The host publishes downstream Pending separately; this receipt remains committed. */ }
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
  function checkRestoredSigned(result: SignedResponseSigning, wording: { source: SigningContentSource; locale: string }) {
    if ((context.draftKey.subjectRef && result.actor.id !== context.draftKey.subjectRef)
      || !same(result.content, result.response.extensions?.['x-formspec-signing-content']?.content)
      || !same(result.content.source, wording.source) || result.content.locale !== wording.locale
      || result.response.authoredSignatures?.length !== 1 || result.verification?.mode !== 'delegated-service-key'
      || result.verification.provider !== result.response.authoredSignatures[0].signatureProvider || !result.verification.keyId) throw new ControllerRefusal('context-mismatch');
  }
  function review(result: PreparedResponseSigning | SignedResponseSigning, stage: 'unsigned' | 'signed', wording: { source: SigningContentSource; locale: string }) {
    if (!same(result.content.source, wording.source) || result.content.locale !== wording.locale
      || !config.reviewReady(freeze(structuredClone({ response: result.response, draft: result.draft, actor: result.actor,
        ...wording, generation: context.generation })), stage)) throw new ControllerRefusal('review-unready');
  }
  async function perform(role: ResponseActionRole, admission: QualifiedResponseActionRole, response: FormResponse,
    input: Record<string, unknown>, deliveryId: string, source: unknown, generation: number, signRetry?: SignRetry) {
    if (pendingOperationId && role !== 'sign') throw new ControllerRefusal('operation-conflict');
    const request = requestFor(role, admission);
    const recoveringSign = role === 'sign' && config.reconcileSignRetries && signRetry !== undefined
      && deliveries.get(deliveryId)?.signRetry === signRetry;
    await validateResponse(response);
    current(generation);
    if (applicationLookup && (role === 'startApplication' || role === 'submit')) throw new ControllerRefusal('branch-mismatch');
    if (role === 'startApplication' && (!config.applicationLifecycle?.capabilities.earlyCaseCreation
      || config.applicationLifecycle.capabilities.formVersionId !== context.publication.formVersionId || signed)) throw new ControllerRefusal('branch-mismatch');
    if (restored?.authoredSignatures?.length && !signed) throw new ControllerRefusal('restoration-unresolved');
    const wording = freeze(structuredClone(config.signingContext()));
    const subject = role === 'sign' ? prepared : role === 'submit' ? signed : saved;
    if (role === 'sign' || role === 'submit') {
      if (!subject || !same(subject.response, response)) throw new ControllerRefusal('context-mismatch');
      if (!recoveringSign) review(subject as PreparedResponseSigning, role === 'sign' ? 'unsigned' : 'signed', wording);
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
    if (delivery?.completed) return delivery.completed;
    if (completionResult) throw new ControllerRefusal('operation-conflict');
    if (busy) throw new ControllerRefusal('operation-pending');
    if (!delivery) {
      if ((role === 'saveInitial' && owned) || (role === 'saveOwned' && !owned) || (role === 'prepare' && (!owned || !saved))
        || (role === 'sign' && signed) || ((role === 'saveInitial' || role === 'saveOwned' || role === 'prepare') && signed)) throw new ControllerRefusal('branch-mismatch');
      delivery = { identity, operationId: pendingOperationId ?? generateIdempotencyKey(), baselineDraft: subject?.draft ?? null };
      deliveries.set(deliveryId, delivery);
    }
    const operation = delivery;
    if (['saveInitial', 'saveOwned', 'prepare'].includes(role)) retireSignRetry();
    busy = deliveryId;
    publish(role);
    const pending = (async () => {
      // The cohort owns hidden locator planning on a restored owned Save with no exposed evidence.
      if (request && role !== 'submit' && role !== 'startApplication' && (role !== 'saveOwned' || saved)) {
        const planned = planServiceRequest(request, { input: { ...input, formId: context.publication.formId,
          draftId: subject?.draft.id, draftVersion: subject?.draft.version,
          frozenResponse: response }, route: {}, session: {} });
        if (role === 'sign' && (planned.method !== 'POST'
          || planned.path !== `/drafts/${encodeURIComponent(subject!.draft.id)}/${role}`)) throw new ControllerRefusal('action-unadmitted');

      }
      current(generation);
      if (role === 'paper') { publish('paper'); return {}; }
      if (role === 'startApplication') {
        if (!owned) {
          const checkpoint = roles.saveInitial;
          if (!checkpoint) throw new ControllerRefusal('action-unadmitted');
          const tuple = resolveResponseActionValidationTuple(resolveResponseAction(checkpoint.document, checkpoint.actionRef).action!);
          if (!same(tuple, { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' })) throw new ControllerRefusal('action-unadmitted');
          requestFor('saveInitial', checkpoint);
          saved = await config.signing.saveDraft({ ...context, formId: context.publication.formId, formVersionId: context.publication.formVersionId,
            response, operationId: operation.operationId, action: checkpoint as AdmittedResponseAction });
          current(generation); await checkEvidence(saved, response); current(generation);
          actor = saved.actor.id; owned = true; publish('startApplication');
          await afterCommit(saved);
        }
        current(generation);
        const receipt = await config.applicationLifecycle!.start(context.draftKey, operation.operationId);
        current(generation);
        if (application && (application.caseLedgerId !== receipt.caseLedgerId || application.draftRef !== receipt.draftRef)) throw new ControllerRefusal('context-mismatch');
        if (saved && receipt.draftRef !== `urn:formspec:draft:${saved.draft.id}`) throw new ControllerRefusal('context-mismatch');
        application = freeze(structuredClone(receipt));
        publish('saved');
        return { ...extractServiceRequestOutputs(request!, application).transitionBindings };
      }
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
        if (!recoveringSign) review(prepared!, 'unsigned', wording);
        if (config.reconcileSignRetries && signRetry) operation.signRetry = signRetry;
        const signature = await config.signing.sign({ preparation: prepared!, operationId: operation.operationId,
          assent: { signerName: input.signerName as string, consentAccepted: true }, action });
        current(generation); await checkEvidence(signature); current(generation);
        if (!same(signature.content, prepared!.content) || !signature.response.authoredSignatures?.length
          || signature.verification.mode !== 'delegated-service-key' || !signature.verification.provider || !signature.verification.keyId) throw new ControllerRefusal('context-mismatch');
        retryableSign = undefined; pendingOperationId = undefined;
        signed = signature; saved = signature; result = signature;
        publish('signed');
      } else {
        const completionLifetime = { signal: lifetime.signal, assertCurrent: () => current(generation) };
        if (!operation.completionPreparation) {
          const submitOptions = await config.captureSubmitOptions?.(signed!); current(generation);
          if (completion!.kind === 'task' && submitOptions?.nativeCurrentCheck) throw new ControllerRefusal('branch-mismatch');
          operation.completionPreparation = await completion!.capture({ signed: signed!, request: request!, invocationInput: input, submitOptions }, completionLifetime);
        }
        current(generation);
        review(signed!, 'signed', wording);
        const result = freeze(structuredClone(await completion!.complete(operation.completionPreparation, operation.operationId, completionLifetime)));
        current(generation);
        if (result.kind !== completion!.kind) throw new ControllerRefusal('context-mismatch');
        completionResult = result;
        confirmedDelivery = deliveryId;
        publish('submitted');
        const outputs = extractServiceRequestOutputs(request!, result.evidence);
        operation.completed = freeze({ ...outputs.transitionBindings });
        return operation.completed;
      }
      const outputs = extractServiceRequestOutputs(request!, result.evidence);
      if (role === 'saveInitial' || role === 'saveOwned' || role === 'prepare') operation.retired = true;
      // Keep the original outputs before downstream checks; no later failure replays this write.
      operation.completed = freeze({ ...outputs.transitionBindings });
      await afterCommit(result);
      return { ...outputs.transitionBindings };
    })();
    operation.pending = pending;
    try { return await pending; }
    finally { operation.pending = undefined; if (busy === deliveryId) busy = undefined; }
  }
  function fail(error: unknown, generation: number) {
    if (generation !== epoch) return 'context-obsolete';
    const reason = error instanceof ControllerRefusal || error instanceof ResponseCompletionRefusal ? error.code : 'port-failed';
    if (reason !== 'context-obsolete' && !completionResult) publish(error instanceof ControllerRefusal || error instanceof ResponseCompletionRefusal ? 'refused' : 'failed', reason);
    return reason;
  }
  const definitionInvoker: ResponseActionInvoker<SubmitResult> = async input => {
    const generation = epoch;
    const deliveryId = input.invocationContext?.invocationId ?? generateIdempotencyKey();
    try {
      current(generation);
      if (completionResult) throw new ControllerRefusal('operation-conflict');
      const [role, admission] = roleFor(input.document, input.actionRef);
      if (!['startApplication', 'saveInitial', 'saveOwned', 'prepare', 'paper'].includes(role)) throw new ControllerRefusal('action-unadmitted');
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
      current(generation);
      const identity = canonicalize({ document: input.document, actionRef: input.actionRef, source: input.source,
        responseContext: input.responseContext, input: input.input ?? {} })!;
      if (completionResult) {
        if (input.invocationId !== confirmedDelivery) throw new ControllerRefusal('operation-conflict');
        if (completedSubmit) {
          if (identity !== completedSubmit.identity) throw new ControllerRefusal('operation-conflict');
          return completedSubmit.result;
        }
      }
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
      const retainedRetry = role === 'sign' && config.reconcileSignRetries ? deliveries.get(input.invocationId)?.signRetry : undefined;
      if (retainedRetry && retainedRetry.identity !== identity) throw new ControllerRefusal('operation-conflict');
      const validated = retainedRetry?.validated ?? freeze(structuredClone(await config.validateFrozenResponse(response, freeze(structuredClone(tuple)))));
      current(generation);
      if (!same(validated.response, response) || !same(validated.validationTuple, tuple)
        || !validated.validationReport || validated.validationReport.definitionUrl !== response.definitionUrl
        || validated.validationReport.definitionVersion !== response.definitionVersion) throw new ControllerRefusal('context-mismatch');
      const invocation = await invokeResponseActionAsync<SubmitResult>(admission.document, input.actionRef, {
        submit: () => validated,
        dispatchHostEvent: () => { current(generation); publish('paper'); }, resolveIdempotencyKey: () => input.invocationId,
        dispatchEffect: async () => {
          try {
            const transitionBindings = await perform(role, admission, response, selected, input.invocationId, input.source, generation,
              role === 'sign' && config.reconcileSignRetries ? retainedRetry ?? freeze(structuredClone({ request: input, identity, validated })) : undefined);
            return { outcome: { type: 'serviceRequest', status: 'succeeded' }, transitionBindings };
          } catch (error) { return { type: 'serviceRequest', status: 'failed', reason: fail(error, generation) }; }
        },
      }, undefined, { invocationId: input.invocationId, actionArtifact: { artifactRef: admission.artifactRef, artifactDigest: admission.artifactDigest } });
      if (role === 'sign' && invocation.status === 'failed' && generation === epoch && !invalidated) {
        retryableSign = deliveries.get(input.invocationId)?.signRetry ?? retryableSign;
        if (retryableSign) publish(snapshot.phase, snapshot.reason);
      }
      if (role === 'submit' && invocation.status === 'completed' && completionResult) {
        current(generation);
        completedSubmit = { identity, result: freeze(structuredClone(invocation)) };
      }
      if (invocation.status === 'blocked' && generation === epoch && !invalidated && !completionResult) publish('refused', 'response-invalid');
      return invocation;
    } catch (error) { return failure(input.document, input.actionRef, input.invocationId, fail(error, generation)); }
  };
  function retireSignRetry() {
    retryableSign = undefined;
    for (const delivery of deliveries.values()) delivery.signRetry = undefined;
  }
  return {
    retireSignRetry() { retireSignRetry(); publish(snapshot.phase, snapshot.reason); },
    retrySign() {
      if (retryingSign) return retryingSign;
      current(epoch);
      if (!retryableSign || busy || !config.reconcileSignRetries) throw new ControllerRefusal('branch-mismatch');
      const request = retryableSign.request;
      const pending = Promise.resolve(widgetExecutor(request));
      retryingSign = pending;
      void pending.finally(() => { if (retryingSign === pending) retryingSign = undefined; }).catch(() => {});
      return pending;
    },
    async refreshApplication() {
      const generation = epoch; current(generation);
      if ((!application && !applicationLookup) || !config.applicationLifecycle || busy) throw new ControllerRefusal('branch-mismatch');
      busy = 'application-refresh';
      try {
        const receipt = await config.applicationLifecycle.load(context.draftKey); current(generation);
        if (application && (!receipt || receipt.caseLedgerId !== application.caseLedgerId || receipt.draftRef !== application.draftRef
          || application.status === 'submitted' && receipt.status !== 'submitted')) throw new ControllerRefusal('context-mismatch');
        application = receipt ? freeze(structuredClone(receipt)) : undefined;
        applicationLookup = undefined;
        publish(snapshot.phase, snapshot.reason);
      } finally { busy = undefined; }
    },
    definitionInvoker, widgetExecutor,
    async restorePending(value: PendingResponseSigning, renewUnsignedRevision?: true) {
      value = freeze(structuredClone(value));
      const generation = epoch; current(generation);
      if (completion?.kind === 'task' || !restored || prepared || signed || saved || busy || completionResult || !config.signing.restorePending
        || !same(value.response, restored)) throw new ControllerRefusal('restoration-unresolved');
      await checkEvidence(value, restored); current(generation);
      const admission = roles.sign;
      if (!admission?.requestRef) throw new ControllerRefusal('action-unadmitted');
      const wording = config.signingContext();
      const result = await config.signing.restorePending({ draftKey: context.draftKey, definition: context.definition,
        formVersionId: context.publication.formVersionId, response: restored, ...(renewUnsignedRevision ? { renewUnsignedRevision } : {}), ...wording, action: { ...admission, requestRef: admission.requestRef } }, value.operationId);
      current(generation);
      const selected = result.kind === 'signed' ? result.signed : result.preparation;
      await checkEvidence(selected, selected.response); current(generation);
      if (!same(selected.content, value.content)) throw new ControllerRefusal('context-mismatch');
      if (result.kind === 'signed') {
        const unsigned = structuredClone(selected.response); delete unsigned.authoredSignatures;
        const previous = structuredClone(value.response); delete previous.authoredSignatures;
        if (!same(unsigned, previous)) throw new ControllerRefusal('context-mismatch');
        checkRestoredSigned(result.signed, wording);
        signed = result.signed; saved = signed; actor = signed.actor.id; publish('signed');
        await afterCommit(signed);
      } else {
        const successor = structuredClone(value.response); delete successor.extensions?.['x-formspec-signing-content'];
        if (!same(selected.response, successor) || !isUuidV7IdempotencyKey(result.operationId)) throw new ControllerRefusal('context-mismatch');
        prepared = result.preparation; saved = prepared; actor = prepared.actor.id; pendingOperationId = result.operationId; publish('prepared');
      }
    },
    async restoreSigned(value: SignedResponseSigning) {
      const generation = epoch;
      current(generation);
      if (completion?.kind === 'task' || !restored?.authoredSignatures?.length || prepared || signed || saved || busy || completionResult) throw new ControllerRefusal('restoration-unresolved');
      const result = freeze(structuredClone(value));
      await checkEvidence(result, restored); current(generation);
      const wording = config.signingContext();
      checkRestoredSigned(result, wording);
      signed = result; saved = result; actor = result.actor.id; owned = true;
      publish('signed');
      await afterCommit(result);
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    invalidate() {
      lifetime.abort(); completionResult = undefined; epoch++; invalidated = true; retryableSign = undefined; confirmedDelivery = undefined; completedSubmit = undefined; deliveries.clear(); owned = false; saved = undefined; prepared = undefined; signed = undefined;
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
