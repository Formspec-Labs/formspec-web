# FW-0080 — `RouteNarrowing.consumes*` boolean ladder → `consumes: ReadonlySet<RuntimeFeatureKey>`

**Status:** in build
**Row:** [FW-0080](../../PLANNING.md) (promoted to imminent by FW-0044's sixth-key landing)
**Design surface:** small; FW-0070 + FW-0080 row body cover the shape. No new spec doc.

## Why

The three `consumes*` boolean flags (`consumesRespondentPlace`, `consumesStatus`, `consumesHistory`) on `RouteNarrowing` mirror three of the six closed `RuntimeFeatureKey` values by hand. The shape costs a parallel boolean per future feature key AND becomes a foot-gun on the next descriptor-bloat addition. FW-0080's trigger fired when FW-0044 landed `offlineSubmit` (the sixth key) — per the row's "pull forward when a sixth `RuntimeFeatureKey` lands or when a fourth `consumes*` flag is about to be added — whichever fires first" condition.

`identityBound` is NOT a `consumes*`-pattern flag — it gates real-vs-noop identity adapter wiring (MED-4 / FW-0055). It stays as-is. FW-0079 revisits identity gating post-FW-0078.

## Translation table (semantics preserved exactly)

| Descriptor | Old flags | New `consumes` set |
|---|---|---|
| `STATUS_ROUTE_NARROWING` | `{consumesRespondentPlace: false, consumesStatus: true, consumesHistory: false}` | `new Set(['status'])` |
| `OBLIGATIONS_ROUTE_NARROWING` | `{consumesRespondentPlace: true, consumesStatus: false, consumesHistory: false}` | `new Set(['respondentPlace'])` |
| `DOCUMENTS_ROUTE_NARROWING` | `{consumesRespondentPlace: true, consumesStatus: false, consumesHistory: false}` | `new Set(['respondentPlace'])` |
| `HISTORY_ROUTE_NARROWING` | `{consumesRespondentPlace: false, consumesStatus: false, consumesHistory: true}` | `new Set(['crossIssuerHistory'])` |

## Steps

1. **Red:** Extend `tests/composition/route-narrowing.test.ts` with a Set-shape assertion across `ALL_DESCRIPTORS` (each descriptor's `consumes` is a `ReadonlySet<RuntimeFeatureKey>`, contains only valid keys). Update existing `consumesHistory` flag-wiring suite to read `route.consumes.has('crossIssuerHistory')`.
2. **Green:** Convert `RouteNarrowing` interface; translate four descriptors; switch `buildDemoNarrowedComposition` to read `route.consumes.has('crossIssuerHistory')`; remove the FW-0080 TODO comment block in `route-narrowing.ts`; remove the `consumesOfflineSubmit` "or add a flag" comment in production branch.
3. **Adapt tests:** `tests/app/history-route.test.ts` — replace flag assertions with `consumes.has(...)` form.
4. **Adapt docs:** `docs/policy/runtime-feature-resolution.md` lines 46-47 + 482-484 — refresh the FW-0080-trigger prose to past-tense (`consumes*` ladder consolidated into the Set; consolidation row closed).
5. **PLANNING.md:** Move FW-0080 row to `## Closed` with full body + stub at original location.
6. **CI:** `npm run typecheck`, `npm run lint`, `npm run test:unit`, full `npm run ci` green.
7. **Commit cadence:** atomic — design doc + test (red), refactor (green), docs/PLANNING closeout. Each committed with explicit paths.

## Non-goals

- Not adding `fileUpload` / `offlineSubmit` to any descriptor's `consumes` set. The current truth is no narrowed route consumes those; the Set form just makes adding them tomorrow trivial.
- Not touching `identityBound` (FW-0079 territory).
- Not touching `FEATURE_PORT_MAP` (already the SoT this consolidation aligns to).
