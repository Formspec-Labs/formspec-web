# FW-0070 — Route-narrowing parameterization (design)

**Date:** 2026-05-23
**Row:** [FW-0070](../../PLANNING.md#fw-0070--parameterize-the-route-narrowed-composition-factory-family-n4-trigger)
**Closes review finding:** FW-0056 closeout independent architecture review LOW-2 ("pull forward before a fifth narrowed-route consumer lands"); FW-0068 design §"Sibling future consumers" (original parameterization recommendation).
**Subordinate to:** [web ADR-0008](../adr/0008-reference-deployment-composition.md), [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md), [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Internal refactor of [FW-0068 design](2026-05-23-fw-0068-route-aware-composition-narrowing-design.md).
**Authority:** internal composition refactor; no port changes; no user-visible vocabulary changes; no behavior change.

## What FW-0070 needs

N=4 sibling factory families landed inline across FW-0068 (`/status`), FW-0055 (`/obligations`), FW-0056 (`/documents`):

- 4 × 3 = 12 named `create{Default,Stub,Demo}{StatusRoute,ObligationsRoute,DocumentsRoute}Composition` functions in `src/composition/{default,stub,demo}.ts`.
- A 4-arm `chooseComposition` switch in `src/app/main-helpers.ts`.
- Linear-scaling matrices in `tests/profiles/composition-coherence.test.ts` (11 explicit cases for the factories) and `tests/smoke/composition.test.ts` (12 explicit cases).

Each new route adds ~50 lines of sibling-factory boilerplate, one chooseComposition arm, and three coherence-test cases. At N=5 the cruft compounds: more diff surface for every change touching wiring rules, more chances for the gated-key wiring rules to drift between siblings.

The compression target — a single parameterized factory that takes a per-route narrowing spec and produces the same `Composition` — was named in [FW-0068 design §"Sibling future consumers"](2026-05-23-fw-0068-route-aware-composition-narrowing-design.md) and acknowledged in the FW-0056 closeout. This row delivers it.

## Design decision 1 — Shape: per-route descriptor, single parameterized factory

Two paths:

- **(a) Per-route descriptor + parameterized factory.** Define a `RouteNarrowing` type that names the route, the load-bearing port keys this route wires (the "live" ports), and the noop ports (everything else). A single `createRouteNarrowedComposition({ mode, config, route })` factory reads the descriptor and assembles the `Composition`.
- **(b) Higher-order `narrowComposition(fullComposition, narrowingSpec)`.** Build the full composition first, then selectively replace slots with noops per the spec.

**Pick (a).** Justification:

1. The FW-0068 H-1 finding the route-narrowing pattern exists to close is precisely "do not construct adapters the surface will not use." Path (b) builds every adapter (running the OIDC / HTTP / IndexedDB constructors) and discards them — re-introducing the boot-cost it set out to eliminate.
2. Construction stays explicit at each route's call site — the descriptor declares which ports run real constructors before any adapter is built. Grep finds each route's wiring contract in one place.
3. Descriptors are data, not closures over adapter instances. New routes copy the descriptor pattern; the factory body never grows.
4. Aligns with FW-0068's original recommendation language ("`createRouteNarrowedComposition({ wires: [...], noop: [...] })`").

**Rejected (b)** on the boot-cost grounds.

## Design decision 2 — Where the per-route narrowing specs live

Two options:

- **Per-route file:** each `{status,obligations,documents}-route.ts` exports its `RouteNarrowing` alongside its parser.
- **Central file:** `src/composition/route-narrowings.ts` maps route IDs to specs.

**Pick per-route.** Justification:

1. The route parser and the route narrowing are both "what this route is" — keeping them in the same file means adding a route requires touching one place.
2. `chooseComposition` already imports each route parser; threading the narrowing descriptor through the same imports keeps the dispatch helper short and the seams visible.
3. The central barrel (`src/composition/index.ts`) can still re-export descriptors for adopter discoverability.

## Design decision 3 — `RouteNarrowing` shape

```ts
export interface RouteNarrowing {
  /** Cite used in noop-adapter error messages (e.g., '/status'). */
  readonly routeCite: string;
  /**
   * Sentinel string written to `Composition.initialDefinitionUrl` on narrowed
   * routes. Surfaces never read this; the noopDefinitionSource throws on
   * `getDefinition` anyway.
   */
  readonly initialDefinitionUrlSentinel: string;
  /**
   * Whether the route reads the respondent-place sidecar (obligations,
   * documents). When `true`, the demo/stub composition keeps the demo
   * `respondentPlaceSource` + identity wiring; the production composition
   * keeps `unavailable*` per ADR-0011 §Instance capabilities until a real
   * respondent-place adapter ships.
   */
  readonly consumesRespondentPlace: boolean;
  /**
   * Whether the route reads the status reader. Today only `/status`.
   */
  readonly consumesStatus: boolean;
  /**
   * Whether the surface is identity-bound. When `true` AND the production
   * `respondentPlace` capability is `available`, the production factory wires
   * the real identity provider; otherwise short-circuits to noop per MED-4.
   * The demo composition wires the demo identity provider when `true`.
   */
  readonly identityBound: boolean;
}
```

**Form-shaped MVP ports (`definitionSource`, `draftStore`, `submitTransport`) are unconditionally noop on every narrowed route.** No narrowed route reads them — that's the definition of "narrowed." If a future surface needs a real `draftStore`, it's not a narrowed-route consumer; it's a new top-level composition (a fork of the full-app factory). Encoding this as an unconditional rule keeps the descriptor small and the seams clear.

**Today's three descriptors:**

| Route | consumesRespondentPlace | consumesStatus | identityBound |
|---|---|---|---|
| `/status` | false (\*) | true | false |
| `/obligations` | true | false | true |
| `/documents` | true | false | true |

(\*) The `/status` route keeps `respondentPlaceSource` wired as `unavailableRespondentPlaceSource()` in production and `stubRespondentPlaceSource()` in demo (the FW-0068 inline arch-review Finding 1 reshape) — same as today. `consumesRespondentPlace: false` here is "this surface does not READ respondent-place" — the descriptor flag drives identity wiring + the `notificationDelivery` slot, not the place-source slot itself.

## Design decision 4 — Factory shape

The single factory has three callers (one per mode), parameterized by the route descriptor:

```ts
export function createRouteNarrowedComposition({
  mode,
  config,
  route,
}: {
  mode: 'default' | 'stub';
  config?: FormspecWebConfig;
  route: RouteNarrowing;
}): Composition;
```

- `mode: 'default'` selects production wiring (short-circuits to `'stub'` when no server URL is configured — preserves the existing `createDefaultComposition` demo-fallback contract).
- `mode: 'stub'` selects demo wiring.
- The `'demo'` shape collapses to `'stub'` per the existing demo→stub delegation contract (`createDemoComposition` was already a one-liner over `createStubComposition`). No new mode.

`createRouteNarrowedComposition` builds the appropriate `instanceCapabilities` + `orgRuntimePolicy` + `getFormRuntimePolicy` + adapters following the rules the four sibling factories encode today, parameterized by the descriptor. Funnels through `freezeComposition` per FW-0068 §Acceptance #1.

## Design decision 5 — Migration path: eliminate, do not wrap

Per the project's no-shims discipline ([feedback_no_shims_refactor.md](../../../../.claude/CLAUDE.md)), the 12 named factory functions are deleted. Every call site rewrites to `createRouteNarrowedComposition({ mode, config, route: STATUS_ROUTE_NARROWING })` or equivalent.

Call sites to migrate:
- `src/app/main-helpers.ts:chooseComposition` (4 arms)
- `tests/smoke/composition.test.ts` (12+ direct calls)
- `tests/profiles/composition-coherence.test.ts` (11 explicit cases collapse to a programmatic generator per Design decision 6)
- `tests/app/status-boot-narrowing.test.ts` (3 direct calls)

The full-app `createDefaultComposition` / `createStubComposition` factories stay — they're not narrowed routes; they wire every port. Only the sibling narrowed-route factories collapse.

## Design decision 6 — Coherence-test programmatic generator

Today: 11 explicit `it('… is coherent', ...)` cases for the factories. After parameterization, the assertion still must run per `(mode, route)` combo (3 modes × 3 routes = 9 narrowed combos + 2 full-app = 11 today, same count, same intent).

The refactor: extract a `narrowedCompositionCoherenceCases()` helper that yields `{ name, build }` tuples programmatically across all `(mode, route)` combos. The test asserts each yields a coherent composition. The 9 narrowed cases collapse to one `describe.each(...)` block; the 2 full-app cases stay separate (different generator inputs).

Avoids the linear-scaling issue: adding a fifth route adds ONE descriptor and the test matrix expands automatically.

## Acceptance criteria

1. New file `src/composition/route-narrowing.ts` exporting `RouteNarrowing` type + `createRouteNarrowedComposition({ mode, config, route })` factory.
2. Per-route narrowing descriptors in `src/app/{status,obligations,documents}-route.ts` exported as `STATUS_ROUTE_NARROWING`, `OBLIGATIONS_ROUTE_NARROWING`, `DOCUMENTS_ROUTE_NARROWING`.
3. The 12 named factory functions in `src/composition/{default,stub,demo}.ts` (4 routes × 3 modes — the original sibling factories) are deleted. `createDefaultComposition` and `createStubComposition` stay (they're full-app, not narrowed). `createDemoComposition` stays (delegates to `createStubComposition`).
4. `src/composition/index.ts` re-exports `createRouteNarrowedComposition` + the descriptors; named factory exports are removed.
5. `src/app/main-helpers.ts:chooseComposition` migrated to call `createRouteNarrowedComposition` with the appropriate descriptor per route match.
6. `tests/profiles/composition-coherence.test.ts` uses `describe.each(...)` over a programmatic case generator that produces all `(mode, route)` combos.
7. `tests/smoke/composition.test.ts` updated — the per-named-factory smoke cases collapse to per-descriptor cases asserting the parameterized factory's wirings match expectations.
8. `tests/app/status-boot-narrowing.test.ts` updated to call the parameterized factory.
9. PLANNING.md FW-0070 row moved to ## Closed following FW-0065 / FW-0068 close-out pattern.
10. `npm run ci` green; all validators green (typecheck, lint, testing-plan, mvp-audit, upstream-blockers, release-docs, conformance-coverage).
11. Stack pointer staged at parent. Do NOT push.

## Out of scope (explicitly)

- **No user-visible vocabulary changes.** Internal refactor.
- **No port shape changes.** Adapter interfaces stay byte-identical.
- **No new feature key.** Existing closed taxonomy preserved.
- **No new noop adapter family.** Reuses `noop-for-narrowed-route/`.
- **No changes to `freezeComposition` / `assertCompositionCoherence`.** The honesty contract holds — every parameterized result still funnels through `freezeComposition`.
- **No full-app composition refactor.** `createDefaultComposition` + `createStubComposition` stay as today.

## Honest scope check

If implementation reveals that the four sibling factories' wiring rules are NOT a clean function of the descriptor — e.g., the obligations factory does something the documents factory doesn't beyond what `consumesRespondentPlace` + `identityBound` cover — that is a finding worth surfacing. STOP and return. The refactor only delivers value if the descriptor cleanly captures the variability.

## Review-loop discipline

Per the task brief: implementer requests review through subagent dispatch if available; else flags in return so the main agent dispatches independent `formspec-specs:semi-formal-architecture-review`. Reviewer is never the implementer.
