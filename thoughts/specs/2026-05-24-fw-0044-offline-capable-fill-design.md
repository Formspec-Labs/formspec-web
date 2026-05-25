# FW-0044 — Offline-capable form-fill with deferred submit (design)

**Date:** 2026-05-24
**Row:** [FW-0044](../../PLANNING.md#fw-0044--offline-capable-form-fill-with-deferred-submit)
**Journey:** [J-045](../../JOURNEYS.md#j-045--i-have-no-signal--let-me-finish-the-form-anyway-and-let-it-submit-itself-when-im-back-online)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0011 (runtime feature resolution)
**Precedent (substrate shape):** [FW-0033 slice-1 design](2026-05-23-fw-0033-file-upload-design.md) — IN-FORM new-port + capability-key extension + definition-introspective form-policy extractor. [FW-0057 slice-1 design](2026-05-24-fw-0057-cross-issuer-history-design.md) — 5th key extension + 1:1 port mapping discipline.
**Authority:** ADR-0011 §"Feature Ownership Table" enumerates `offlineSubmit` (instance capability: "browser queue plus idempotent transport"; org policy: "offline allowed for issuer"; form policy: "form marked offline-safe"). This row materializes the taxonomy entry. Adds a **new** `OfflineSubmitQueue` port per web ADR-0009 (port what's adopter-shaped — queue lifecycle has a fundamentally different shape from synchronous `SubmitTransport`). Sixth extension of the closed `RuntimeFeatureKey` taxonomy.

## What FW-0044 actually needs (vs the row prose)

The PLANNING row frames the full vision: load the form once, finish offline through every branch, drafts save on the device, submit queues and fires when connectivity returns with no duplicates. **Most of the substrate already exists.** Drafts persist via `DraftStore` — local-by-default in the stub composition, HTTP-backed in the reference deployment but already idempotent + UUIDv7-keyed. FEL evaluation, branching, validation, and help text all run client-side on the engine in-process. The substrate gap is **the queued-and-deferred submit path**: today `RespondentRuntime.handleSubmit` calls `composition.submitTransport.submit(handoff, key)` unconditionally; if the network is down, that throws and the respondent sees a "We could not submit this form." error with no recovery path.

Four independently load-bearing gaps:

1. **No port for offline-aware submission.** Submission is a sync request/response port today. Adopters that want offline behavior have nowhere to declare it; the runtime cannot distinguish "the user pressed submit, we tried, it failed because of network" from "the user pressed submit, we accepted it locally, we will send it when reachable." The two surfaces need fundamentally different UX (error vs reassurance) and fundamentally different lifecycle (retry-now vs replay-on-reconnect).
2. **No idempotency-preserving replay path.** Even if an adopter wires a queue out-of-band, `RespondentRuntime` generates a fresh UUIDv7 idempotency key per `handleSubmit` invocation (`respondent-flow.ts:387` regenerates on every retry). A naïve replay would generate a new key and the server would process the same submission twice — exactly the duplicate-submit failure mode the row body forbids.
3. **No runtime-feature gate.** A form whose author marked it offline-safe loaded on an instance with no queue today silently submits inline; if the network is down at submit, the bytes are lost with no retry surface. That is the ADR-0011 §Rationale #1 ("reference deployments must be honest") violation — the form LOOKS like a working offline form until the respondent hits submit with no signal.
4. **No respondent-visible "saved for later" affordance.** When the submit path queues instead of synchronously confirming, the UX must say so plainly — same fidelity as the "confirmed" panel, distinguished as "queued, will send when you reconnect." Today's `SubmitNotice` has three states (`submitting | invalid | error | confirmed`); adding a "queued" state without a substrate behind it is the dishonest path.

Each gap is independently load-bearing. Gap 1 alone makes the feature unimplementable on production. Gap 2 makes it unimplementable end-to-end even when the adapter exists. Gap 3 makes the demo composition mislead respondents. Gap 4 hides what's happening from the person whose data it is.

## Decision: ship slice 1 (port + conformance + stub + extractor + runtime offline-detection + queue-routing + UX); defer service worker + IndexedDB + multi-tab + Background Sync API

Slice 1 lands:

- A new **`OfflineSubmitQueue` port** with three operations: `enqueue(handoff, idempotencyKey) → Promise<QueuedSubmit>`, `replay() → Promise<readonly ReplayOutcome[]>`, `pending() → Promise<readonly QueuedSubmit[]>`. The port is intentionally minimal — no `cancel`, no `peek`, no `markFailed`. The respondent's act is "give the submission to the system to send when it can"; the system owns lifecycle from there. (Future rows add finer queue inspection for diagnostics — out of slice 1.)
- A new **conformance suite** (`defineOfflineSubmitQueueConformance`) covering: enqueue idempotency (same key → same `QueuedSubmit`), replay-preserves-original-idempotency-key, replay-against-injected-transport surfaces per-entry outcome, `pending()` reflects the unsent set, empty-queue replay is a no-throw no-op, rejection of non-UUIDv7 idempotency keys (mirrors `SubmitTransport` contract).
- A new **in-memory stub adapter** (`stubOfflineSubmitQueue`) carrying the `DEMO_STUB_ADAPTER` marker; stores `QueuedSubmit[]` in a JS array, replay() drains by calling an injected `SubmitTransport`. Used by demo composition and the conformance suite.
- A new **unavailable sentinel** (`unavailableOfflineSubmitQueue`) carrying the `UNAVAILABLE_ADAPTER` marker; `enqueue` / `replay` / `pending` throw with plain-language adopter-facing messages.
- A new **`offlineSubmit` runtime-feature key** appended to the closed `RUNTIME_FEATURE_KEYS` tuple per ADR-0011 §"Feature Ownership Table" — **sixth extension** after `respondentPlace`, `status`, `documentPresentation`, `fileUpload`, `crossIssuerHistory`. Mapped 1:1 to a new `offlineSubmitQueue` Composition slot in `FEATURE_PORT_MAP` — no transitional slot-sharing (the port IS the substrate AND the consumer; service-worker integration lives at the adapter level if/when an adopter wires it).
- A new **`OfflineSubmitRequirementExtractor`** `FormRuntimePolicyExtractor` adapter. Walks `definition.extensions['x-formspec-offline-submit']`; when present and `=== true`, declares `offlineSubmit: 'optional'` (NOT `'required'` — see §"Optional, not required" below). Composed into the stub + default compositions' `CompositeFormRuntimePolicyExtractor` array.
- **`RespondentRuntime` offline integration.** A thin `submitWithOfflineFallback(composition, runtimeProfile, ...args)` helper checks `navigator.onLine` AND `runtimeProfile.enabled.has('offlineSubmit')`. If offline AND enabled, route to `offlineSubmitQueue.enqueue(handoff, idempotencyKey)` and surface a `'queued'` submit state. Else fall through to the existing `submitTransport.submit` path. A `'queued'` state is added to `SubmitState` carrying the queued reference. On `online` window event (registered in a small `useEffect`), if `offlineSubmit` is enabled and the submit-state was `'queued'`, call `offlineSubmitQueue.replay()` and transition to `'confirmed'` on first success or `'error'` on failure.
- **Idempotency-key preservation.** The queue stores the ORIGINAL idempotency key with each `QueuedSubmit`. Replay reuses the stored key against the injected `SubmitTransport`. Conformance suite enforces this — the key passed to `enqueue` MUST equal the key the transport receives at replay.
- **Honest deferred copy.** Below the "queued" panel: "Offline submit support is experimental. Production deployments do not currently keep your draft across browser restarts or across other devices." Fixture-pinned.
- **Disabled-cause copy at form load.** When `offlineSubmit` is `optional` and the instance cannot satisfy it, the form loads normally — offline is a graceful enhancement, not a hard requirement. The respondent sees no error; if they hit submit offline, they get the existing "We could not submit this form." path with a retry-when-back-online affordance (same as today).
- **Production composition default**: `offlineSubmit: 'unavailable'` + `unavailableOfflineSubmitQueue()`. The OSS reference deployment does not ship a production-grade IndexedDB queue or service worker.
- **Demo / stub composition**: `offlineSubmit: 'demo-stub'` + `stubOfflineSubmitQueue({ transport })`. The bundled demo form does NOT declare `x-formspec-offline-submit: true` in slice 1 (the affordance is exercised via synthetic-definition tests and the conformance suite); see §"Demo form posture."

Slice 1 does **not** ship:

- **Service-worker registration + lifecycle UX.** A real "intercept submit fetches when offline" path requires registering a service worker (Workbox or hand-rolled), claiming clients, handling install / update / skipWaiting, notifying the user "offline support enabled" / "update available." All of that is substantive UX surface with a11y + update-flow + scope-collision lenses. Filed as **FW-0081** (service-worker installation + lifecycle UX).
- **IndexedDB-backed queue adapter.** The slice-1 in-memory stub loses queued submissions on page reload — that is the explicit `'demo-stub'` posture, not a slice-1 production claim. The production-grade adapter wraps `idb` (or hand-rolled IndexedDB) + handles schema upgrades + handles store quota errors + reattempts on `storage` events. Filed as **FW-0082** (IndexedDB queue adapter; production reference).
- **Background Sync API integration.** Modern browsers expose `ServiceWorkerRegistration.sync.register` for genuine background flush even when the tab is closed. Requires the service worker from FW-0081 + the IndexedDB store from FW-0082. Filed as **FW-0083** (Background Sync API integration).
- **Multi-tab queue coordination.** Two tabs open on the same form, both queuing submissions, one comes online first — needs a `BroadcastChannel` (or Web Locks API) to decide which tab drains the queue. Filed as **FW-0084** (multi-tab queue coordination).
- **Cross-device queue migration.** Start on phone offline, switch to laptop online — needs the wallet substrate (web ADR-0010 + XS-2 token bag). Out of slice 1 (compounds with FW-0078 production wallet wiring). Filed as **FW-0085** (cross-device queue migration; compose with FW-0078 + XS-2).
- **Production object-store reference adapter for the queue.** None ships. Adopters fork the composition file (<100 lines) and wire their own.
- **Conflict resolution when the form definition has updated between offline-fill and replay-submit.** The replay path uses the queued handoff as-is; the server's idempotency contract handles the same-key case. Definition-drift detection (server returns "this form has been retired since you started filling it") is server-side; client surfaces whatever the server returns. Filed as **FW-0086** (definition-drift detection on offline replay).
- **Encryption-at-rest for the queued payload.** Slice 1's in-memory stub stores plaintext; the queued bytes live in process memory only and disappear on reload. The IndexedDB adapter (FW-0082) MUST address at-rest encryption (passkey-derived key via EXT-18 HPKE TS wrapper, mirroring the respondent-place wallet's posture). Out of slice 1 scope but called out in the FW-0082 row.

## Decision on port shape: NEW `OfflineSubmitQueue` port, NOT extending `SubmitTransport`

Alternatives considered:

| Option | Shape | Why rejected/accepted |
|---|---|---|
| **(a) New `OfflineSubmitQueue` port** | Three methods: `enqueue(handoff, key)`, `replay()`, `pending()`. `SubmitTransport` unchanged. Adopters wire BOTH (or only `SubmitTransport` with the queue's slot `unavailable`). | **ACCEPTED.** Single-responsibility port (web ADR-0009 §"port what's adopter-shaped"). Queue lifecycle (enqueue / replay / pending) has fundamentally different concerns from synchronous submit (idempotency-key generation / response shape / error retry). Adopters wiring an HTTP submit transport plus an IndexedDB queue compose two distinct adapters; adopters with no offline story keep the queue slot `unavailable`. Matches the FW-0033 / FW-0057 precedent of one port per adopter-shaped concern. |
| **(b) Extend `SubmitTransport` with `submitWithRetry(handoff, key, {offlineQueue?: boolean})`** | One port; offline behavior is a flag passed at call site. | Rejected — couples two adopter concerns (sync submit + durable queue); forces every `SubmitTransport` implementation to either implement queue semantics or document "queue: not supported" on every adapter; the queue lifecycle (replay / pending) has no natural home on a request-shaped port. The per-call flag pattern also obscures the deployment-posture decision (does this composition have a queue at all?) behind a runtime argument. |
| **(c) Wrap `SubmitTransport` in an `OfflineAwareSubmitTransport` decorator** | One port shape, decorated adapter implements the queue path internally. | Rejected — the queue's lifecycle (replay, pending) is not visible from the decorated `SubmitTransport` interface; consumers (`RespondentRuntime`) would need a side-channel to drive replay, defeating the decorator pattern. The decorator obscures whether the composition's submit is "real submit" or "queue submit"; debug + telemetry get muddied. |

**Decision: (a).** Justified above; matches existing port discipline.

## Decision on runtime feature key: add `offlineSubmit` — sixth taxonomy extension

ADR-0011 §"Feature Ownership Table" already enumerates `offlineSubmit` (instance capability: "browser queue plus idempotent transport"; org-policy: "offline allowed for issuer"; form-policy: "form marked offline-safe"). The decision materializes the taxonomy entry, not inventing a new one.

| Concern | Gated by | Slice 1 wiring |
|---|---|---|
| Queueing submissions when the device is offline | `offlineSubmit` | New key. Production: `unavailable`. Demo/stub: `demo-stub` (in-memory). |

Implications:

1. `src/policy/feature-keys.ts`: extend `RUNTIME_FEATURE_KEYS = [..., 'offlineSubmit'] as const` (append-only ordering per the comment).
2. `src/policy/feature-port-map.ts`: add `offlineSubmit: 'offlineSubmitQueue'` — 1:1 mapping, no transitional slot-sharing.
3. `src/composition/types.ts`: add `offlineSubmitQueue: OfflineSubmitQueue` to `Composition`.
4. **Default compositions:** `offlineSubmit: 'unavailable'` in production; `offlineSubmit: 'demo-stub'` in demo/stub. Coherence assertion handles the new key/port pair automatically through the existing `RUNTIME_FEATURE_KEYS` loop.
5. **Narrowed-route compositions:** uniformly wire `unavailableOfflineSubmitQueue()` + declare `offlineSubmit: 'unavailable'` on every narrowed route. None of `/status`, `/obligations`, `/documents`, `/history` accepts submissions — the queue is irrelevant. No new `consumesOfflineSubmit` flag is added to `RouteNarrowing`; every shipped narrowed route is uniformly noop on the queue. Per FW-0080's row body, **this sixth key extension is the explicit trigger** for the `consumes*` boolean ladder → `ReadonlySet<RuntimeFeatureKey>` consolidation, but the refactor is FW-0080's territory; slice 1 lands the key on the existing flag-set and the FW-0044 closeout pulls FW-0080 forward as imminent.
6. **Org-policy limits.** Slice 1 wires `orgRuntimePolicy.features.offlineSubmit: 'allowed'`. Org-level limits (max-queue-age, max-pending-count, org-side replay window) are slice-2 concerns (`orgRuntimePolicy.limits.offlineSubmit`: typed but unconsumed in slice 1, with a fixture-pinned schema sketch).

## Decision: `optional`, not `required`

FW-0033's attachment-field walker declares `fileUpload: 'required'` — a form with an attachment field cannot be honestly rendered without an object store. **Offline support is different.** A form whose author wants offline-fill works fine ONLINE without a queue — the existing synchronous submit path is the happy path; offline is a graceful enhancement when the network drops. Declaring `'required'` would fail-load the form on every instance without an offline queue, which is exactly the wrong posture: a respondent on a high-bandwidth connection should be able to fill an offline-marked form just like any other form.

So the extractor declares `'optional'`. On instances with `offlineSubmit: 'available'` (or `'demo-stub'` in demo), the queue is wired and the runtime routes to it when offline. On instances with `offlineSubmit: 'unavailable'`, the resolver records `optional-no-instance` and the runtime never reaches the queue path — offline submits still surface as errors via the existing path. The form loads either way.

The trade: an instance that genuinely cannot do offline cannot honor the form author's intent. That's accepted — declaring `'required'` would prevent more users from filling the form than it would help. If a future deployment posture needs hard-required offline (e.g., a field-survey app that NEVER loads on online instances), file a follow-on row to introduce a per-form `'requireOffline': true` flag with a separate failure path; FW-0044 does not pre-build that.

## Decision on composition coordination: in-form only; route-narrowed factories noop

FW-0044 is **in-form, not standalone-route.** Offline-capable form-fill IS the form-fill flow when the network drops; there is no separate "offline mode" page. The new `offlineSubmitQueue` slot needs to be present on every Composition (full-app + every narrowed route) because the coherence assertion iterates over `RUNTIME_FEATURE_KEYS`, but:

- **Full-app composition (`createDefaultComposition` + `createStubComposition`):** wires the real / stub queue adapter.
- **Narrowed-route composition (`createRouteNarrowedComposition`):** wires `unavailableOfflineSubmitQueue()` (production AND stub modes) + declares `offlineSubmit: 'unavailable'`. None of `/status`, `/obligations`, `/documents`, `/history` submits — the narrowed-route is by definition not a form-fill surface. The coherence assertion accepts `unavailable` adapter + `unavailable` declaration as a coherent pair.

No `consumesOfflineSubmit` flag added to `RouteNarrowing`. Every shipped narrowed route is uniformly noop on submission today; FW-0080's row body explicitly triggers on the sixth key (see §"FW-0080 trigger handling" below), but FW-0080 itself is the refactor; FW-0044 ships the key on the existing shape.

## Composition coordination — slot table

| Slot | Production (default) | Demo (stub) | Narrowed routes (all modes) | Notes |
|---|---|---|---|---|
| `offlineSubmitQueue` | `unavailableOfflineSubmitQueue()` | `stubOfflineSubmitQueue({ transport: composition.submitTransport })` | `unavailableOfflineSubmitQueue()` | New slot. Adopters fork the production wiring per their IndexedDB / service-worker stack. |
| `instanceCapabilities.offlineSubmit` | `'unavailable'` | `'demo-stub'` | `'unavailable'` | New key. |
| `orgRuntimePolicy.features.offlineSubmit` | `'allowed'` | `'allowed'` | `'allowed'` | Default org policy doesn't forbid offline; instances simply can't do it by default. |
| `formRuntimePolicyExtractor` | `CompositeFormRuntimePolicyExtractor([..., new OfflineSubmitRequirementExtractor()])` | `CompositeFormRuntimePolicyExtractor([..., new OfflineSubmitRequirementExtractor()])` | `new EmptyFormRuntimePolicyExtractor()` | New composite delegate appended; narrowed routes keep the empty extractor (no definition in scope). |

## Demo form posture

The bundled `sample-form.json` does NOT declare `extensions['x-formspec-offline-submit']: true` in slice 1. The decision is to **leave the demo form unchanged** — the `offlineSubmit` feature key is wired through the entire policy + coherence + extractor pipeline (exercised via test fixtures that synthesize offline-declared definitions), but the bundled demo doesn't show the offline affordance live. Reasons:

1. The slice-1 in-memory stub loses queued submissions on page reload — `npm run dev` users would see "queued, will send when you reconnect" then lose the queued submission on a refresh. That dishonesty leaks into the "what the OSS reference shows" surface.
2. The slice-1 offline path requires the user to deliberately drop their network (open devtools → "Offline" or pull the laptop's wifi); the demo experience doesn't naturally exercise it.
3. Adopters who want to see the offline affordance end-to-end can compose their own demo form with `x-formspec-offline-submit: true` + verify via the synthetic-definition tests + the conformance suite.

A **follow-on row FW-0087** ("Demo form: add offline-submit declaration once a reload-surviving demo queue ships") is filed; gated on FW-0082 (production IndexedDB queue), not on slice 1.

## Port boundaries — `OfflineSubmitQueue` shape

```ts
// src/ports/offline-submit-queue.ts
import type { IntakeHandoff, SubmitConfirmation, SubmitTransport } from './submit-transport.ts';

export interface QueuedSubmit {
  /**
   * The original UUIDv7 idempotency key supplied at enqueue. MUST be reused
   * verbatim at replay so the server's idempotency contract honors the
   * "same key = same response" guarantee.
   */
  readonly idempotencyKey: string;
  /**
   * The serializable handoff captured at enqueue time. The queue stores the
   * shape; the adapter is responsible for any at-rest persistence.
   */
  readonly handoff: IntakeHandoff;
  /**
   * ISO-8601 wall clock at enqueue. Used for adopter-side display ("queued
   * 3 minutes ago"); never load-bearing for the queue's correctness.
   */
  readonly enqueuedAt: string;
}

export type ReplayOutcome =
  | { readonly kind: 'sent'; readonly idempotencyKey: string; readonly confirmation: SubmitConfirmation }
  | { readonly kind: 'failed'; readonly idempotencyKey: string; readonly error: unknown };

export interface OfflineSubmitQueue {
  /**
   * Enqueue a handoff for later submission. Idempotent: calling with the
   * same idempotencyKey twice MUST return the SAME `QueuedSubmit` and MUST
   * NOT enqueue a second entry. `idempotencyKey` MUST be a UUIDv7 string
   * (queue EXT-14 convention); adapters MUST reject non-UUIDv7 values.
   */
  enqueue(handoff: IntakeHandoff, idempotencyKey: string): Promise<QueuedSubmit>;

  /**
   * Drain the queue by submitting each pending entry through the adapter's
   * configured `SubmitTransport`, preserving each entry's original
   * idempotencyKey. Returns an outcome per drained entry. Successfully-sent
   * entries are removed from the pending set; failed entries remain. The
   * order of replay is enqueue-order (FIFO). An empty queue resolves to
   * the empty array without error.
   */
  replay(): Promise<readonly ReplayOutcome[]>;

  /**
   * Snapshot of the currently-pending entries. The slice-1 React shell
   * consumes this for the "queued" panel; future diagnostic surfaces (a
   * developer-view "pending queue" inspector) consume it too. Returns an
   * empty array when nothing is queued.
   */
  pending(): Promise<readonly QueuedSubmit[]>;
}
```

The injected `SubmitTransport` is the adapter's constructor concern, not a port-level argument — adopters wire one transport per queue instance. Stub adapter constructor: `stubOfflineSubmitQueue({ transport: SubmitTransport })`. The transport-injection-at-construction discipline mirrors `createHttpAdapterCohort`'s shared-binding pattern (FW-0064): the queue and the transport are a unit at composition time; the runtime never picks a transport for the queue at call time.

## Vocabulary firewall

Every visible string respects `formspec-web/CLAUDE.md` §Vocabulary firewall:

- **Respondent-facing copy:** "offline", "saved for later", "We'll send it when you reconnect", "still waiting to send", "reconnect to send". Never "queue", "queued", "enqueue", "replay", "idempotency", "UUIDv7", "service worker", "IndexedDB", "Background Sync", "BroadcastChannel", "navigator.onLine", "QueuedSubmit", "OfflineSubmitQueue".
- **Deferred-capability copy:** "Offline submit support is experimental. Production deployments do not currently keep your draft across browser restarts or across other devices." — fixture-pinned.
- **Error copy on enqueue failure (adapter throws):** "We could not save this for later. Please try again." + adopter-supplied detail when `Error.message` is plain enough; otherwise generic.
- **Error copy on replay failure (network came back but submit failed):** "We tried to send your form but the server rejected it. Please open the form again to try one more time." + the SubmitTransport's error message displayed below.
- **Spec jargon `OfflineSubmitQueue`, `offlineSubmitQueue`, `offlineSubmit`** stays internal — never appears in DOM, never appears in user copy, never appears in adopter-facing error messages.

## Architectural surface — minimal new code

- `src/ports/offline-submit-queue.ts` (new) — port interface + `QueuedSubmit` / `ReplayOutcome` types.
- `src/ports/index.ts` (modify) — re-export the new port + types.
- `src/adapters/stub/offline-submit-queue.ts` (new) — `stubOfflineSubmitQueue({ transport })` in-memory adapter; marked `DEMO_STUB_ADAPTER`. Exposes test-only `_internalPendingCount()` helper.
- `src/adapters/unavailable/offline-submit-queue.ts` (new) — `unavailableOfflineSubmitQueue()` sentinel; throws; marked `UNAVAILABLE_ADAPTER`.
- `src/adapter-conformance/conformance.ts` (modify) — add `defineOfflineSubmitQueueConformance` + `OfflineSubmitQueueConformanceSubject` type. The subject carries the adapter PLUS a way to register the transport for replay testing.
- `src/adapter-conformance/index.ts` (modify) — re-export.
- `src/adapter-conformance/fixtures.ts` (modify) — reuse `sampleIntakeHandoff`; no new fixture needed beyond a helper to make a recording `SubmitTransport` for replay assertions.
- `tests/adapter-conformance/_framework/conformance.ts` (modify) — re-export the new define.
- `tests/adapter-conformance/offline-submit-queue/conformance.test.ts` (new) — invokes the conformance suite against the stub adapter.
- `scripts/check-conformance-coverage.mjs` (modify) — add `OfflineSubmitQueue` to `portSuites` + add the new stub adapter to `stubPortsByPath` + add the unavailable sentinel to `unavailableSentinelFactoriesByPath` + add `defineOfflineSubmitQueueConformance` to `requiredHarnessExports`.
- `src/policy/feature-keys.ts` (modify) — append `'offlineSubmit'`.
- `src/policy/feature-keys.test.ts` (modify) — extend `RUNTIME_FEATURE_KEYS.toEqual(...)` assertion.
- `src/policy/feature-port-map.ts` (modify) — add `offlineSubmit: 'offlineSubmitQueue'`.
- `src/policy/extract-form-policy.ts` (modify) — add `extractOfflineSubmitOptIn(definition)` pure walker; returns `'optional' | undefined` based on `definition.extensions['x-formspec-offline-submit'] === true`.
- `src/policy/extract-form-policy.test.ts` (modify) — add cases for offline opt-in (absent / present-true / present-false / present-non-boolean).
- `src/adapters/composing/form-runtime-policy-extractor.ts` (modify) — add `OfflineSubmitRequirementExtractor`; wrap `extractOfflineSubmitOptIn`.
- `src/composition/types.ts` (modify) — add `offlineSubmitQueue: OfflineSubmitQueue` slot.
- `src/composition/default.ts` (modify) — declare `offlineSubmit: 'unavailable'` + wire `unavailableOfflineSubmitQueue()` + append `new OfflineSubmitRequirementExtractor()` to the composite extractor; update org-policy features.
- `src/composition/stub.ts` (modify) — declare `offlineSubmit: 'demo-stub'` + wire `stubOfflineSubmitQueue({ transport })` + append `new OfflineSubmitRequirementExtractor()` to the composite extractor; update org-policy features.
- `src/composition/route-narrowing.ts` (modify) — add `offlineSubmitQueue: unavailableOfflineSubmitQueue()` to both narrowed-route branches; extend `instanceCapabilities` / `orgRuntimePolicy.features` declarations. NO `consumesOfflineSubmit` flag added (uniform unavailable; FW-0080 consolidation trigger fires but is filed separately).
- `src/app/RespondentRuntime.tsx` (modify) — extend `SubmitState` with `'queued'` case; refactor `handleSubmit` to call a new `submitOrQueue(composition, runtimeProfile, ...args)` helper. Register a window `'online'` listener via `useEffect` when state is `'queued'` AND `runtimeProfile.enabled.has('offlineSubmit')`; on event, drain the queue and transition state per the first outcome.
- `src/app/respondent-flow.ts` (modify) — add `submitOrQueue(...)` helper that encapsulates the offline-detection + queue-routing decision. Pure function over `{navigator.onLine, runtimeProfile.enabled, composition, handoff, idempotencyKey}` → discriminated outcome `{kind: 'submitted', confirmation} | {kind: 'queued', queuedSubmit}`. Co-located here because the existing `buildIntakeHandoff` lives in the same module.
- `src/app/respondent-flow.test.ts` (modify if exists; new otherwise) — unit-test the `submitOrQueue` decision matrix.
- `docs/ports/offline-submit-queue.md` (new) — adopter doc per the other-port template.
- `docs/policy/runtime-feature-resolution.md` (modify) — add `offlineSubmit` to the worked-key examples + the in-form offline-aware-submit worked example.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` (footer append, one bullet) — `offlineSubmit` is the sixth feature key + the explicit FW-0080 consolidation trigger.
- `tests/adapter-conformance/offline-submit-queue/conformance.test.ts` (new) — runs the conformance suite against `stubOfflineSubmitQueue`.
- `tests/adapters/offline-submit-queue-stub.test.ts` (new) — stub-specific behavior: in-memory persistence, replay drains, `pending()` matches `_internalPendingCount`, marker presence.
- `tests/adapters/offline-submit-queue-unavailable.test.ts` (new) — sentinel-specific behavior: throws plain-language message.
- `tests/adapters/unavailable-sentinel.test.ts` (modify) — extend with the new sentinel.
- `tests/adapters/demo-stub-marker.test.ts` (modify) — extend with the new stub.
- `tests/app/respondent-runtime-offline.test.tsx` (new) — end-to-end through `RespondentRuntime`: render with the stub composition + a synthetic definition declaring `x-formspec-offline-submit: true`; spy on `navigator.onLine` to be `false`; submit; assert state transitions to `'queued'` AND the queue's `pending()` returns one entry with the same idempotencyKey AND the rendered DOM carries the "saved for later" copy; then flip `navigator.onLine` to `true` + dispatch the `'online'` event; assert state transitions to `'confirmed'` AND the queue's `pending()` returns the empty array.
- `tests/app/respondent-runtime-offline.test.tsx` (same file) — coverage for the disabled branches: form declares offline but composition is `unavailable`, network is offline → submit fails via existing error path (no queue route, no "saved for later" copy). And: form does NOT declare offline, network is offline → submit fails via existing error path (no queue route).
- `tests/app/respondent-runtime-offline.test.tsx` (same file) — coverage for vocabulary firewall: rendered DOM never contains "queue", "enqueue", "replay", "idempotency", "IndexedDB", "service worker", `OfflineSubmitQueue`, `offlineSubmit`.
- `tests/policy-resolution/cases/offline-submit-disabled-no-instance.json` (new) — resolver fixture: form optional + instance unavailable → `optional-no-instance`.
- `tests/policy-resolution/cases/offline-submit-disabled-org-forbidden.json` (new) — resolver fixture: form optional + org forbidden → `org-forbidden`.
- `tests/policy-resolution/cases/offline-submit-demo-stub-satisfies-optional.json` (new) — resolver fixture: demo + form optional + demo-stub → enabled.
- `tests/policy-resolution/cases/*.json` (modify all 21 pre-existing cases) — backfill the new `offlineSubmit` key in `instance` / `org` / `expect.disabled` blocks per the append-only key contract.
- `tests/profiles/composition-coherence.test.ts` (modify) — descriptor matrix automatically covers the new slot; assertion-breadth additions for the new key.
- `tests/profiles/composition-policy-wiring.test.ts` (modify if it enumerates ports) — extend with `offlineSubmitQueue`.
- `tests/composition/route-narrowing.test.ts` (modify) — descriptor matrix coverage for the new slot (uniform `unavailable` across all descriptors).
- `tests/smoke/composition.test.ts` (modify) — descriptor matrix picks up the sixth key automatically; one explicit smoke assertion for the new slot in the full-app factories.
- `tests/composition/freeze-offline-submit-queue.test.ts` (new) — coherence cases analogous to FW-0033's `freeze-attachment-store.test.ts`.
- `tests/adapter-conformance/README.md` (modify) — list the new port suite.
- `PLANNING.md` (modify) — FW-0044 row → `live (slice 1)` with named release gaps + follow-on rows FW-0081 / FW-0082 / FW-0083 / FW-0084 / FW-0085 / FW-0086 / FW-0087.
- `thoughts/specs/2026-05-22-upstream-extension-queue.md` (modify) — file new EXT row for any cross-stack coordination needed for offline queue (none load-bearing today; the slice-1 port is web-only). Skip if no upstream coordination is required.

## Non-goals (explicit, to bound scope)

- **No service worker.** No `serviceWorker.register`, no Workbox, no manifest, no install / update / skipWaiting. Filed.
- **No IndexedDB.** No `idb` dependency, no schema migrations, no quota handling. In-memory only. Filed.
- **No Background Sync API integration.** Filed.
- **No multi-tab coordination.** Filed.
- **No cross-device queue migration.** Filed.
- **No `IntakeHandoff` shape change.** The queue stores the handoff verbatim and replays it verbatim.
- **No new schema ratification.** The form-side `x-formspec-offline-submit` is a stack-extension concern (file EXT row if needed; web slice 1 fixture-pins the shape but doesn't ratify it).
- **No production reference adapter for any specific queue substrate.** Adopter-side; the reference deployment composition declares `unavailable` honestly.
- **No definition-drift detection on replay.** Server's idempotency contract handles same-key resubmission; client surfaces what the server returns. Filed.
- **No encryption-at-rest.** Slice 1 is in-memory only; the production IndexedDB adapter (FW-0082) MUST address at-rest encryption.
- **No queue inspection UI.** No "pending queue" inspector page; the only consumer is the per-submission "saved for later" panel. Future diagnostic surface would build on `pending()`.
- **No new `/offline` route or standalone surface.** Offline-fill IS the form-fill flow when network drops; there is no separate page.
- **No `RouteNarrowing.consumesOfflineSubmit` flag.** Uniform `unavailable` on every narrowed route; FW-0080 (consolidation refactor) is the explicit trigger this row fires.

## Test coverage matrix

| Behaviour | Test |
|---|---|
| Port conformance: stub enqueues a handoff with a UUIDv7 idempotency key | `tests/adapter-conformance/offline-submit-queue/conformance.test.ts#enqueue` |
| Port conformance: same idempotencyKey enqueued twice returns the same `QueuedSubmit` and `pending()` length stays 1 | `tests/adapter-conformance/offline-submit-queue/conformance.test.ts#enqueue idempotent` |
| Port conformance: `replay()` drains pending entries, preserves the original idempotencyKey at the injected SubmitTransport | `tests/adapter-conformance/offline-submit-queue/conformance.test.ts#replay preserves key` |
| Port conformance: `replay()` against an empty queue is a no-throw no-op | `tests/adapter-conformance/offline-submit-queue/conformance.test.ts#empty replay` |
| Port conformance: replay outcomes preserve enqueue order (FIFO) | `tests/adapter-conformance/offline-submit-queue/conformance.test.ts#fifo` |
| Port conformance: replay surfaces per-entry success/failure outcomes; failed entries remain pending | `tests/adapter-conformance/offline-submit-queue/conformance.test.ts#per-entry outcome` |
| Port conformance: `enqueue` rejects non-UUIDv7 idempotency keys | `tests/adapter-conformance/offline-submit-queue/conformance.test.ts#rejects bad key` |
| Stub-specific: marker presence + featureKey | `tests/adapters/offline-submit-queue-stub.test.ts#marker` |
| Sentinel-specific: throws plain-language message | `tests/adapters/offline-submit-queue-unavailable.test.ts#throws` |
| Sentinel registry extended | `tests/adapters/unavailable-sentinel.test.ts` + `tests/adapters/demo-stub-marker.test.ts` |
| Form-policy walker: absent → undefined | `src/policy/extract-form-policy.test.ts#offline absent` |
| Form-policy walker: `x-formspec-offline-submit: true` → 'optional' | `src/policy/extract-form-policy.test.ts#offline true` |
| Form-policy walker: `x-formspec-offline-submit: false` → undefined | `src/policy/extract-form-policy.test.ts#offline false` |
| Form-policy walker: non-boolean ignored (returns undefined) | `src/policy/extract-form-policy.test.ts#offline non-boolean` |
| Composite extractor includes the offline delegate | covered by `tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts` via the composite |
| Resolver: `offlineSubmit` disabled-no-instance | `tests/policy-resolution/cases/offline-submit-disabled-no-instance.json` |
| Resolver: `offlineSubmit` disabled-org-forbidden | `tests/policy-resolution/cases/offline-submit-disabled-org-forbidden.json` |
| Resolver: `offlineSubmit` demo-stub satisfies optional | `tests/policy-resolution/cases/offline-submit-demo-stub-satisfies-optional.json` |
| `RespondentRuntime`: offline + offlineSubmit enabled → submit routes to queue; "saved for later" UI; queue's pending count is 1 | `tests/app/respondent-runtime-offline.test.tsx#offline routes to queue` |
| `RespondentRuntime`: queued state → `online` event triggers replay → confirmation surfaces | `tests/app/respondent-runtime-offline.test.tsx#online replays queue` |
| `RespondentRuntime`: offline + offlineSubmit disabled → submit falls through to transport error path (no queue route) | `tests/app/respondent-runtime-offline.test.tsx#disabled falls through` |
| `RespondentRuntime`: online + offlineSubmit enabled → submit takes the direct transport path (no queue) | `tests/app/respondent-runtime-offline.test.tsx#online direct submit` |
| Vocabulary firewall: rendered DOM contains no `queue`, `enqueue`, `replay`, `idempotency`, `IndexedDB`, `service worker`, `OfflineSubmitQueue`, `offlineSubmit` substrings | `tests/app/respondent-runtime-offline.test.tsx#vocabulary firewall` |
| Composition coherence: every existing factory + the new sixth key pass `assertCompositionCoherence` | `tests/profiles/composition-coherence.test.ts` + `tests/composition/freeze-offline-submit-queue.test.ts` |
| Feature-key registry: `offlineSubmit` is in `RUNTIME_FEATURE_KEYS` (append-only) | `src/policy/feature-keys.test.ts` |
| Conformance coverage script enumerates the new port | `tests/scripts/check-conformance-coverage.test.ts` (via the script run by `npm run ci`) |
| `submitOrQueue` decision matrix: offline-and-enabled / offline-and-disabled / online-and-enabled / online-and-disabled | `tests/app/respondent-flow.test.ts` (or new file) |

## FW-0080 trigger handling

Per FW-0080's row body, the consolidation trigger is "a sixth `RuntimeFeatureKey` (after `respondentPlace`, `status`, `documentPresentation`, `fileUpload`, `crossIssuerHistory`) lands or a fourth `consumes*` flag is about to be added — whichever fires first." This row lands the sixth key (`offlineSubmit`) and explicitly does NOT add a fourth `consumes*` flag (every shipped narrowed route is uniformly noop on the queue). **The trigger fires.**

The FW-0044 closeout will:

1. Mark FW-0080 as `imminent (trigger fired by FW-0044)` in PLANNING.md.
2. Update the FW-0080 row body to cite the FW-0044 closeout as the trigger event.
3. Pin in FW-0044's `live (slice 1)` status line: "FW-0080 trigger fired; the consolidation row is imminent."

The consolidation itself is FW-0080's territory — not pulled into slice 1. Justification: FW-0080 is a refactor, not a feature; pulling it forward inflates FW-0044's scope by a substantial chunk of route-narrowing surgery for zero respondent-visible benefit (per AP-005). The right shape is to ship FW-0044's substrate cleanly on the existing ladder, file the trigger acknowledgment, and let FW-0080's owner execute the consolidation as a standalone row.

## Risks and what catches them

- **Risk:** the new key extension breaks 21 policy-resolution fixtures + the `RUNTIME_FEATURE_KEYS.toEqual(...)` test simultaneously, making the PR uncommittable until every fixture is updated. **Catch:** mirror FW-0057's pattern — backfill all fixtures in a single test-only commit immediately after the policy module commit; verify via `npm run test:unit -- policy-resolution` before continuing.
- **Risk:** the `'online'` window-event listener fires multiple times on rapid network flap and replays in parallel. **Catch:** the queue's `enqueue` idempotency is the safety net (same idempotency key → same QueuedSubmit), but to be extra-safe the `RespondentRuntime` useEffect cleans up the listener on each submit-state transition; the test matrix pins a "rapid flap" scenario.
- **Risk:** `navigator.onLine` reports `true` while the network is actually unreachable (modern browsers cache stale online status). **Catch:** the synchronous-submit path on `submitTransport.submit` still throws on the actual `fetch` failure; the runtime falls back to the existing error path if the submit fails inline with `navigator.onLine === true`. The future production posture (FW-0081 service worker) catches the discrepancy more cleanly; slice 1 accepts the imperfection (better than no offline support).
- **Risk:** queued submissions accumulate without bound if the network never returns. **Catch:** the in-memory stub disappears on page reload — there is no unbounded persistence in slice 1. The production IndexedDB adapter (FW-0082) MUST address quota + age-out; the FW-0082 row carries the design.
- **Risk:** the demo composition's stub queue holds a live `SubmitTransport` reference, creating a circular dependency at composition construction. **Catch:** the stub constructor receives the transport as a parameter at composition time AFTER the transport is constructed (slot order matters in the composition factory body); the circular shape is structural rather than runtime — `Composition` is a record, not a class, so no cycle of constructors fires.
- **Risk:** the `submitOrQueue` helper bypasses the existing `draftStore.save` discipline on the offline path. **Catch:** the helper runs AFTER `draftStore.save(...)` in the call sequence; the queue is the post-validation step, not a replacement for draft persistence. The test matrix pins the order.
- **Risk:** the form-policy extractor reads `extensions['x-formspec-offline-submit']` against a JS shape that's never schema-validated. **Catch:** the walker treats `=== true` as the truthy case and ignores anything else; any non-boolean falsy or non-`true` truthy returns `undefined`. The extract-form-policy test matrix pins these cases.

## What FW-0044 ships and what stays open

**Ships:**
- New `OfflineSubmitQueue` port + `QueuedSubmit` / `ReplayOutcome` types.
- Conformance suite + stub adapter + unavailable sentinel.
- New `offlineSubmit` runtime-feature key (sixth extension of the closed taxonomy).
- New form-policy extractor (`OfflineSubmitRequirementExtractor`) reading `extensions['x-formspec-offline-submit']`.
- New `offlineSubmitQueue` slot on `Composition`; wired in default + stub + narrowed-route factories.
- `RespondentRuntime` offline-detection + queue-routing + `'queued'` SubmitState + `online`-event-driven replay.
- Honest "saved for later" + "experimental" + "production deployments do not currently keep your draft across browser restarts" copy.
- Adopter docs + ADR-0011 cross-reference + runtime-feature-resolution.md updates.
- FW-0080 trigger acknowledgment in closeout (sixth key fires the `consumes*` consolidation trigger).

**Stays open (named follow-on rows):**
- **FW-0081** — Service-worker installation + lifecycle UX (install / update / skipWaiting / notification).
- **FW-0082** — Production IndexedDB queue adapter (substrate-of-record; load-bearing for production offline support; includes at-rest encryption via EXT-18 HPKE TS wrapper).
- **FW-0083** — Background Sync API integration (depends on FW-0081 + FW-0082).
- **FW-0084** — Multi-tab queue coordination (BroadcastChannel or Web Locks API).
- **FW-0085** — Cross-device queue migration (compose with FW-0078 production wallet + XS-2 token bag).
- **FW-0086** — Definition-drift detection on offline replay (server-side coordination).
- **FW-0087** — Demo form: add `x-formspec-offline-submit: true` declaration once a reload-surviving demo queue ships (gated on FW-0082).
- **FW-0080** — `consumes*` boolean ladder consolidation into a `ReadonlySet<RuntimeFeatureKey>` — trigger fires here; row promoted to `imminent`.

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — new `offlineSubmit` capability key + sixth-key trigger pin for FW-0080
- [FW-0033 design](2026-05-23-fw-0033-file-upload-design.md) — IN-FORM new-port + capability-key + definition-introspective extractor precedent (most analogous)
- [FW-0057 design](2026-05-24-fw-0057-cross-issuer-history-design.md) — 5th key extension + 1:1 port mapping precedent
- [FW-0064 design](2026-05-24-fw-0064-adapter-owned-draft-binding-design.md) — adapter-cohort transport-injection-at-construction discipline (the queue adopts this pattern for the injected `SubmitTransport`)
- [FW-0066 design](2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md) — `FormRuntimePolicyExtractor` port the offline extractor implements
- [FW-0080 row](../../PLANNING.md#fw-0080--consolidate-consumes-boolean-ladder-on-routenarrowing-into-a-readonlysetruntimefeaturekey) — consolidation trigger fires here
- [`docs/ports/offline-submit-queue.md`](../../docs/ports/offline-submit-queue.md) — adopter doc (new)
- [`docs/policy/runtime-feature-resolution.md`](../../docs/policy/runtime-feature-resolution.md) — worked example (modified)
