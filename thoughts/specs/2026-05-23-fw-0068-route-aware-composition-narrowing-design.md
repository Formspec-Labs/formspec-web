# FW-0068 — Route-aware composition narrowing (design)

**Date:** 2026-05-23
**Row:** [FW-0068](../../PLANNING.md#fw-0068--route-aware-composition-narrowing-status-only-composition)
**Closes review finding:** FW-0039 closeout independent architecture review H-1.
**Subordinate to:** web ADR-0008 (reference deployment composition), web ADR-0009 (hexagonal architecture), web ADR-0011 (runtime feature resolution).
**Authority:** internal composition refactor; no port changes; no user-visible vocabulary changes.

> **Naming note (2026-05-23, post-FW-0055):** the noop adapter family was originally named `noop-for-status-route/` (this doc's body still uses that name in the verbatim early-draft sections where it appears). At N=3 sibling-factory landing — when FW-0055 added `createDefault/Stub/DemoObligationsRouteComposition` reusing the same family — the family + helper were renamed to `noop-for-narrowed-route/` + `notForNarrowedRouteError(portName, routeCite?)` (see FW-0055 closeout independent arch-review MED-2). All citations in this doc body now refer to the post-rename path.

## What FW-0068 actually needs (vs the row prose)

The row's Done criterion: `src/app/main.tsx` parses the route BEFORE constructing the composition; when `parseStatusRoute(window.location.href)` matches, `main.tsx` constructs a status-only composition via a new factory that wires ONLY `statusReader` + the runtime-profile / policy resolver state (plus the bare-minimum `Composition` slots the React shell unconditionally reads: `mode`, `instanceCapabilities`, `orgRuntimePolicy`, `getFormRuntimePolicy`). No `IdentityProvider`, no `DraftStore`, no `SubmitTransport`, no `DefinitionSource`, no `NotificationDelivery`, no `RespondentPlaceSource` constructed in the status-route path.

That criterion lives at the *boot* layer. Today's gap:

- `src/app/main.tsx:14` calls `createDefaultComposition(activeConfig)` unconditionally — every adapter constructor runs (`HttpDefinitionSource`, `HttpDraftStore`, `HttpSubmitTransport`, `AnonymousSessionBridge`, identity-provider factory) before `App.tsx:46-77` reads the route.
- `StatusRuntime.tsx` only USES `statusReader` + `instanceCapabilities` + `orgRuntimePolicy` (proved by `tests/app/status-runtime.test.tsx#identity discipline`), so the boot work is wasted on the `/status` route.
- FW-0039 slice 1 closed claiming "the `/status` route composes ONLY runtime profile resolution + StatusReader.readStatus + render." That claim was true at the consumer level, false at the composition level. FW-0068 closes the gap.

## Design decision 1 — Shape: narrowed Composition via factory, NOT discriminated union

Two paths:

- **(a) Narrowed Composition via factory.** Introduce a sibling factory `createDefaultStatusRouteComposition(config)` that returns the same `Composition` type. The factory wires the **real** `statusReader` (where the production composition would) and wires `unavailable*` sentinels for every non-status port (`respondentPlaceSource`, plus the MVP-port slots `definitionSource`, `draftStore`, `submitTransport`, `identityProvider`). Status-only narrowing is a property of the **adapters** chosen by the factory, not the type system.
- **(b) New `StatusOnlyComposition` type as a strict subset of `Composition`; `useComposition()` accepts a discriminated union.**

**Pick (a).** Justification:

1. The existing `useComposition()` consumer interface (`src/app/hooks/useComposition.ts:9`) stays intact; one hook, one shape, one consumer mental model.
2. The narrowing is already expressible through the existing **provenance markers** (`UNAVAILABLE_ADAPTER` per `src/policy/sentinel.ts:18`) and the existing **`unavailable*` sentinels** (`src/adapters/unavailable/status-reader.ts`, `respondent-place-source.ts`). Path (b) would duplicate that machinery in the type system.
3. The existing composition-coherence assertion (`src/policy/composition-coherence.ts:71`) already polices the honesty contract for any factory that returns a `Composition`. A subset type would either bypass that assertion or require a parallel one.
4. Adding the discriminated union widens `useComposition()`'s callers' type-error surface (every reader must narrow) for zero runtime benefit — `StatusRuntime` already only reads the status-relevant slots.
5. (b)'s only structural advantage is forbidding the unrelated slots at type level. The boot-cost test in §Acceptance (boot-test asserts no non-status adapter constructors are invoked) defends the *load-bearing* property directly, without paying the typing cost.

**Rejected (b)** on the grounds above. Re-evaluate if a future non-form surface needs slot-level type-narrowing the assertion cannot catch.

### What about the MVP-port unavailable sentinels?

Today only `respondentPlaceSource` and `statusReader` have `unavailable*` sentinel adapters because the feature-resolver gates only the two seeded keys. The MVP ports (`definitionSource`, `draftStore`, `submitTransport`, `identityProvider`, `notificationDelivery`) don't have unavailable variants because there's no production scenario where they're absent on the form route.

For the status-route composition we need adapter objects in those slots that:

- Implement the port interface (so the `Composition` type-check passes).
- Throw a clear error if called (so a mistaken `StatusRuntime` consumer fails fast, not silently).
- **Do not** trigger any production HTTP / engine / OIDC boot — that's the whole point.

Two sub-options:

- **(a.i) Build a `noop-for-narrowed-route/` adapter family** (one file per MVP port) that throws "Not constructed for the /status route" on call.
- **(a.ii) Reuse the existing `stub*` adapters** — they're already inert in-memory implementations.

**Pick (a.i).** Justification:

1. The `stub*` adapters carry the `DEMO_STUB_ADAPTER` marker (`src/policy/sentinel.ts:19`, applied by `src/adapters/stub/{status,respondent-place}-source.ts`). The composition-coherence assertion forbids demo-stub adapters in production-mode compositions for the *gated* keys (`src/policy/composition-coherence.ts:99-105`). The MVP-port stubs (definition/draft/submit/identity/notification) are not marked, so today they'd pass — but reusing them buries the intent.
2. The intent of these slots is "not constructed for this route" — that's a third semantic distinct from "demo stub" and "unavailable production sentinel."
3. New adapters cost ~15 LOC each and explicitly communicate the narrowing.
4. The honesty contract for the *gated* keys is preserved: the status-route composition declares `respondentPlace: 'unavailable'` and wires `unavailableRespondentPlaceSource()` (the existing sentinel). `status` declares whatever the production composition would (today `'unavailable'`, paired with `unavailableStatusReader()`).

A single barrel `src/adapters/noop-for-narrowed-route/index.ts` exports the five MVP-port noops. Each adapter:

```ts
function notForStatusRouteError(portName: string): Error {
  return new Error(
    `${portName} is not constructed on the /status route (FW-0068 route-aware composition narrowing). ` +
    `If you see this, a consumer outside StatusRuntime is reading the composition on the /status route.`,
  );
}
```

## Design decision 2 — Where the route parses: `main.tsx` BEFORE composition construction

Move route parsing into `main.tsx` (not into a composition-factory function). `status-route.ts:parseStatusRoute` is already pure and reusable — `main.tsx` calls it once at boot and dispatches to the right factory.

**Boot-to-mount stability (Finding 5 from inline arch review).** This codebase has no client-side router and no useEffect-driven navigation in the boot path; the same `window.location.href` is read by `main.tsx` at boot and by `App.tsx:46-77` at mount. The two pure parses cannot disagree. If a future row introduces client-side navigation between boot and mount, the dispatch helper grows a re-evaluation seam — out of scope here.

```ts
const route = parseStatusRoute(window.location.href);
const composition = route
  ? createDefaultStatusRouteComposition(activeConfig)
  : createDefaultComposition(activeConfig);
```

`App.tsx`'s `useEffect`-based route discovery (`src/app/App.tsx:46-77`) stays unchanged — it still parses the route to decide which runtime component to mount. The boot-time parse and the runtime parse must agree (both use the same pure helper from the same `window.location.href`); if they disagree, the page-level fallback in `App.tsx` shows the loading / error state and no adapter is wrongly invoked (the runtime component selection cannot reach a non-wired port from the status composition because every non-status port throws on first call).

**No router dependency added.** The existing pattern of "read `window.location` once" is preserved per FW-0039 slice 1.

## Design decision 3 — Production vs demo mode: sibling factories, not a `for:` parameter

Each composition factory grows a sibling status-route variant:

- `createDefaultComposition(config)` → `createDefaultStatusRouteComposition(config)`
- `createStubComposition()` → `createStubStatusRouteComposition()`
- `createDemoComposition()` → `createDemoStatusRouteComposition()` (delegates to stub status-route, matching the existing demo→stub delegation)

Justification:

- Per the task brief: sibling factories keep each factory's intent obvious and avoid parameter explosion.
- Each factory still funnels through `freezeComposition(...)` so the coherence assertion runs on both variants.
- The shape of the demo→stub→default ladder is mirrored 1:1, so adopters who fork the file family have an obvious place to land their own status-route narrowing.

The status-route factory shares the gated-key wiring rules with its full-app sibling:

| Slot | Production (default) | Production status-route | Demo (stub) | Demo status-route |
|---|---|---|---|---|
| `statusReader` | `unavailableStatusReader()` | `unavailableStatusReader()` | `stubStatusReader([...])` | `stubStatusReader([...])` |
| `respondentPlaceSource` | `unavailableRespondentPlaceSource()` | `unavailableRespondentPlaceSource()` | `stubRespondentPlaceSource()` | `stubRespondentPlaceSource()` |
| `definitionSource` | `HttpDefinitionSource(...)` | `noopDefinitionSource()` | `stubDefinitionSource(...)` | `noopDefinitionSource()` |
| `draftStore` | `HttpDraftStore(...)` | `noopDraftStore()` | `stubDraftStore()` | `noopDraftStore()` |
| `submitTransport` | `HttpSubmitTransport(...)` | `noopSubmitTransport()` | `stubSubmitTransport()` | `noopSubmitTransport()` |
| `identityProvider` | OIDC / magic-link / anonymous adapter | `noopIdentityProvider()` | `stubIdentityProvider()` | `noopIdentityProvider()` |
| `notificationDelivery` | `stubNotificationDelivery()` | undefined | `stubNotificationDelivery()` | undefined |
| `mode` | `'production'` | `'production'` | `'demo'` | `'demo'` |
| `instanceCapabilities.status` | `'unavailable'` | `'unavailable'` | `'demo-stub'` | `'demo-stub'` |
| `instanceCapabilities.respondentPlace` | `'unavailable'` | `'unavailable'` | `'demo-stub'` | `'demo-stub'` |

**Inline architecture-review reshape (Finding 1 from `formspec-specs:semi-formal-architecture-review`, 2026-05-23).** The demo status-route composition keeps `respondentPlace: 'demo-stub'` + `stubRespondentPlaceSource()` so the surface's `instanceCapabilities` continues to declare "what this deployment can do" rather than "what this composition slot wires." Narrowing `respondentPlace` to `unavailable` on a deployment that can serve it would silently re-frame ADR-0011 §Instance capabilities ("Instance capabilities are deployment-owned and adapter-backed") into a per-surface declaration — a new framing this refactor is not the right place to introduce. The cost is one extra in-memory stub constructor (~zero boot work); the gain is no ADR drift. If a future non-form surface needs genuine per-surface capability narrowing, that's the trigger for a §"Per-surface instance-capability narrowing" addendum to ADR-0011 — not this refactor.

`initialDefinitionUrl` is required by the `Composition` type. The status-route composition sets it to a sentinel string (e.g., `'about:not-constructed#fw-0068'`) — not read by `StatusRuntime`, and the `noopDefinitionSource` would throw if anyone tried.

## Design decision 4 — Naming: `createDefaultStatusRouteComposition` (matches existing `create*Composition` pattern)

Row prose names the helper `statusRouteComposition()`. The existing factory family uses `create*Composition` (`createDefaultComposition`, `createStubComposition`, `createDemoComposition`, plus the future `createDefaultStatusRouteComposition`). Pick the family-matching name for grep-ability and to match the existing barrel pattern in `src/composition/index.ts`. Row prose is updated to match in the FW-0068 closeout.

## Acceptance criteria

1. New file `src/adapters/noop-for-narrowed-route/index.ts` exporting `noopDefinitionSource()`, `noopDraftStore()`, `noopSubmitTransport()`, `noopIdentityProvider()`. Each throws a "not constructed on the /status route" error on any call, with FW-0068 cite.
2. New factory `createDefaultStatusRouteComposition(config?)` exported from `src/composition/default.ts` (and re-exported from `src/composition/index.ts`).
3. New factory `createStubStatusRouteComposition()` in `src/composition/stub.ts`.
4. New factory `createDemoStatusRouteComposition()` in `src/composition/demo.ts` (delegates to the stub variant, matching the existing `createDemoComposition` delegation).
5. `src/app/main.tsx` parses the route via `parseStatusRoute(window.location.href)` and selects the appropriate factory BEFORE constructing the composition.
6. **Boot-narrowing test** at `tests/app/status-boot-narrowing.test.ts` mocks the unrelated adapter constructors (`HttpDefinitionSource`, `HttpDraftStore`, `HttpSubmitTransport`, `AnonymousSessionBridge`, identity-provider factories) and asserts that constructing the status-route composition does NOT invoke them. This is the H-1 assertion FW-0039 was missing.
7. **Noop-adapter throw test** at `tests/adapters/noop-for-narrowed-route.test.ts` proves each noop throws on call with the FW-0068 cite.
8. **Composition-coherence extension** at `tests/profiles/composition-coherence.test.ts`: both new factories pass `assertCompositionCoherence`. (Today the test covers `createStubComposition` + `createDefaultComposition`; extend to cover the two new factories.)
9. **Smoke-test extension** at `tests/smoke/composition.test.ts`: the four-factory smoke (full-app default + stub, plus status-route default + stub) lists every port the React shell unconditionally reads.
10. **PLANNING.md FW-0068 row** moved to ## Closed following FW-0065's pattern; FW-0039 closed-row prose updated to remove the "route-aware composition narrowing is filed as FW-0068" gap from its Release-gaps narrative (the gap is closed; FW-0068 is no longer the open follow-on).
11. `npm run ci` green; `npm run check:testing-plan` + `npm run check:mvp-audit` green.
12. Stack pointer staged at parent. Do NOT push.

## Out of scope (explicitly)

- **No user-visible vocabulary changes.** Internal refactor.
- **No port shape changes.** The MVP-port adapter interfaces stay byte-identical; the noop adapters implement them.
- **No new feature key.** The status route's runtime-feature gate already uses the existing `status` key per FW-0039 slice 1 / web ADR-0011.
- **No code-splitting / lazy-loading of adapter modules.** This refactor narrows what is *constructed* on the /status route — not what is *imported*. Module-import-time work (loading `HttpDefinitionSource`'s prototype) is bounded; constructor-time work (firing fetches, opening OIDC sessions) is what FW-0039 H-1 named. Lazy-loading is a separate optimization and a separate row.
- **No App.tsx changes.** Routing inside the React shell stays the same; only the boot-side factory selection moves.
- **No subagent-driven plan execution.** The plan is small enough to execute in this session; the executing-plans superpower is not invoked.

### Rejected alternative — constructor-laziness per slot

Considered (Finding 2 from inline arch review): wrap each composition slot in a `Lazy<T>` thunk so unused ports never construct, regardless of route. One new shape (a `Lazy<T>` wrapper); no new factory family; no new adapter family; no boot dispatch.

**Rejected** because:
1. The `Lazy<T>` slot hides adapter-construction failures from boot-time observability — an OIDC misconfiguration would surface on first port call, not at boot. The composition coherence assertion runs at construction today (`src/policy/composition-coherence.ts:71`); making construction lazy weakens its blast radius.
2. Per ADR-0009 §"Composition root pattern", the composition is the readable surface adopters fork. Sibling factories make narrowing intent obvious at fork time: an adopter who clones `createDefaultStatusRouteComposition` sees exactly which ports are narrowed and which aren't. A `Lazy<T>`-wrapped composition hides the narrowing behind a uniform shape — the adopter has to grep call sites to know what runs.
3. The full sibling-factory shape pays for itself the moment a SECOND non-form surface lands (verifier, selective-proof) and needs a different narrowing matrix. `Lazy<T>` slots collapse to one shape but force every consumer to share it.

Re-evaluate if the factory family grows past three surfaces (see Finding 3 below).

### Sibling future consumers

The verifier (FW-0003) and the post-MVP selective-proof viewer are sibling non-form surfaces that will hit the same narrowing need. The sibling-factory shape repeats 1:1 per surface — acceptable at N=2, smelly at N=4. When the third surface lands, that's the trigger to reconsider whether one composition with route-aware slot resolution subsumes the family. Out of scope for this row; named here so the future implementer has the pointer (Finding 3 from inline arch review).

## Honest scope check

If implementation reveals that the React shell reads composition slots beyond the four named above (`mode`, `instanceCapabilities`, `orgRuntimePolicy`, `getFormRuntimePolicy`, `statusReader`, `respondentPlaceSource`) before the runtime component mounts, that is a finding worth surfacing — STOP and return. The CompositionProvider passes the whole composition through React context; any read in `App.tsx`'s render path (before `runtimeState.status === 'ready'`) widens the narrowing surface. Grep `composition\.` under `src/app/` excluding `RespondentRuntime.tsx` confirms today's reads.

## Review-loop discipline

Per the task brief: this design is reviewable; the implementer will request review through subagent dispatch if available, else inline `formspec-specs:semi-formal-architecture-review` invocation. The main agent will dispatch an independent reviewer when this lands.
