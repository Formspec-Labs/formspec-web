# FW-0064 — Adapter-owned draft binding registry (design)

**Date:** 2026-05-24
**Status:** proposed
**Subordinate to:** web ADR-0008 (reference deployment composition), web ADR-0009 (hexagonal architecture)
**Pulls forward:** PLANNING FW-0064 row (open since M8 closeout)

## Trigger

`HttpDraftStore` and `HttpSubmitTransport` share a draft binding (form key → server draft id) by passing a web-runtime sentinel — `IntakeHandoff.extensions['x-formspec-draft-key']` — through the handoff and resolving back through `HttpDraftStore.draftIdFor()`. Two things wrong with that:

1. **Web-runtime concern in a cross-tier wire shape.** `IntakeHandoff` is the canonical Formspec/Server intake contract. A web-runtime lookup key has no business riding through it. Other consumers of `extensions[]` are legitimate (`x-formspec-response-data`, `x-formspec-magic-link-url`); the draft-key entry is not — it crosses the adapter boundary backwards.
2. **`draftIdFor()` is a leak.** A public method on the `DraftStore` adapter exists only so that a sibling adapter (`HttpSubmitTransport`) can reach in and read internal binding state. Port contract has no such method. Hexagonal architecture (web ADR-0009) calls this exact shape out as a smell: a port's adapter exposing private wiring so a peer can read it.

The cleanup target is the adapter-boundary coupling — the same coupling the FW-0064 M8 milestone note called "localStorage prefix coupling" before the in-memory implementation landed.

## Decision

The composition root constructs the HTTP draft-store + submit-transport pair through a single factory — `createHttpAdapterCohort(config)` — which returns `{ draftStore, submitTransport }` with the binding shared via an internal `DraftBindingRegistry` captured in the cohort closure. Neither adapter exposes the registry; neither adapter rides a web-runtime key through `IntakeHandoff.extensions`.

```ts
// src/adapters/http/cohort.ts
export interface HttpAdapterCohortConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
  anonymousSessions?: AnonymousSessionBridge;
  responseIdResolver?: (handoff: IntakeHandoff) => string | undefined;
  responseDataResolver?: (handoff: IntakeHandoff) => Record<string, unknown>;
  signingRequested?: boolean | ((handoff: IntakeHandoff) => boolean);
}

export interface HttpAdapterCohort {
  draftStore: HttpDraftStore;
  submitTransport: HttpSubmitTransport;
}

export function createHttpAdapterCohort(config: HttpAdapterCohortConfig): HttpAdapterCohort;
```

### Registry shape — chosen path (b) from the row body

**Path (b) — composition helper function** wins over path (a) — shared `DraftBindingRegistry` object DI'd into both adapters — for three reasons:

1. **One construction call instead of three.** The composition root calls one helper, not three (`new HttpDraftStore` + `new HttpSubmitTransport` + an external registry constructor). Mirrors the existing factory-function naming pattern (`stubAttachmentStore()`, `unavailableRespondentPlaceSource()`, `createAnonymousSessionBridge()`).
2. **Information hiding.** The registry is an implementation detail of the cohort. Path (a) leaks it into the composition root's vocabulary; adopters who fork the composition would need to understand the registry's contract just to wire two adapters. Path (b) hides it — adopters see two construction inputs (config) and two outputs (adapters).
3. **No DI ceremony asymmetry.** Path (a) raises a question the row doesn't answer: do both adapters take the registry as a constructor arg, or does the composition root pass them by reference somehow? Both shapes have warts. Path (b) sidesteps the question — the cohort is the only construction site that knows about the registry.

### Handoff → draft-key derivation

After removing `extensions['x-formspec-draft-key']`, the submit-transport needs another way to map a handoff back to its binding. The fields are already on the handoff:

```ts
function draftKeyFromHandoff(handoff: IntakeHandoff): DraftKey {
  return {
    formUrl: handoff.definitionRef.url,
    formVersion: handoff.definitionRef.version,
    subjectRef: handoff.subjectRef,
  };
}
```

This matches the `DraftKey` `RespondentRuntime` builds in `createReadyState` (`{ formUrl: definition.url, formVersion: definition.version, subjectRef: claim?.subjectRef }`) and the `actorRef ?? subjectRef` shape `buildIntakeHandoff` sets. No new fields, no new wire-shape decisions — the handoff already carries everything needed.

### Removals (no shims)

Per project no-shims discipline (MEMORY.md `feedback_no_shims_refactor.md`):

- `HttpDraftStore.draftIdFor(key)` — **deleted**. The cohort closure reads bindings directly; no external caller has a legitimate reason to.
- `IntakeHandoff.extensions['x-formspec-draft-key']` — **deleted** at the producer (`buildIntakeHandoff` in `respondent-flow.ts`). Other extension keys (`x-formspec-response-data`, `x-formspec-response`, `x-formspec-validation-report`, `x-formspec-magic-link-url`) are preserved — they serve unrelated purposes.
- `draftIdFromHandoff` / `draftKeyFromHandoff` / `isRecord` helpers in `src/composition/default.ts` — **deleted**. The cohort takes over that responsibility.
- `handoff.extensions['x-formspec-draft-id']` read path in `default.ts` — **deleted**. Dead branch (no producer in this repo); not aliased into the cohort.

### What stays

- The `DraftStore` and `SubmitTransport` port contracts (`src/ports/draft-store.ts`, `src/ports/submit-transport.ts`) — unchanged. Load-bearing invariant per the FW-0064 row body.
- `HttpDraftStore` as a standalone class (still constructible directly for conformance tests at `tests/adapter-conformance/draft-store/conformance.test.ts`). The cohort is the wiring path; the class is not deleted.
- `HttpSubmitTransport` as a standalone class with `draftIdResolver` as a constructor field (still constructible directly for conformance tests at `tests/adapter-conformance/submit-transport/conformance.test.ts`). The cohort wires `draftIdResolver` to a registry-backed closure; direct constructors stay viable for adopters with their own draft-id source.
- `IntakeHandoff.extensions` as a field — preserved. Only the web-runtime draft-key entry leaves.
- `responseDataFromHandoff` fallback in `submit-transport.ts` (reading `extensions['x-formspec-response-data']` / `extensions['x-formspec-response']`) — preserved. That's response data, not draft binding; FW-0033 / other features rely on it.

### Internal `DraftBindingRegistry` shape

```ts
// Lives inside cohort.ts as a non-exported module. Not a port.
interface DraftBindingRegistrySnapshot {
  draftId: string;
  draftVersion?: number;
  response: FormResponse;
}

interface DraftBindingRegistry {
  get(key: DraftKey): DraftBindingRegistrySnapshot | undefined;
  put(key: DraftKey, snapshot: DraftBindingRegistrySnapshot): void;
  delete(key: DraftKey): void;
  // Used by HttpDraftStore.list / invalidateSubject.
  values(): IterableIterator<{ key: DraftKey; snapshot: DraftBindingRegistrySnapshot }>;
}
```

The current `HttpDraftStore.bindings` Map is exactly this. The cohort refactor extracts it into a typed wrapper and injects it into `HttpDraftStore` so the cohort closure can read it without going through `HttpDraftStore`'s public surface.

`HttpDraftStore` becomes:

```ts
export interface HttpDraftStoreConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
  anonymousSessionToken?: string | ((key: DraftKey) => Promise<string | undefined> | string | undefined);
  /** Internal: cohort-supplied binding registry. When omitted (e.g. conformance tests), the store creates a private one. */
  bindingRegistry?: DraftBindingRegistry;
}
```

The optional `bindingRegistry` keeps the standalone construction path viable (conformance tests don't need a cohort).

## Migration

| Site | Before | After |
|---|---|---|
| `src/composition/default.ts` | constructs `HttpDraftStore` + `HttpSubmitTransport` separately with the `draftIdFromHandoff(handoff, draftStore)` closure resolving via `draftStore.draftIdFor()` | calls `createHttpAdapterCohort({...})` and spreads the result into the composition |
| `src/app/respondent-flow.ts:buildIntakeHandoff` | sets `extensions['x-formspec-draft-key']: draftKey` | drops that entry; other extension keys unchanged |
| `tests/app/respondent-flow.test.ts` | asserts `extensions['x-formspec-draft-key']` is present | asserts it is ABSENT (regression guard); `x-formspec-response-data` assertion unchanged |
| `tests/adapters/http/draft-store.test.ts` | asserts `adapter.draftIdFor(key)` returns the server draft id | rewritten via the cohort so the assertion goes through the submit-transport's binding-read instead (or constructs the adapter standalone for the load/save round-trip case — no `draftIdFor` call needed) |
| `tests/app/status-boot-narrowing.test.ts` | mock for `HttpDraftStore` returns `{ draftIdFor: () => undefined }` | mock returns no such method (member access is removed by the refactor); the cohort module is mocked instead when the test still needs to interpose |
| `src/adapters/http/index.ts` | re-exports `HttpDraftStore`, `HttpSubmitTransport`, etc. | adds `createHttpAdapterCohort` + `HttpAdapterCohort` + `HttpAdapterCohortConfig` |
| `docs/adapters/submit-transport.md` | mentions `draftIdResolver` as a hand-wired field | updated to point composition-style adopters at `createHttpAdapterCohort`; direct constructors still documented for the standalone path |

## Risk

- **Reconstruction-key drift.** If `RespondentRuntime`'s `draftKey` shape ever diverges from the `(definitionRef.url, definitionRef.version, subjectRef)` triple, submission won't find the binding and submit fails fast. Mitigated by `respondent-flow.test.ts` already asserting the handoff fields; a new cohort-level assertion will pin the derivation.
- **Anonymous-subject collisions.** Anonymous drafts (`subjectRef?.startsWith('anon:')`) already key into the registry by full subject string. Unchanged from today.
- **Direct adopter constructors.** Adopters who currently `new HttpDraftStore({...})` + `new HttpSubmitTransport({..., draftIdResolver: ...})` directly keep that path. The cohort is an additive composition helper, not a forced funnel. Conformance suites prove both adapters still satisfy their ports standalone.

## Out of scope

- `IntakeHandoff` upstream-spec changes. The `extensions` field is open-set; removing a web-runtime entry needs no spec churn.
- `responseDataFromHandoff` rewrite. That path stays, serves a different need (response data carrying), and is FW-0033 / cross-adopter territory.
- Persisting the registry across reloads. In-memory only, same posture as today's `HttpDraftStore.bindings` Map. Persistence is a future ADR if it ever lands.

## Acceptance

- `createHttpAdapterCohort` ships at `src/adapters/http/cohort.ts` and is re-exported from `src/adapters/http/index.ts`.
- `HttpDraftStore.draftIdFor()` is gone — `grep -rn 'draftIdFor' src/ tests/` returns no production hits.
- `IntakeHandoff.extensions['x-formspec-draft-key']` is gone at the producer — `grep -rn "'x-formspec-draft-key'\|x-formspec-draft-id" src/ tests/` returns no production hits (test assertions for absence allowed).
- `src/composition/default.ts` calls the cohort; `draftIdFromHandoff` / `draftKeyFromHandoff` helpers deleted.
- All tests green (`npm run ci`).
- PLANNING FW-0064 row moves to Closed with the FW-0065/0068/0070 close-out pattern.
