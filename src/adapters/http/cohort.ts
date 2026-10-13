import { ownedDraftResumeSelection } from '../../config/owned-draft-resume.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
/**
 * HTTP adapter cohort (FW-0064).
 *
 * Composition helper that constructs `HttpDraftStore` + `HttpSubmitTransport`
 * as a unit and shares the draft binding (form `DraftKey` -> server draft id)
 * through a private `DraftBindingRegistry` captured in the cohort closure.
 *
 * Replaces the pre-FW-0064 coupling where the composition root smuggled the
 * draft key through `IntakeHandoff.extensions['x-formspec-draft-key']` and
 * read it back via `HttpDraftStore.draftIdFor()`. Both that extension entry
 * and the `draftIdFor` method are gone (no shims). The submit transport now
 * derives the `DraftKey` from `handoff.definitionRef + handoff.subjectRef`,
 * which `RespondentRuntime.createReadyState` and `buildIntakeHandoff` already
 * keep aligned with the save-side key.
 *
 * Port contracts (`DraftStore`, `SubmitTransport`) are unchanged — this is
 * an adapter-composition concern (web ADR-0008) inside the formspec-stack
 * reference deployment.
 */

import { ResponseSigningUnresolvedError } from '../../ports/response-signing.ts';
import type { FormDefinition, LocaleDocument } from '@formspec-org/types';
import { resolveAuthoredSigningContent } from '@formspec-org/engine/render';
import canonicalize from 'canonicalize';
import { formspecTenantHeaderNames, tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import type { DraftKey, DraftReadState, DraftStore } from '../../ports/draft-store.ts';
import type { ApplicationLifecycle, ApplicationLifecycleCapabilities } from '../../ports/application-lifecycle.ts';
import { HttpApplicationLifecycle } from './application-lifecycle.ts';
import type { AdmittedResponseAction, ResponseSigning, VerifiedDraftEvidence } from '../../ports/response-signing.ts';
import type { IntakeHandoff, SubmitTransport } from '../../ports/submit-transport.ts';
import type { AnonymousSessionBridge } from './anonymous-session.ts';
import { createDraftBindingRegistry } from './draft-binding-registry.ts';
import { HttpDraftStore } from './draft-store.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';
import { HttpClient, HttpAdapterError, type HttpClientConfig } from './http-client.ts';
import { HttpSubmitTransport } from './submit-transport.ts';
import type { DraftResumeMetadataStore } from '../browser/draft-resume-metadata.ts';
import { assertDelegatedSignedResponseConsistency, handoffHash, savedResponseDraftFromVerifiedRead, HttpResponseSigning, ResponseSigningScopeFence, type HttpResponseSigningPolicy } from './response-signing.ts';
import { assertSignedTaskDraft } from '../../shared/task-draft-wire.ts';

export type { DraftBindingRegistry, DraftBindingSnapshot } from './draft-binding-registry.ts';

export interface HttpAdapterCohortConfig extends HttpClientConfig {
  /** Actual Source launch result supplied by the task composition owner. */
  taskDraft?: { key: DraftKey; view: VerifiedDraftEvidence };
  applicationLifecycle?: { capabilities: ApplicationLifecycleCapabilities; action: AdmittedResponseAction };
  formIdResolver?: FormIdResolver;
  /**
   * When supplied, the cohort routes anonymous session bookkeeping through
   * the shared bridge — the draft store consults `tokenForDraftKey(key)` on
   * save and the submit transport consults `tokenForHandoff(handoff)` on
   * submit. Adopters who do not need anonymous sessions can omit it.
   */
  anonymousSessions?: AnonymousSessionBridge;
  responseIdResolver?: (handoff: IntakeHandoff) => string | undefined;
  responseDataResolver?: (handoff: IntakeHandoff) => Record<string, unknown>;
  signingRequested?: boolean | ((handoff: IntakeHandoff) => boolean);
  resumeMetadata?: DraftResumeMetadataStore;
  /** Explicitly injected signing policy; omission preserves the existing unsigned cohort. */
  responseSigning?: HttpResponseSigningPolicy;
  /** Exact admitted package publication; only this opt-in exposes state-aware terminal recovery. */
  qualifiedDraftState?: { definition: FormDefinition; formVersionId: string; localeDocuments: readonly LocaleDocument[] };
}

export interface HttpAdapterCohort {
  draftStore: DraftStore;
  submitTransport: SubmitTransport;
  responseSigning?: ResponseSigning;
  applicationLifecycle?: ApplicationLifecycle;
  /** Retire local signing authority; preserve persisted drafts and uncertain-operation markers. */
  invalidateResponseSigningScope?: (key: DraftKey) => void;
}

export function createHttpAdapterCohort(config: HttpAdapterCohortConfig): HttpAdapterCohort {
  if (config.responseSigning && !config.resumeMetadata) {
    throw new Error('Response signing requires injected draft resume metadata for unresolved operation recovery');
  }
  if (config.qualifiedDraftState && !config.responseSigning) throw new Error('Qualified draft state requires the maintained signing policy');
  if (config.qualifiedDraftState) {
    const headers = config.tenantBinding ? tenantScopeHeaders(config.tenantBinding) : {};
    if (Object.values(formspecTenantHeaderNames).some(name => !headers[name]?.trim())) throw new Error('Qualified draft state requires all four tenant scope headers');
  }
  if (config.applicationLifecycle && (!config.qualifiedDraftState || !config.responseSigning)) throw new Error('Application lifecycle requires a qualified signing publication');
  const resolveFormId = config.formIdResolver ?? defaultFormIdResolver;
  const registry = createDraftBindingRegistry({ resumeMetadata: config.resumeMetadata, formIdResolver: config.formIdResolver });
  if (config.taskDraft) {
    const { key, view } = structuredClone(config.taskDraft);
    if (!config.responseSigning || !config.qualifiedDraftState || config.anonymousSessions || config.applicationLifecycle
      || !view.taskDraft || key.subjectRef !== view.subject_ref
      || key.formUrl !== config.qualifiedDraftState.definition.url || key.formVersion !== config.qualifiedDraftState.definition.version
      || view.form_version_id !== config.qualifiedDraftState.formVersionId) throw new Error('Task draft cohort selection mismatch');
    registry.put(key, { draftId: view.draft_id, draftVersion: view.draft_version, response: view.canonical_response });
  }
  const { applicationLifecycle: lifecycleCapabilities, anonymousSessions, responseIdResolver, responseDataResolver, signingRequested,
    taskDraft: taskDraftSelection, resumeMetadata: _resumeMetadata, responseSigning: signingPolicyInput, qualifiedDraftState: statePolicyInput, ...httpConfig } = config;
  const signingPolicy = signingPolicyInput ? Object.freeze({ ...signingPolicyInput }) : undefined;
  const statePolicy = statePolicyInput ? structuredClone(statePolicyInput) : undefined;
  const ownerFor = async (key: DraftKey) => {
    if (taskDraftSelection) {
      if (key.subjectRef !== taskDraftSelection.view.subject_ref || key.formUrl !== taskDraftSelection.key.formUrl
        || key.formVersion !== taskDraftSelection.key.formVersion || key.partyRef !== taskDraftSelection.key.partyRef) {
        throw new Error('Task draft owner selection mismatch');
      }
      return { subjectRef: taskDraftSelection.view.subject_ref };
    }
    if (key.subjectRef && !key.subjectRef.startsWith('anon:')) return { subjectRef: key.subjectRef };
    if (!anonymousSessions) throw new Error('Signing requires an owned anonymous session');
    const session = await anonymousSessions.sessionForForm(key.formUrl, key.formVersion, true);
    if (key.subjectRef && key.subjectRef !== session.subjectRef) throw new Error('Signing actor differs from the server owner');
    return { token: session.sessionToken, subjectRef: session.subjectRef };
  };
  const draftStore: HttpDraftStore = new HttpDraftStore({
    ...httpConfig,
    bindingRegistry: registry,
    requireExistingBinding: taskDraftSelection !== undefined,
    qualifyReadState: statePolicy ? async (key, view, current) => {
      const owner = await ownerFor(key); current();
      const response = view.canonical_response;
      if (taskDraftSelection && (view.taskDraft?.associationHash !== taskDraftSelection.view.taskDraft?.associationHash
        || view.taskDraft?.taskBindingHash !== taskDraftSelection.view.taskDraft?.taskBindingHash
        || canonicalize(view.taskDraft?.taskPrefill ?? null) !== canonicalize(taskDraftSelection.view.taskDraft?.taskPrefill ?? null)))
        throw new Error('Task draft composition metadata changed');
      if (key.formUrl !== statePolicy.definition.url || key.formVersion !== statePolicy.definition.version
        || view.form_version_id !== statePolicy.formVersionId || !statePolicy.formVersionId.trim()
        || view.subject_ref !== owner.subjectRef || !response.id?.trim()
        || !Number.isSafeInteger(view.draft_version) || view.draft_version < 1
        || !['in_progress', 'submitted'].includes(view.status ?? '')) throw new Error('Owned draft state differs from its qualified publication');
      if (view.status === 'in_progress' && (!response.authoredSignatures?.length || responseSigning.hasPending(key))) {
        if (response.extensions?.['x-formspec-signing-content'] || responseSigning.hasPending(key)) {
          const recovery = await responseSigning.pendingRecoveryFor(key, view.draft_id, view.draft_version, response); current();
          const original = recovery.original;
          const commitment = original.extensions?.['x-formspec-signing-content'];
          if (!commitment) throw new ResponseSigningUnresolvedError();
          const operationId = recovery.marker.operationId;
          const displayed = response.displayedLocale;
          const locales = displayed && statePolicy.localeDocuments.filter(document => document.url === displayed.url
            && document.version === displayed.version && document.locale.toLowerCase() === displayed.locale.toLowerCase()
            && document.target.kind === 'definition' && document.target.url === statePolicy.definition.url);
          if (response.status !== 'completed' || !locales || locales.length !== 1
            || commitment.actorRef !== owner.subjectRef || commitment.draftId !== view.draft_id
            || commitment.draftVersion !== recovery.marker.version || commitment.content.locale.toLowerCase() !== displayed!.locale.toLowerCase()) throw new Error('Active draft has incomplete signing evidence');
          const content = resolveAuthoredSigningContent({ definition: statePolicy.definition, response: original,
            source: commitment.content.source, locale: commitment.content.locale, validateContent: signingPolicy!.validateContent });
          if (canonicalize(content) !== canonicalize(commitment.content)) throw new Error('Active draft has incomplete signing evidence');
          const responseHash = await handoffHash(response); current();
          return { kind: 'active', response, pendingSign: { operationId, content, response, draftKey: key,
            draft: { id: view.draft_id, version: view.draft_version, responseHash }, actor: { id: owner.subjectRef },
            evidence: { draft_id: view.draft_id, draft_version: view.draft_version, form_version_id: view.form_version_id!,
              subject_ref: owner.subjectRef, draft_state: view.draft_state, canonical_response: response, status: 'in_progress',
              ...(view.taskDraft === undefined ? {} : { taskDraft: view.taskDraft }) } } };
        }
        responseSigning.assertEditable(key);
        const savedDraft = await savedResponseDraftFromVerifiedRead(key, {
          draft_id: view.draft_id, draft_version: view.draft_version, form_version_id: view.form_version_id!,
          subject_ref: owner.subjectRef, draft_state: view.draft_state, canonical_response: response, status: 'in_progress',
          ...(view.taskDraft === undefined ? {} : { taskDraft: view.taskDraft }),
        });
        current(); responseSigning.assertEditable(key);
        return { kind: 'active', response, savedDraft };
      }
      const displayed = response.displayedLocale;
      const locale = displayed && statePolicy.localeDocuments.filter(document => document.url === displayed.url && document.version === displayed.version
        && document.locale.toLowerCase() === displayed.locale.toLowerCase() && document.target.kind === 'definition'
        && document.target.url === statePolicy.definition.url);
      const commitment = response.extensions?.['x-formspec-signing-content'];
      if (response.status !== 'completed' || !locale || locale.length !== 1 || !commitment
        || commitment.actorRef !== owner.subjectRef || commitment.draftId !== view.draft_id
        || !Number.isSafeInteger(commitment.draftVersion) || view.draft_version !== commitment.draftVersion + (view.status === 'submitted' ? 2 : 1)
        || commitment.content.locale.toLowerCase() !== displayed!.locale.toLowerCase()) throw new Error('Submitted draft has no matching Locale or signing commitment');
      const content = resolveAuthoredSigningContent({ definition: statePolicy.definition, response,
        source: commitment.content.source, locale: commitment.content.locale, validateContent: signingPolicy!.validateContent });
      if (canonicalize(content) !== canonicalize(commitment.content)) throw new Error('Submitted signing content differs from the authored package');
      await assertDelegatedSignedResponseConsistency(response, signingPolicy!); current();
      if (view.status === 'in_progress') {
        responseSigning.assertEditable(key);
        const responseHash = await handoffHash(response); current();
        if (taskDraftSelection) assertSignedTaskDraft(view.taskDraft, { id: view.draft_id, version: view.draft_version, responseHash });
        return { kind: 'active', response, signed: { draftKey: key, response, content,
          draft: { id: view.draft_id, version: view.draft_version, responseHash }, actor: { id: owner.subjectRef },
          evidence: { draft_id: view.draft_id, draft_version: view.draft_version, form_version_id: view.form_version_id!,
            subject_ref: owner.subjectRef, draft_state: view.draft_state, canonical_response: response, status: 'in_progress',
            ...(view.taskDraft === undefined ? {} : { taskDraft: view.taskDraft }) },
          verification: { mode: 'delegated-service-key', provider: response.authoredSignatures![0].signatureProvider, keyId: signingPolicy!.keyId } } };
      }
      return { kind: 'submitted', response, draft: { id: view.draft_id, version: view.draft_version },
        subjectRef: owner.subjectRef, formVersionId: view.form_version_id! };
    } : undefined,
    anonymousSessionToken: anonymousSessions
      ? (key) => anonymousSessions.tokenForDraftKey(key, registry.get(key) !== undefined)
      : undefined,
    clearAnonymousSession: anonymousSessions
      ? key => anonymousSessions.clearForForm(key.formUrl, key.formVersion, {
        preserveGrant: registry.entries().some(({ key: retained }) =>
          resolveFormId(retained.formUrl, retained.formVersion) === resolveFormId(key.formUrl, key.formVersion)),
      })
      : undefined,
  });
  const submitTransport: SubmitTransport = taskDraftSelection ? {
    submit: async () => { throw new Error('Task drafts require typed task completion'); },
  } : new HttpSubmitTransport({
    ...httpConfig,
    draftIdResolver: (handoff) => registry.get(draftKeyFromHandoff(handoff))?.draftId,
    responseIdResolver,
    responseDataResolver,
    signingRequested,
    anonymousSessionToken: anonymousSessions
      ? (handoff) => anonymousSessions.tokenForHandoff(handoff, true)
      : undefined,
  });
  if (!signingPolicy) return { draftStore, submitTransport };
  const fence = new ResponseSigningScopeFence(key => JSON.stringify({
    formId: resolveFormId(key.formUrl, key.formVersion), subject: key.subjectRef ?? null, party: key.partyRef ?? null,
  }));
  const responseSigning: HttpResponseSigning = new HttpResponseSigning({
    ...signingPolicy, client: new HttpClient(httpConfig), drafts: draftStore, bindings: registry, fence,
    formIdFor: key => resolveFormId(key.formUrl, key.formVersion),
    resumeMetadata: config.resumeMetadata,
    expectedTaskDraft: taskDraftSelection?.view.taskDraft ? structuredClone(taskDraftSelection.view.taskDraft) : undefined,
    ownerFor,
  });
  const readScopedState = (suppliedKey: DraftKey, read: (key: DraftKey, current: () => void) => Promise<DraftReadState | undefined>, assertCurrent: () => void = () => {}) => {
    const key = structuredClone(suppliedKey);
    return fence.run(key, async generation => {
      const current = () => { assertSynchronousGuard(assertCurrent); fence.assertCurrent(key, generation); };
      current();
      const state = await read(key, current);
      let application;
      if (state && applicationLifecycle) {
        try { application = await applicationLifecycle.loadInCurrentScope(key, generation); }
        catch (error) {
          current();
          if (!(error instanceof HttpAdapterError) || error.status !== 503) throw error;
          return { ...state, applicationLookup: Object.freeze({ status: 'unavailable' as const, statusCode: 503 as const }) };
        }
      }
      current();
      return state && application ? { ...state, application } : state;
    });
  };
  const scopedDrafts: DraftStore = {
    load: key => fence.run(key, async generation => draftStore.load(key, () => fence.assertCurrent(key, generation))),
    ...(draftStore.readState ? { readState: (key: DraftKey) => readScopedState(key, (key, current) => draftStore.readState!(key, current)) } : {}),
    ...(draftStore.resumeState && config.accessToken && !anonymousSessions && !taskDraftSelection ? {
      resumeState: async (key, suppliedSelection, assertCurrent = () => {}) => {
        const selection = ownedDraftResumeSelection(suppliedSelection);
        const result = await readScopedState(key, (key, current) => draftStore.resumeState!(key, selection, current), assertCurrent);
        if (!result) throw new Error('Selected owned draft state unavailable');
        return result;
      },
    } : {}),
    save: (key, response, options) => {
      const guard = options?.assertBeforeDispatch?.bind(options);
      return fence.run(key, async () => {
        responseSigning.assertEditable(key);
        await draftStore.save(key, response, guard ? { assertBeforeDispatch: guard } : undefined);
      });
    },
    list: subject => draftStore.list(subject),
    delete: key => fence.clear(key, async () => {
      await draftStore.delete(key);
      responseSigning.clearScope(key);
    }),
    async invalidateSubject(subject) {
      if (statePolicy && subject && !subject.startsWith('anon:')) {
        const keys = registry.entries().filter(entry => entry.key.subjectRef === subject).map(entry => entry.key);
        for (const key of keys) fence.invalidate(key);
        await draftStore.retireSubject(subject);
        return;
      }
      for (const key of await draftStore.list(subject)) await scopedDrafts.delete(key);
    },
  };
  const scopedSubmit: SubmitTransport = {
    submit: (handoff, operationId, assertCurrent = () => {}, options) => {
      const capturedOptions = options === undefined ? undefined : structuredClone(options);
      assertSynchronousGuard(assertCurrent);
      const key = draftKeyFromHandoff(handoff);
      return fence.run(key, async generation => {
        responseSigning.assertEditable(key);
        const binding = registry.get(key);
        const response = handoff.extensions?.['x-formspec-response'];
        if (binding?.response?.authoredSignatures?.length
          && JSON.stringify(response) !== JSON.stringify(binding.response)) {
          throw new Error('Signed submission must preserve the exact saved Response');
        }
        return submitTransport.submit(handoff, operationId, () => {
          fence.assertCurrent(key, generation);
          assertSynchronousGuard(assertCurrent);
        }, capturedOptions);
      });
    },
  };
  const applicationLifecycle = lifecycleCapabilities ? new HttpApplicationLifecycle({ client: new HttpClient(httpConfig), bindings: registry, fence,
    publication: { formId: resolveFormId(statePolicy!.definition.url, statePolicy!.definition.version), formVersionId: statePolicy!.formVersionId },
    definition: { url: statePolicy!.definition.url, version: statePolicy!.definition.version }, capabilities: lifecycleCapabilities.capabilities, action: lifecycleCapabilities.action }) : undefined;
  return { draftStore: scopedDrafts, submitTransport: scopedSubmit, responseSigning, applicationLifecycle,
    invalidateResponseSigningScope: key => fence.invalidate(key) };
}

/**
 * Derives the `DraftKey` from the handoff fields `RespondentRuntime` already
 * populates on save (`definition.url`, `definition.version`, `claim?.subjectRef`).
 * `buildIntakeHandoff` mirrors those fields onto `definitionRef + subjectRef`,
 * so the derivation here is the inverse of the construction there. Exported
 * so cohort-level tests can pin the derivation explicitly.
 *
 * Binding is keyed by save-time `subjectRef`. Identity transitions
 * (anonymous → authenticated mid-session) change `subjectRef` and orphan the
 * prior binding — submit will fail with "requires a draft id" unless
 * `RespondentRuntime` re-saves after the transition. The `DraftStore` exposes
 * `invalidateSubject` for explicit rebinding; wiring it to the identity-change
 * signal is follow-on work tracked separately.
 */
export function draftKeyFromHandoff(handoff: IntakeHandoff): DraftKey {
  return {
    formUrl: handoff.definitionRef.url,
    formVersion: handoff.definitionRef.version,
    subjectRef: handoff.subjectRef ?? undefined,
    partyRef: partyRefFromHandoff(handoff),
  };
}

function partyRefFromHandoff(handoff: IntakeHandoff): string | undefined {
  const candidate = handoff.extensions?.['x-formspec-active-party-ref'];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}
