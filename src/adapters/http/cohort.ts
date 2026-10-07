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

import type { DraftKey, DraftStore } from '../../ports/draft-store.ts';
import type { ResponseSigning } from '../../ports/response-signing.ts';
import type { IntakeHandoff, SubmitTransport } from '../../ports/submit-transport.ts';
import type { AnonymousSessionBridge } from './anonymous-session.ts';
import { createDraftBindingRegistry } from './draft-binding-registry.ts';
import { HttpDraftStore } from './draft-store.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import { HttpSubmitTransport } from './submit-transport.ts';
import type { DraftResumeMetadataStore } from '../browser/draft-resume-metadata.ts';
import { HttpResponseSigning, ResponseSigningScopeFence, type HttpResponseSigningPolicy } from './response-signing.ts';

export type { DraftBindingRegistry, DraftBindingSnapshot } from './draft-binding-registry.ts';

export interface HttpAdapterCohortConfig extends HttpClientConfig {
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
}

export interface HttpAdapterCohort {
  draftStore: DraftStore;
  submitTransport: SubmitTransport;
  responseSigning?: ResponseSigning;
}

export function createHttpAdapterCohort(config: HttpAdapterCohortConfig): HttpAdapterCohort {
  if (config.responseSigning && !config.resumeMetadata) {
    throw new Error('Response signing requires injected draft resume metadata for unresolved operation recovery');
  }
  const resolveFormId = config.formIdResolver ?? defaultFormIdResolver;
  const registry = createDraftBindingRegistry({ resumeMetadata: config.resumeMetadata, formIdResolver: config.formIdResolver });
  const { anonymousSessions, responseIdResolver, responseDataResolver, signingRequested,
    resumeMetadata: _resumeMetadata, responseSigning: signingPolicy, ...httpConfig } = config;
  const draftStore = new HttpDraftStore({
    ...httpConfig,
    bindingRegistry: registry,
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
  const submitTransport = new HttpSubmitTransport({
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
  const responseSigning = new HttpResponseSigning({
    ...signingPolicy, client: new HttpClient(httpConfig), drafts: draftStore, bindings: registry, fence,
    resumeMetadata: config.resumeMetadata,
    async ownerFor(key) {
      if (key.subjectRef && !key.subjectRef.startsWith('anon:')) return { subjectRef: key.subjectRef };
      if (!anonymousSessions) throw new Error('Signing requires an owned anonymous session');
      const session = await anonymousSessions.sessionForForm(key.formUrl, key.formVersion, true);
      if (key.subjectRef && key.subjectRef !== session.subjectRef) throw new Error('Signing actor differs from the server owner');
      return { token: session.sessionToken, subjectRef: session.subjectRef };
    },
  });
  const scopedDrafts: DraftStore = {
    load: key => fence.run(key, async () => draftStore.load(key)),
    save: (key, response) => fence.run(key, async () => {
      responseSigning.assertEditable(key);
      await draftStore.save(key, response);
    }),
    list: subject => draftStore.list(subject),
    delete: key => fence.clear(key, async () => {
      await draftStore.delete(key);
      responseSigning.clearScope(key);
    }),
    async invalidateSubject(subject) {
      for (const key of await draftStore.list(subject)) await scopedDrafts.delete(key);
    },
  };
  const scopedSubmit: SubmitTransport = {
    submit: (handoff, operationId) => {
      const key = draftKeyFromHandoff(handoff);
      return fence.run(key, async () => {
        responseSigning.assertEditable(key);
        const binding = registry.get(key);
        const response = handoff.extensions?.['x-formspec-response'];
        if (binding?.response?.authoredSignatures?.length
          && JSON.stringify(response) !== JSON.stringify(binding.response)) {
          throw new Error('Signed submission must preserve the exact saved Response');
        }
        return submitTransport.submit(handoff, operationId);
      });
    },
  };
  return { draftStore: scopedDrafts, submitTransport: scopedSubmit, responseSigning };
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
