# FW-0055 — Respondent-side obligations stream (slice 1) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship slice 1 of FW-0055 — a standalone `/obligations` route, identity-bound, that renders `RespondentPlaceSource.readPlace().obligations` as a sorted, sender-grouped, cross-sender-framed dashboard with honest deferred-capability copy. Reuse the existing `RespondentPlaceSource` port (no new port, no new feature key). Coordinate composition slot with FW-0068 (route-aware composition narrowing) running in parallel.

**Design:** [`thoughts/specs/2026-05-23-fw-0055-respondent-obligations-stream-design.md`](../specs/2026-05-23-fw-0055-respondent-obligations-stream-design.md).

**Architecture:** New `ObligationsRuntime` consumes `composition.respondentPlaceSource` + `composition.identityProvider` + `ResolvedRuntimeProfile`; no draft store, no submit transport, no formspec-engine init, no `StatusReader` call (status reached by hyperlink only). `App.tsx` parses `window.location` once and selects between `RespondentRuntime`, `StatusRuntime`, and `ObligationsRuntime`. The existing in-form `RespondentPlacePanel.ObligationItem` extracts to a shared `src/app/obligations-view.ts` so both surfaces share one render.

**Tech Stack:** TypeScript 5 strict, React 19, Vitest, Playwright (axe). No new runtime dependencies.

---

## File Structure

**New files:**

- `src/app/ObligationsRuntime.tsx` — the standalone obligations dashboard.
- `src/app/obligations-route.ts` — pure URL parser (`parseObligationsRoute(href: string): {} | null`).
- `src/app/obligations-view.ts` — shared sort + group + `ObligationItem` render helpers extracted from `RespondentRuntime`.
- `tests/app/obligations-route.test.ts` — URL parsing fixtures.
- `tests/app/obligations-runtime.test.tsx` — component coverage matrix (see design §Test coverage matrix).

**Modified files:**

- `src/app/RespondentRuntime.tsx` — re-import `ObligationItem` + sort helpers from `obligations-view.ts`; remove local render.
- `src/app/App.tsx` — extend route switch: `/obligations` → `ObligationsRuntime`; `/status?case=` → `StatusRuntime`; else `RespondentRuntime`.
- `tests/app/app-routing.test.tsx` — add `/obligations` case.
- `tests/e2e/placeholder-a11y.spec.ts` — extend with `/obligations` axe-clean visit in demo composition.
- `docs/ports/respondent-place-source.md` — add §Consumers naming both `RespondentPlacePanel` and `ObligationsRuntime`.
- `docs/policy/runtime-feature-resolution.md` — append worked example for `/obligations` paralleling `/status`.
- `PLANNING.md` — FW-0055 closes as `live (slice 1)`; FW-0069 opens for the deferred-capability slice.

**NOT modified:**

- `src/ports/respondent-place-source.ts` — no port change. Obligations already on the snapshot.
- `src/adapter-conformance/conformance.ts` — already covers the `obligations` field shape (non-array rejected, x-extensions preserved).
- `src/adapters/stub/respondent-place-source.ts` — already returns demo obligations through `demoRespondentPlaceSnapshot()`.
- `src/adapters/unavailable/respondent-place-source.ts` — already throws via the sentinel.
- `src/composition/{stub,default}.ts` — already wire the right adapters per mode.
- `src/policy/feature-keys.ts` — `respondentPlace` already seeded.

---

### Task 1: URL route parser

**Files:**
- Create: `src/app/obligations-route.ts`
- Create: `tests/app/obligations-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/obligations-route.test.ts
import { describe, expect, it } from 'vitest';
import { parseObligationsRoute } from '../../src/app/obligations-route.ts';

describe('parseObligationsRoute', () => {
  it('returns null for the form-fill root', () => {
    expect(parseObligationsRoute('https://app.example.test/')).toBeNull();
    expect(parseObligationsRoute('https://app.example.test/?x=y')).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(parseObligationsRoute('https://app.example.test/status?case=urn:wos:case_demo_0001')).toBeNull();
    expect(parseObligationsRoute('https://app.example.test/obligations/foo')).toBeNull();
  });

  it('matches /obligations with no params', () => {
    expect(parseObligationsRoute('https://app.example.test/obligations')).toEqual({});
  });

  it('matches /obligations and ignores irrelevant query params', () => {
    expect(parseObligationsRoute('https://app.example.test/obligations?utm_source=x')).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/app/obligations-route.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/app/obligations-route.ts
export interface ObligationsRouteParams {}

export function parseObligationsRoute(href: string): ObligationsRouteParams | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== '/obligations') {
    return null;
  }
  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

---

### Task 2: Extract shared obligations view helpers

**Files:**
- Create: `src/app/obligations-view.ts`
- Modify: `src/app/RespondentRuntime.tsx`

Existing `RespondentRuntime.tsx` has an inline `ObligationItem` component and depends on `obligation.state` for the "Due" stat block. Slice 1 introduces sort + section grouping that both surfaces should share.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/obligations-view.test.ts
import { describe, expect, it } from 'vitest';
import type { RespondentObligation } from '../../src/ports/index.ts';
import { groupAndSortObligations, uniqueSenderCount } from '../../src/app/obligations-view.ts';

const o = (overrides: Partial<RespondentObligation>): RespondentObligation => ({
  id: overrides.id ?? 'x',
  issuer: overrides.issuer ?? { name: 'Sender A' },
  title: overrides.title ?? 'Title',
  state: overrides.state ?? 'upcoming',
  dueAt: overrides.dueAt,
});

describe('groupAndSortObligations', () => {
  it('groups by section (due/upcoming/done) honoring state taxonomy', () => {
    const grouped = groupAndSortObligations([
      o({ id: '1', state: 'due' }),
      o({ id: '2', state: 'upcoming' }),
      o({ id: '3', state: 'submitted' }),
      o({ id: '4', state: 'overdue' }),
      o({ id: '5', state: 'satisfied' }),
      o({ id: '6', state: 'closed' }),
      o({ id: '7', state: 'unknown' }),
    ]);
    expect(grouped.dueNow.map((x) => x.id).sort()).toEqual(['1', '4']);
    expect(grouped.upcoming.map((x) => x.id).sort()).toEqual(['2', '7']);
    expect(grouped.done.map((x) => x.id).sort()).toEqual(['3', '5', '6']);
  });

  it('sorts within each section by dueAt asc; undefined last; ties broken by sender then title', () => {
    const grouped = groupAndSortObligations([
      o({ id: 'a', state: 'upcoming', dueAt: undefined, issuer: { name: 'B' }, title: 'b' }),
      o({ id: 'b', state: 'upcoming', dueAt: '2026-07-01T00:00:00Z' }),
      o({ id: 'c', state: 'upcoming', dueAt: '2026-06-01T00:00:00Z' }),
      o({ id: 'd', state: 'upcoming', dueAt: undefined, issuer: { name: 'A' }, title: 'a' }),
      o({ id: 'e', state: 'upcoming', dueAt: '2026-06-01T00:00:00Z', issuer: { name: 'B' }, title: 'b' }),
      o({ id: 'f', state: 'upcoming', dueAt: '2026-06-01T00:00:00Z', issuer: { name: 'B' }, title: 'a' }),
    ]);
    expect(grouped.upcoming.map((x) => x.id)).toEqual(['c', 'f', 'e', 'b', 'd', 'a']);
  });
});

describe('uniqueSenderCount', () => {
  it('counts distinct issuer names', () => {
    expect(
      uniqueSenderCount([
        o({ id: '1', issuer: { name: 'A' } }),
        o({ id: '2', issuer: { name: 'A' } }),
        o({ id: '3', issuer: { name: 'B' } }),
      ]),
    ).toBe(2);
  });
  it('returns 0 on empty', () => {
    expect(uniqueSenderCount([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

- [ ] **Step 3: Implement**

```ts
// src/app/obligations-view.ts
import type { RespondentObligation } from '../ports/index.ts';

export interface GroupedObligations {
  dueNow: RespondentObligation[];
  upcoming: RespondentObligation[];
  done: RespondentObligation[];
}

export function groupAndSortObligations(obligations: readonly RespondentObligation[]): GroupedObligations {
  const dueNow: RespondentObligation[] = [];
  const upcoming: RespondentObligation[] = [];
  const done: RespondentObligation[] = [];
  for (const o of obligations) {
    if (o.state === 'due' || o.state === 'overdue') dueNow.push(o);
    else if (o.state === 'submitted' || o.state === 'satisfied' || o.state === 'closed') done.push(o);
    else upcoming.push(o);
  }
  return {
    dueNow: dueNow.sort(byDueThenSenderThenTitle),
    upcoming: upcoming.sort(byDueThenSenderThenTitle),
    done: done.sort(byDueThenSenderThenTitle),
  };
}

export function uniqueSenderCount(obligations: readonly RespondentObligation[]): number {
  const names = new Set<string>();
  for (const o of obligations) names.add(o.issuer.name);
  return names.size;
}

function byDueThenSenderThenTitle(a: RespondentObligation, b: RespondentObligation): number {
  const aDue = a.dueAt ?? null;
  const bDue = b.dueAt ?? null;
  if (aDue === null && bDue !== null) return 1;
  if (aDue !== null && bDue === null) return -1;
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue < bDue ? -1 : 1;
  const senderCmp = a.issuer.name.localeCompare(b.issuer.name);
  if (senderCmp !== 0) return senderCmp;
  return a.title.localeCompare(b.title);
}
```

- [ ] **Step 4: Move `ObligationItem` render into `obligations-view.tsx`** (rename file to `.tsx` since it now exports JSX). Update `RespondentRuntime.tsx` to import `ObligationItem` from `./obligations-view.tsx` and remove the local definition. Existing tests must still pass.

- [ ] **Step 5: Verify all tests still pass**

```bash
npx vitest run
```

---

### Task 3: `ObligationsRuntime` scaffold + route discovery in `App.tsx`

**Files:**
- Create: `src/app/ObligationsRuntime.tsx` (scaffold only)
- Modify: `src/app/App.tsx`
- Modify: `tests/app/app-routing.test.tsx`

- [ ] **Step 1: Extend the App routing test**

Add a `/obligations` case alongside the existing `/` and `/status` cases. Mock window.location.href to `https://app.example.test/obligations`; assert `ObligationsRuntime` mounts.

- [ ] **Step 2: Run to verify FAIL**

- [ ] **Step 3: Scaffold ObligationsRuntime**

Minimum to make Task 3's test green — accepts `{ composition, config }` props, renders `<h1>What you owe</h1>` + a loading skeleton. Full render lands in Task 4.

- [ ] **Step 4: Wire App.tsx**

Mirror the existing status branch: parse obligations route alongside status route in the `useEffect`; if `parseObligationsRoute` returns non-null, lazy-import `ObligationsRuntime`. Update `RuntimeState` union to include the new `'obligations'` route variant.

- [ ] **Step 5: Verify test passes**

---

### Task 4: `ObligationsRuntime` full render

**Files:**
- Modify: `src/app/ObligationsRuntime.tsx`
- Create: `tests/app/obligations-runtime.test.tsx`

This is the load-bearing task. Use FW-0039's `tests/app/status-runtime.test.tsx` as the structural precedent.

- [ ] **Step 1: Write the failing test matrix** (covers every behaviour from design §Test coverage matrix)

Required cases:
- `renders sections` — fixture with mixed states; assert "Due now" / "Upcoming" / "Done" headings rendered with correct items beneath each.
- `sort order` — fixture with shuffled `dueAt` + ties; assert rendered order matches the sort contract.
- `cross-sender header` — fixture with N obligations across M unique-issuer names; assert header text contains "N obligation(s) across M sender(s)" (with correct singular/plural).
- `deferred capability copy` — literal copy fixture-pinned: "Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site."
- `empty state` — empty obligations array, profile enables `respondentPlace` → "You have no obligations from senders using this site."
- `instance-unavailable` — composition wires `unavailableRespondentPlaceSource`; profile disables `respondentPlace` via `optional-no-instance` → "Obligations are not shared. This site does not provide an obligations view."
- `org-forbidden` — orgRuntimePolicy forbids `respondentPlace` → "Obligations are not shared. This sender does not share an obligations view here."
- `auth required` — identityProvider discovers options + no boot claim → `AuthRequiredSurface` renders (reuse the existing component).
- `status link resolution` — obligation with `submissionRef = "sub-1"` where `snapshot.submissions` contains `{ id: 'sub-1', applicantStatus: { resourceRef: 'urn:wos:case_demo_0001' } }` → render link with `href = "/status?case=urn:wos:case_demo_0001"`; unresolvable `submissionRef` → no link.
- `no status fetch` — spy on `composition.statusReader.readStatus`; assert not called.
- `no form ports` — spy on `composition.draftStore.load/save`, `composition.submitTransport.submit`, `composition.definitionSource.getDefinition`; assert not called.
- `vocabulary firewall` — rendered DOM does NOT contain "respondent-place", "library", "sidecar", "snapshot", "subjectRef", "RespondentPlace".

- [ ] **Step 2: Run to verify FAIL**

- [ ] **Step 3: Implement**

Layered as `StatusRuntime` is. State machine:
- `loading` (initial)
- `auth-required` (no claim, identity options exist) — render `AuthRequiredSurface` (extract from `RespondentRuntime` if not already shared; if extraction is non-trivial defer to a follow-on cleanup and inline a minimal copy with a TODO referencing the cleanup row).
- `disabled` (resolved profile disables `respondentPlace`) — render disabled-cause copy.
- `ready` (snapshot loaded) — render header + sections.
- `error` (adapter threw) — render `FriendlyError`.

Synthesize runtime feature request: `form: { features: { respondentPlace: 'optional' } }` (per design §Runtime feature framing). Reuse `resolveRuntimeFeatures` from `src/policy/resolver.ts`.

- [ ] **Step 4: Verify all tests pass**

---

### Task 5: e2e axe-clean coverage

**Files:**
- Modify: `tests/e2e/placeholder-a11y.spec.ts`

- [ ] **Step 1: Add navigation to `/obligations`** in the existing demo-composition spec (or as a sibling test). Assert axe-clean on the rendered dashboard.

- [ ] **Step 2: Run e2e**

```bash
npx playwright test
```

---

### Task 6: Port + policy doc updates

**Files:**
- Modify: `docs/ports/respondent-place-source.md`
- Modify: `docs/policy/runtime-feature-resolution.md`

- [ ] **Step 1: `respondent-place-source.md`** — add §"Consumers" section:

```md
## Consumers

Two consumers in `formspec-web`:

- `RespondentPlacePanel` inside `RespondentRuntime` — surfaces obligations + files
  + submissions next to the form-fill view (in-form context).
- `ObligationsRuntime` at `/obligations` — standalone respondent-owned dashboard,
  identity-bound, sorted + sender-grouped + gap-honest. Reuses this port; calls
  no other (no `StatusReader`, no form ports).

Both share `src/app/obligations-view.tsx` for the obligation render contract.
```

- [ ] **Step 2: `runtime-feature-resolution.md`** — append a §"Worked example: the /obligations route as an optional surface" paralleling the existing /status example. Show the synthetic-form-policy pattern and the disabled-cause copy.

---

### Task 7: PLANNING + ADR cross-link

**Files:**
- Modify: `PLANNING.md`
- Modify: `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` (optional one-bullet footer append, same as FW-0039's Task 12)

- [ ] **Step 1: PLANNING.md FW-0055** — move row to `## Closed` with:
  - `Status: live (slice 1)`
  - `Done (slice 1):` bullet describing what shipped.
  - `Release gaps named:` bullet listing the deferrals (cross-issuer fan-out via XS-2; mute/batch/escalate; calendar export; notification-budget visibility; sender-circumvention signals; push notifications; production wallet/storage adapters).
  - Cross-link to design + plan + the new FW-0069 row.

- [ ] **Step 2: Open FW-0069** in Post-MVP with the deferred-capability slice (the same set listed in release gaps). `Blocked on: XS-2` for the cross-issuer fan-out parts.

- [ ] **Step 3: ADR-0011 footer** — one-bullet append: "`/obligations` route consumes the `respondentPlace` capability via synthetic optional form policy, mirroring `/status` (FW-0055 slice 1)."

---

### Task 8: Full-suite verification

- [ ] **Step 1:** `npm run ci` green.
- [ ] **Step 2:** `npm run check:testing-plan` green.
- [ ] **Step 3:** `npm run check:mvp-audit` green.
- [ ] **Step 4:** Architecture review (subagent if context allows; inline if not).
- [ ] **Step 5:** Code review (subagent if context allows).
- [ ] **Step 6:** Commit with explicit-paths form.

---

## Out-of-scope cleanups (file as follow-on rows or leave for craftsman judgment)

- Soft-navigation between `/`, `/status`, `/obligations` — needs router; not warranted for three routes.
- `obligations-view.ts` could grow `calendar-export.ts` later; do not pre-empt.
- `AuthRequiredSurface` extraction from `RespondentRuntime` — if non-trivial, defer to a small cleanup row.

## Design-claim → test mapping

| Design claim | Test |
|---|---|
| Standalone /obligations route | `obligations-route.test.ts` + `app-routing.test.tsx` |
| Sort + section grouping contract | `obligations-view.test.ts` + `obligations-runtime.test.tsx#renders sections` / `#sort order` |
| Cross-sender header | `obligations-runtime.test.tsx#cross-sender header` |
| Deferred-capability copy fixture-pinned | `obligations-runtime.test.tsx#deferred capability copy` |
| Empty-state copy | `obligations-runtime.test.tsx#empty state` |
| Disabled-cause copy (instance + org) | `obligations-runtime.test.tsx#instance-unavailable` / `#org-forbidden` |
| Identity-required + auth fallback | `obligations-runtime.test.tsx#auth required` |
| Cross-route status link resolution + no fabrication | `obligations-runtime.test.tsx#status link resolution` |
| Consumer discipline (no StatusReader, no form ports) | `obligations-runtime.test.tsx#no status fetch` + `#no form ports` |
| Vocabulary firewall | `obligations-runtime.test.tsx#vocabulary firewall` |
| Axe-clean in demo | `tests/e2e/placeholder-a11y.spec.ts` |
