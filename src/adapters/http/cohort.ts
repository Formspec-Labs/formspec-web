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

import type { DraftKey } from '../../ports/draft-store.ts';
import type { IntakeHandoff } from '../../ports/submit-transport.ts';
import type { AnonymousSessionBridge } from './anonymous-session.ts';
import { createDraftBindingRegistry } from './draft-binding-registry.ts';
import { HttpDraftStore } from './draft-store.ts';
import type { FormIdResolver } from './form-id.ts';
import type { HttpClientConfig } from './http-client.ts';
import { HttpSubmitTransport } from './submit-transport.ts';

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
}

export interface HttpAdapterCohort {
  draftStore: HttpDraftStore;
  submitTransport: HttpSubmitTransport;
}

export function createHttpAdapterCohort(config: HttpAdapterCohortConfig): HttpAdapterCohort {
  const registry = createDraftBindingRegistry();
  const { anonymousSessions, responseIdResolver, responseDataResolver, signingRequested, ...httpConfig } = config;
  const draftStore = new HttpDraftStore({
    ...httpConfig,
    bindingRegistry: registry,
    anonymousSessionToken: anonymousSessions
      ? (key) => anonymousSessions.tokenForDraftKey(key)
      : undefined,
  });
  const submitTransport = new HttpSubmitTransport({
    ...httpConfig,
    draftIdResolver: (handoff) => registry.get(draftKeyFromHandoff(handoff))?.draftId,
    responseIdResolver,
    responseDataResolver,
    signingRequested,
    anonymousSessionToken: anonymousSessions
      ? (handoff) => anonymousSessions.tokenForHandoff(handoff)
      : undefined,
  });
  return { draftStore, submitTransport };
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
