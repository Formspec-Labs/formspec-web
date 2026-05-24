# FW-0039 — Post-submit status surface (slice 1) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship slice 1 of FW-0039 — a standalone `/status?case={WosResourceUrn}` route reachable without an account, rendering the WOS applicant API timeline + open tasks + AI disclosure, with honest per-case timing and an explicit "Timing for similar applications is not yet available" gap. Composition reuses the existing `StatusReader` port (no new port, no new feature key). File EXT-29 and FW-0067 for the cross-case throughput aggregation deferred to upstream.

**Design:** [`thoughts/specs/2026-05-23-fw-0039-post-submit-status-surface-design.md`](../specs/2026-05-23-fw-0039-post-submit-status-surface-design.md).

**Architecture:** New `StatusRuntime` consumes only `composition.statusReader` + `ResolvedRuntimeProfile`; no identity boot, no draft store, no submit transport, no formspec-engine init. `App.tsx` parses `window.location` once and selects between `RespondentRuntime` and `StatusRuntime`. Confirmation panel hands the respondent a `/status?case={urn}` tracking link when the submit transport returns a case URN.

**Tech Stack:** TypeScript 5 strict, React 19, Vitest, Playwright (axe). No new runtime dependencies.

---

## File Structure

**New files:**

- `src/app/StatusRuntime.tsx` — the standalone status surface; consumes `composition.statusReader` + `ResolvedRuntimeProfile`; renders timeline + open tasks + AI disclosure + timing strip; renders "Status not shared" for any disabled/not-found path.
- `src/app/status-route.ts` — pure URL parser (`parseStatusRoute(href: string): { caseUrn: WosResourceUrn } | null`). Lives outside the component so it is unit-testable without a DOM.
- `tests/app/status-route.test.ts` — URL parsing fixtures.
- `tests/app/status-runtime.test.tsx` — component coverage matrix (see design §Test coverage matrix).
- `tests/app/app-routing.test.tsx` — App.tsx route selection test; `/` renders `RespondentRuntime`, `/status?...` renders `StatusRuntime`.
- `docs/ports/status-reader.md` — adopter-facing port doc covering the URN-as-bearer-token semantics + adapter rate-limiting responsibility.

**Modified files:**

- `src/ports/submit-transport.ts` — extend `SubmitConfirmation` with optional `caseUrn?: WosResourceUrn`.
- `src/adapters/stub/submit-transport.ts` — populate `caseUrn` deterministically from the reference number.
- `src/app/RespondentRuntime.tsx` — `ConfirmationPanel` consumes `caseUrn` to build a `/status?case={urn}` link; rename CTA to "Track this application."
- `src/app/respondent-flow.ts` — `buildConfirmationTrackingUri(caseUrn: WosResourceUrn): string` helper.
- `src/app/App.tsx` — route selection: parse `window.location` once; if status route, lazy-import `StatusRuntime`; else continue with `RespondentRuntime`.
- `src/composition/stub.ts` — register the demo status resource under the deterministic `urn:wos:case_demo_0001` so the smoke flow + e2e click-through can reach it.
- `tests/app/respondent-runtime.test.tsx` — extend with the "tracking link rendered" + "no tracking link without caseUrn" assertions.
- `tests/adapters/` (new sibling `stub-submit-transport.test.ts` if it does not already exist; otherwise extend) — pin the `caseUrn` field shape.
- `tests/e2e/placeholder-a11y.spec.ts` — extend the existing demo-form-submit test with click-through to `/status` page; assert axe-clean on the status page.
- `docs/policy/runtime-feature-resolution.md` — append §"Worked example: the /status route as an optional surface" tying the design to the resolver's disabled-cause branches.
- `thoughts/specs/2026-05-22-upstream-extension-queue.md` — file `EXT-29: WOS applicant API recent-throughput projection`.
- `PLANNING.md` — FW-0039 row moves to `## Closed` with a "Progress (2026-05-DD)" + "Done (slice 1)" bullet, mirroring the FW-0065 close-out shape; new `FW-0067` row in Post-MVP for the cross-case-throughput consumer slice.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` — append `/status` route to the §Related Decisions / Implementation plan footer (small one-bullet append).

---

### Task 1: URL route parser

**Files:**
- Create: `src/app/status-route.ts`
- Create: `tests/app/status-route.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/app/status-route.test.ts
import { describe, expect, it } from 'vitest';
import { parseStatusRoute } from '../../src/app/status-route.ts';

describe('parseStatusRoute', () => {
  it('returns null for the form-fill root', () => {
    expect(parseStatusRoute('https://app.example.test/')).toBeNull();
    expect(parseStatusRoute('https://app.example.test/?utm_source=x')).toBeNull();
  });

  it('returns null for /status without a case param', () => {
    expect(parseStatusRoute('https://app.example.test/status')).toBeNull();
    expect(parseStatusRoute('https://app.example.test/status?ref=x')).toBeNull();
  });

  it('extracts a WOS resource URN from /status?case=', () => {
    const parsed = parseStatusRoute('https://app.example.test/status?case=urn:wos:case_demo_0001');
    expect(parsed).toEqual({ caseUrn: 'urn:wos:case_demo_0001' });
  });

  it('decodes a percent-encoded URN', () => {
    const href = 'https://app.example.test/status?case=urn%3Awos%3Acase_demo_0001';
    expect(parseStatusRoute(href)).toEqual({ caseUrn: 'urn:wos:case_demo_0001' });
  });

  it('rejects a case param that does not look like a WOS URN', () => {
    // Loose check — adapter is the final validator. The parser screens
    // obvious non-URN garbage so the page never round-trips arbitrary text
    // into the StatusReader request.
    expect(parseStatusRoute('https://app.example.test/status?case=javascript:alert(1)')).toBeNull();
    expect(parseStatusRoute('https://app.example.test/status?case=')).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/app/status-route.test.ts
```

Expected: FAIL — module not found.

- [x] **Step 3: Write minimal implementation**

```ts
// src/app/status-route.ts
import type { WosResourceUrn } from '../ports/status-reader.ts';

export interface StatusRouteParams {
  readonly caseUrn: WosResourceUrn;
}

const WOS_URN_PREFIX = 'urn:wos:';

export function parseStatusRoute(href: string): StatusRouteParams | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== '/status') {
    return null;
  }
  const candidate = url.searchParams.get('case');
  if (!candidate) {
    return null;
  }
  if (!candidate.startsWith(WOS_URN_PREFIX)) {
    return null;
  }
  return { caseUrn: candidate };
}
```

- [x] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/app/status-route.test.ts
```

Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/app/status-route.ts tests/app/status-route.test.ts -m "feat(app): /status route parser (FW-0039 slice 1)

Pure parser keyed off window.location.href; rejects non-URN garbage so
the status page never round-trips arbitrary text into StatusReader."
```

---

### Task 2: `SubmitConfirmation.caseUrn` field + stub transport populates it

**Files:**
- Modify: `src/ports/submit-transport.ts`
- Modify: `src/adapters/stub/submit-transport.ts`
- Modify: `tests/adapters/` (new or existing stub-submit-transport test)

- [x] **Step 1: Locate the existing stub-transport tests**

```bash
ls tests/adapters
grep -r "stubSubmitTransport" tests/ src/composition/
```

If there is no existing `stub-submit-transport.test.ts`, create one. Otherwise extend the existing file.

- [x] **Step 2: Write the failing test (new or extension)**

```ts
// tests/adapters/stub-submit-transport.test.ts
import { describe, expect, it } from 'vitest';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import type { IntakeHandoff } from '../../src/ports/submit-transport.ts';

const sampleHandoff: IntakeHandoff = {
  $intakeHandoff: '1.0',
  initiationMode: 'publicIntake',
  formUrl: 'https://formspec.example.test/forms/demo',
  formVersion: '1.0.0',
  response: {} as never,
};

describe('stubSubmitTransport caseUrn (FW-0039 slice 1)', () => {
  it('returns a deterministic WOS case URN alongside the reference number', async () => {
    const transport = stubSubmitTransport();
    const confirmation = await transport.submit(sampleHandoff, 'idem-1');
    expect(confirmation.referenceNumber).toMatch(/^STUB-/);
    expect(confirmation.caseUrn).toBeDefined();
    expect(confirmation.caseUrn).toMatch(/^urn:wos:case_demo_/);
  });

  it('keeps caseUrn stable across retries with the same idempotency key', async () => {
    const transport = stubSubmitTransport();
    const a = await transport.submit(sampleHandoff, 'idem-stable');
    const b = await transport.submit(sampleHandoff, 'idem-stable');
    expect(a.caseUrn).toBe(b.caseUrn);
  });
});
```

- [x] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/adapters/stub-submit-transport.test.ts
```

Expected: FAIL — `caseUrn` is undefined.

- [x] **Step 4: Extend the port type**

```ts
// src/ports/submit-transport.ts — add to SubmitConfirmation interface
// (find the existing `referenceNumber` / `trackingUri` fields and add caseUrn next to them)
import type { WosResourceUrn } from './status-reader.ts';

// Inside SubmitConfirmation:
//   readonly caseUrn?: WosResourceUrn;
```

(Edit in place; don't break existing fields.)

Per arch-review F-7, the field is **optional** on the type. Consumer code must handle `undefined`; producer code (HTTP transport) MUST NOT populate it until the production status adapter lands.

- [x] **Step 5: Populate `caseUrn` in the stub transport**

Modify `src/adapters/stub/submit-transport.ts`: derive a stable `caseUrn` from the idempotency key (e.g., `urn:wos:case_demo_${idempotencyKey-derived-tail}`) and put it on the returned confirmation. The deterministic shape lets the stub composition pre-register a status resource under the same key in Task 5.

- [x] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/adapters/stub-submit-transport.test.ts
```

Expected: PASS (2 tests).

- [x] **Step 7: Commit**

```bash
git -C formspec-web commit \
  src/ports/submit-transport.ts \
  src/adapters/stub/submit-transport.ts \
  tests/adapters/stub-submit-transport.test.ts \
  -m "feat(submit-transport): optional caseUrn on SubmitConfirmation (FW-0039 slice 1)

Stub transport emits a deterministic urn:wos:case_demo_* URN so the
respondent gets a working /status?case={urn} link from the demo
composition. HTTP transport stays unchanged per arch-review F-7 — the
field is optional; consumer code handles undefined."
```

---

### Task 3: Confirmation panel renders the "Track this application" link

**Files:**
- Modify: `src/app/respondent-flow.ts` — add `buildConfirmationTrackingUri`.
- Modify: `src/app/RespondentRuntime.tsx` — `ConfirmationPanel` reads `confirmation.caseUrn`.
- Modify: `tests/app/respondent-runtime.test.tsx` — assertions.

- [x] **Step 1: Write the failing test extension**

In `tests/app/respondent-runtime.test.tsx`, add a `describe('Track this application link (FW-0039 slice 1)')` block:

```tsx
it('renders a /status?case={urn} link when the stub transport returns a caseUrn', async () => {
  const composition = createStubComposition();
  render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
  await fillAndSubmit(); // existing helper that drives the demo form to submit
  await waitFor(() => {
    const link = screen.queryByRole('link', { name: /Track this application/i });
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toMatch(/^\/status\?case=urn%3Awos%3Acase_demo_/);
  });
});

it('does NOT render a tracking link when the confirmation omits caseUrn', async () => {
  const composition = createStubComposition();
  // Replace the stub transport with one that returns a confirmation WITHOUT caseUrn.
  (composition as { submitTransport: unknown }).submitTransport = {
    async submit() {
      return { referenceNumber: 'NO-CASE-001' };
    },
  };
  render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
  await fillAndSubmit();
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: /Submission received/i })).not.toBeNull();
  });
  expect(screen.queryByRole('link', { name: /Track this application/i })).toBeNull();
});
```

(Reuse the existing test helpers in this file for form-fill + submit; if none exist, write a small `fillAndSubmit()` local helper that mirrors the existing test patterns.)

- [x] **Step 2: Run test to verify it fails**

Expected: FAIL — no link rendered.

- [x] **Step 3: Implement the helper**

```ts
// src/app/respondent-flow.ts — append
export function buildConfirmationTrackingUri(caseUrn: string): string {
  return `/status?case=${encodeURIComponent(caseUrn)}`;
}
```

- [x] **Step 4: Wire the link into `ConfirmationPanel`**

In `src/app/RespondentRuntime.tsx`, change `ConfirmationPanel` so it:

- Reads `confirmation.caseUrn`.
- When present, renders `<a href={buildConfirmationTrackingUri(confirmation.caseUrn)}>Track this application</a>`.
- When absent, the panel keeps the existing copy (no tracking link section).

The existing optional `trackingUri` field stays untouched — slice 1 is additive. (Future consolidation between `trackingUri` and `caseUrn` belongs to whatever row lands the production status adapter; the design's §Non-goals pins HTTP transport untouched.)

- [x] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/app/respondent-runtime.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git -C formspec-web commit \
  src/app/respondent-flow.ts \
  src/app/RespondentRuntime.tsx \
  tests/app/respondent-runtime.test.tsx \
  -m "feat(respondent-runtime): 'Track this application' link from caseUrn (FW-0039 slice 1)

ConfirmationPanel renders /status?case={urn} when the submit transport
returns a caseUrn. Absent — existing copy stays. Per arch-review F-7
the caseUrn field is optional so this stays additive over FW-0001."
```

---

### Task 4: Status route discovery in `App.tsx`

**Files:**
- Modify: `src/app/App.tsx`
- Create: `tests/app/app-routing.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
// tests/app/app-routing.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/app/App.tsx';
import { CompositionProvider } from '../../src/app/CompositionProvider.tsx';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('App route selection (FW-0039 slice 1)', () => {
  const originalLocation = window.location;
  beforeEach(() => {
    // Allow per-test pathname/search override.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL('http://localhost/'),
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });

  it('routes / to the form runtime', async () => {
    window.location = new URL('http://localhost/') as unknown as Location;
    const composition = createStubComposition();
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      // Form runtime renders the demo form's title in its <h1>.
      expect(screen.queryByRole('heading', { name: /Demo Benefits Intake/i, level: 1 })).not.toBeNull();
    });
  });

  it('routes /status?case=urn:wos:... to the status runtime', async () => {
    window.location = new URL('http://localhost/status?case=urn:wos:case_demo_0001') as unknown as Location;
    const composition = createStubComposition();
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      // Status runtime renders its own <h1>.
      expect(screen.queryByRole('heading', { name: /Your application status/i, level: 1 })).not.toBeNull();
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Expected: FAIL — second test fails (no StatusRuntime exists).

- [x] **Step 3: Implement route selection in `App.tsx`**

Inside `App.tsx`, replace the single `import('./RespondentRuntime.tsx')` lazy load with a route-aware loader:

```ts
import { parseStatusRoute } from './status-route.ts';

// Inside App() useEffect:
const route = parseStatusRoute(window.location.href);
const loader = route
  ? import('./StatusRuntime.tsx').then((m) => ({ Runtime: m.StatusRuntime, route }))
  : import('./RespondentRuntime.tsx').then((m) => ({ Runtime: m.RespondentRuntime, route: null }));
void loader.then(({ Runtime, route }) => {
  if (!cancelled) {
    setRuntimeState({ status: 'ready', Runtime, route });
  }
});
```

Then in the render: pass `route` as an additional prop when present. `StatusRuntime` accepts `{ composition, route }`; `RespondentRuntime` ignores it.

- [x] **Step 4: Create the minimum `StatusRuntime.tsx` to make the route test pass**

Just enough to make Task 4's test green — a loading skeleton + `<h1>Your application status</h1>`. Real rendering lands in Task 6. This keeps the red/green cycle tight.

```tsx
// src/app/StatusRuntime.tsx — minimum shape
import type { Composition } from '../composition/types.ts';
import type { StatusRouteParams } from './status-route.ts';

interface StatusRuntimeProps {
  composition: Composition;
  route: StatusRouteParams;
  // config is unused by StatusRuntime; accept it to match the App-side prop shape.
  config?: unknown;
}

export function StatusRuntime(_props: StatusRuntimeProps) {
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p>Loading status</p>
    </section>
  );
}
```

- [x] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/app/app-routing.test.tsx
```

Expected: PASS (2 tests).

- [x] **Step 6: Commit**

```bash
git -C formspec-web commit \
  src/app/App.tsx \
  src/app/StatusRuntime.tsx \
  tests/app/app-routing.test.tsx \
  -m "feat(app): route /status to a placeholder StatusRuntime (FW-0039 slice 1)

window.location parsed once at mount per design §Non-goals. StatusRuntime
ships as a placeholder; rendering lands in subsequent task."
```

---

### Task 5: Stub composition registers the demo case status under the deterministic URN

**Files:**
- Modify: `src/composition/stub.ts`
- Modify: `src/demo/respondent-place.ts` (optional — only if Task 2's caseUrn shape doesn't already align)
- Verify: existing `tests/profiles/composition-policy-wiring.test.ts` still green.

- [x] **Step 1: Determine the deterministic caseUrn the stub transport will emit**

The Task 2 stub transport derives `urn:wos:case_demo_{...tail...}` from the idempotency key. For the e2e demo flow, the form submit path uses `generateIdempotencyKey()` (random UUIDv7), so the URN is per-submit. The respondent-place sidecar already registers a sample case `urn:wos:case_demo_0001` for the in-form panel. Two distinct URN sets exist:

- **Pre-registered demo case** (`urn:wos:case_demo_0001`) — surfaced through the in-form RespondentPlacePanel. Lets the e2e test reach `/status?case=urn:wos:case_demo_0001` without a real submit roundtrip.
- **Fresh-submit case** (`urn:wos:case_demo_{idem-tail}`) — emitted by Task 2's stub transport on each submit. The post-submit "Track this application" link lands here.

The stub composition needs to register status data for the demo URN. The fresh-submit URN has no pre-registered status (the stub adapter returns `undefined` for unknown keys, so the page renders "We don't have status for this reference" — which is the correct honest behavior for a just-submitted case).

- [x] **Step 2: Verify or extend the stub composition registration**

```bash
grep -n "registerStatus\|case_demo_0001" src/composition/stub.ts src/adapters/stub/status-reader.ts
```

Confirm the existing wiring registers `urn:wos:case_demo_0001 → demoApplicantStatusResource()`. If yes, no change needed. If the resource needs upgrading from a `ApplicantStatusTimelineEntry` (single event) to an `ApplicantCaseDetail` (full timeline + open tasks + ai involvement) for Task 6's full render, extend `src/demo/respondent-place.ts`:

```ts
export function demoApplicantCaseDetail(): ApplicantCaseDetail {
  return {
    summary: {
      id: 'urn:wos:case_demo_0001',
      workflowUrl: 'https://benefits.example.gov/workflows/benefits-adjudication',
      lifecycleState: 'active',
      actionNeeded: true,
      title: 'Application for benefits adjudication',
      createdAt: '2026-05-23T12:00:00.000Z',
      updatedAt: '2026-05-23T15:30:00.000Z',
    },
    openTasks: [
      {
        id: 'urn:wos:task_demo_001',
        processId: 'urn:wos:case_demo_0001',
        kind: 'verification',
        status: 'pending',
        title: 'Provide additional address proof',
        deadline: '2026-06-15T23:59:59.000Z',
        createdAt: '2026-05-23T13:00:00.000Z',
      },
    ],
    recentNotifications: [],
    statusTimeline: [
      { event: 'case-created', occurredAt: '2026-05-23T12:00:00.000Z', summary: 'Application received.' },
      { event: 'applicant-task-assigned', occurredAt: '2026-05-23T13:00:00.000Z',
        summary: 'Verification task assigned.', taskId: 'urn:wos:task_demo_001' },
    ],
    aiInvolvement: {
      agentsInvolved: [{ displayName: 'Eligibility Assistant', roleInDecision: 'advisory' }],
      narrativeRecordCount: 1,
      humanReviewedAllAgentDecisions: true,
    },
  };
}
```

Then in `createStubComposition`:

```ts
statusReader: stubStatusReader([
  ['urn:wos:case_demo_0001', demoApplicantCaseDetail()],
]),
```

Replacing the old single-`event` registration with the case-detail registration. The single-event registration was sufficient for the in-form panel's SubmissionItem render, which destructures `event` from a timeline entry; the new case-detail registration is structurally compatible because `SubmissionItem`'s statusFeedback already discriminates `'statusTimeline' in status` for case details.

- [x] **Step 3: Run all existing tests to catch regressions**

```bash
npm run test:unit
```

Adjust any tests that asserted on the old `ApplicantStatusTimelineEntry` shape; the case-detail shape is structurally richer (`SubmissionItem`'s `statusFeedback` walks the timeline correctly).

- [x] **Step 4: Commit**

```bash
git -C formspec-web commit \
  src/composition/stub.ts \
  src/demo/respondent-place.ts \
  -m "feat(demo): register demo case status as a full ApplicantCaseDetail (FW-0039 slice 1)

Lets the /status?case=urn:wos:case_demo_0001 route reach a full timeline +
open task + AI disclosure render in the stub composition. Existing
SubmissionItem render path remains green via the case-detail branch."
```

---

### Task 6: `StatusRuntime` real render

**Files:**
- Modify: `src/app/StatusRuntime.tsx` (replace the placeholder with the real surface)
- Create: `tests/app/status-runtime.test.tsx`
- Modify: `src/app/app.css` — small additions for the new chrome (5-stage strip, timing strip, AI disclosure box, what-comes-next ribbon). Keep additive, no overrides.

- [x] **Step 1: Write the failing tests (full matrix)**

Cover (each as a separate `it`):

1. **timeline render** — Renders `<h1>Your application status</h1>` + a `<ol>` of timeline entries with labels drawn from `labelFromToken(event)`.
2. **5-stage strip** — A `role="list"` with the five stage labels (`Received / In review / Decision drafted / Issued / Closed`). The current stage is marked `aria-current="step"`. The strip is derived from the most recent timeline event class.
3. **timing strip** — Shows the literal copy "Time since each step on your application" AND the literal copy "Timing for similar applications is not yet available on this site." prominently. Per-step duration text is present (e.g., "1 hour" or "2 days").
4. **no-aggregate copy pin** — Fixture-pin the literal "Timing for similar applications is not yet available on this site." copy.
5. **AI disclosure** — When `aiInvolvement` is present, renders an `<aside>` with `<h2>AI participated in this case</h2>`, agent name + role, "Reviewed by a human: Yes/No", and the narrative record count.
6. **AI disclosure absent** — when `aiInvolvement` is undefined, the `<aside>` is not rendered.
7. **open tasks ribbon** — when `openTasks.length > 0`, renders a "What you owe next" section with task title + deadline formatted.
8. **unknown URN** — when `statusReader.readStatus()` returns `undefined`, renders "We don't have status for this reference. Check the link, or contact the sender." No timeline, no stage strip.
9. **org-forbidden** — when the resolved profile disables `status` with cause `org-forbidden`, renders "Status not shared. This issuer does not share application status here." No call to `statusReader.readStatus()`.
10. **instance-unavailable (production)** — when the resolved profile disables `status` with cause `optional-no-instance`, renders "Status not shared. This site does not provide application status." No call to `statusReader.readStatus()`. (Per arch-review F-4, no `RuntimePolicyErrorPage`, no typed error.)
11. **no identity authenticate** — `composition.identityProvider.authenticate()` and `discover()` are NEVER called on the status route. Use `vi.spyOn` on both.
12. **runtime adapter error** — when `statusReader.readStatus()` throws, the page catches and renders "We could not load this status. Try again later." plus a generic message; the error is logged to console.error.

Write the test file with one `describe` block per concern; reuse `createStubComposition()` and patch its `statusReader` / `instanceCapabilities` / `orgRuntimePolicy` per test, mirroring the existing `tests/app/runtime-feature-gating.test.tsx` patterns.

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/app/status-runtime.test.tsx
```

Expected: FAIL — placeholder StatusRuntime doesn't render any of the asserted content.

- [x] **Step 3: Implement `StatusRuntime.tsx`**

Wire:

1. `useEffect` mount-time resolution: `resolveRuntimeFeatures({ mode: composition.mode, instance, org, form: { features: {} } })`. Catch nothing — for an optional surface on an instance that can't serve it, the resolver returns `disabled` cleanly, no throw. (Per arch-review F-4.) `InvalidRuntimePolicyError` from a misconfigured org-policy WILL throw; catch and surface via `RuntimePolicyErrorPage` (which still exists for genuinely-invalid configs).
2. If profile disables `status`, render the appropriate "Status not shared" copy keyed off `disabled.get('status')?.cause` (matching the M-3 plumbing's vocabulary):
   - `org-forbidden` / `form-forbidden` → "This issuer does not share application status here."
   - `optional-no-instance` / others → "This site does not provide application status."
3. If profile enables `status`, call `composition.statusReader.readStatus({ resourceRef: route.caseUrn })`.
4. Discriminate the returned `ApplicantStatusResource` union — slice 1 renders best on `ApplicantCaseDetail` (the case-detail branch with timeline + tasks + ai). For other branches (single timeline entry, lifecycle summary, notification page), render a smaller surface that still carries the available data.
5. Derive 5-stage current cell by mapping the most recent timeline `event` to a stage label.
6. Derive per-step duration text by walking `statusTimeline[]` adjacent pairs.
7. Render the timing strip header literally as "Time since each step on your application" and immediately above it the literal "Timing for similar applications is not yet available on this site." in the same visual weight.
8. AI disclosure: gated on `caseDetail.aiInvolvement` presence.
9. What-comes-next: gated on `caseDetail.openTasks.length > 0`.
10. NEVER call `composition.identityProvider.discover()` or `.authenticate()` (they belong to `RespondentRuntime`). Don't import `bootIdentity` / `applyReadyState`.

Use the existing `labelFromToken` / `formatDate` helpers from `RespondentRuntime.tsx` — extract them to a shared module (`src/app/format.ts`) so both runtimes use the same helpers. Add a new `formatDuration(fromIso: string, toIso: string): string` helper to the same module.

- [x] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/app/status-runtime.test.tsx
```

Expected: PASS (12 tests).

- [x] **Step 5: Add minimal CSS**

Append additive selectors to `src/app/app.css`:

- `.status-surface` (page container, mirror `respondent-place` block spacing)
- `.status-stage-strip` + `.status-stage-strip__cell` + `.status-stage-strip__cell--current`
- `.status-timing` + `.status-timing__no-aggregate` (prominent)
- `.status-ai-disclosure`
- `.status-next-tasks`

Keep selectors namespaced under `.status-surface` so the form runtime CSS is untouched.

- [x] **Step 6: Run typecheck + lint to catch regressions**

```bash
npm run typecheck && npm run lint
```

- [x] **Step 7: Commit**

```bash
git -C formspec-web commit \
  src/app/StatusRuntime.tsx \
  src/app/format.ts \
  src/app/RespondentRuntime.tsx \
  src/app/app.css \
  tests/app/status-runtime.test.tsx \
  -m "feat(status-runtime): render WOS-shaped case status with honest timing (FW-0039 slice 1)

Five-stage strip, per-case timing list, prominent 'no aggregate' framing,
AI disclosure when present, what-comes-next ribbon from open tasks.

Identity boot is bypassed — status route reads only StatusReader + the
resolved profile (no IdentityProvider.authenticate/discover, no draft
store, no submit transport, no formspec-engine init) per design
§Architectural surface + arch-review F-9.

Disabled features render the 'Status not shared' M-3 copy honestly per
the disabled cause; no typed RuntimePolicyError on this route per
arch-review F-4."
```

---

### Task 7: e2e click-through coverage

**Files:**
- Modify: `tests/e2e/placeholder-a11y.spec.ts` (append one test scenario; do not rename the file — arch-review F-5)

- [x] **Step 1: Append the failing test**

```ts
test('demo submit click-through opens an accessible status page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demo Benefits Intake' })).toBeVisible();
  // Fill enough to submit (mirror the existing test's fill path)
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.test');
  await page.getByLabel('Preferred contact method').selectOption('email');
  await page.getByLabel('Member name').first().fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Submit' }).click();

  // Confirmation panel renders + tracking link present
  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();
  const trackingLink = page.getByRole('link', { name: /Track this application/i });
  await expect(trackingLink).toBeVisible();

  await trackingLink.click();
  await expect(page.getByRole('heading', { name: 'Your application status', level: 1 })).toBeVisible();
  await expect(page.getByText('Timing for similar applications is not yet available on this site.')).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

- [x] **Step 2: Run the e2e suite**

```bash
npm run test:e2e
```

Expected: the new scenario passes, the existing scenarios stay green.

- [x] **Step 3: Commit**

```bash
git -C formspec-web commit \
  tests/e2e/placeholder-a11y.spec.ts \
  -m "test(e2e): submit click-through opens an accessible status page (FW-0039 slice 1)"
```

---

### Task 8: Status-reader port doc (adopter-facing)

**Files:**
- Create: `docs/ports/status-reader.md`

- [x] **Step 1: Write the doc**

Mirror the existing `docs/ports/*.md` shape (definition-source, draft-store, submit-transport, identity-provider, notification-delivery). Sections to cover:

- **Purpose** — WOS applicant API resource shapes; ratified per ADR-0010.
- **Interface** — link to `src/ports/status-reader.ts`.
- **Composition wiring** — stub adapter for demo; unavailable sentinel for production; `ProxiedApplicantStatusAdapter` planned per FW-0039 row + web ADR-0008.
- **URN-as-bearer-token semantics (FW-0039 slice 1)** — the `/status?case={urn}` route hands the URN to `readStatus`; adopters MUST rate-limit unknown-URN probes server-side; the page returns uniform "not found" copy for every unknown URN so it is not an enumeration oracle. URN format follows the stack-common-typeid grammar (queue EXT-13).
- **Disabled-status rendering** — when the resolved runtime profile disables `status`, `StatusRuntime` short-circuits and never calls `readStatus`. The honest copy is "Status not shared" — adapters do not need to handle policy-disabled cases.
- **Throughput aggregation** — out of scope; deferred to EXT-29 (WOS applicant API recent-throughput projection) consumed by FW-0067.
- **Conformance** — link to `tests/adapter-conformance/status-reader/conformance.test.ts` and the shared definitions in `src/adapter-conformance/conformance.ts`.

- [x] **Step 2: Verify lint + check:release-docs**

```bash
npm run lint
npm run check:release-docs
```

If the docs check expects the file to appear in some manifest, update the manifest accordingly.

- [x] **Step 3: Commit**

```bash
git -C formspec-web commit \
  docs/ports/status-reader.md \
  -m "docs(ports): status-reader adopter doc (FW-0039 slice 1)

Covers URN-as-bearer-token semantics, adapter-side rate-limiting
responsibility, and the policy-disabled short-circuit. Status-reader
port doc was a pre-existing gap (M3 didn't gate it); FW-0039 lands it
because the slice's accountless honesty depends on it (arch-review F-2)."
```

---

### Task 9: Runtime-feature-resolution doc — worked example

**Files:**
- Modify: `docs/policy/runtime-feature-resolution.md`

- [x] **Step 1: Append §"Worked example: the /status route as an optional surface"**

```markdown
## Worked example: the /status route as an optional surface (FW-0039)

The `/status?case={WosResourceUrn}` route (FW-0039) is a non-form surface
that consumes the `status` capability key but does NOT require it. The
StatusRuntime resolves the profile with `form: { features: {} }` so the
form-policy layer is silent; the org-policy + instance-availability
combination drives the verdict:

| Instance | Org | Form | Page renders |
|---|---|---|---|
| `available` | `allowed` / `default-on` / `required` | silent | full status page |
| `available` | `forbidden` | silent | "Status not shared. This issuer does not share application status here." |
| `unavailable` | any | silent | "Status not shared. This site does not provide application status." |
| `demo-stub` (demo mode) | `allowed` | silent | full status page (demo) |
| `demo-stub` (production mode) | any | silent | InvalidRuntimePolicyError at composition boot (production rejects demo stubs) |

The page never raises a typed `UnsupportedRequiredFeatureError` on this
route because it never forces `status: required`. This is deliberate per
FW-0039 design §Runtime feature framing — the `/status` route is an
optional surface and the disabled-cause branches drive the rendered
copy. The fault-injection test on production-mode + demo-stub still
fails at construction-time `assertCompositionCoherence`; that is the
honesty gate for the demo / production boundary, not a per-route gate.
```

- [x] **Step 2: Commit**

```bash
git -C formspec-web commit \
  docs/policy/runtime-feature-resolution.md \
  -m "docs(policy): /status route as a worked example of optional-surface gating (FW-0039 slice 1)"
```

---

### Task 10: File EXT-29 in the upstream extension queue

**Files:**
- Modify: `thoughts/specs/2026-05-22-upstream-extension-queue.md`

- [x] **Step 1: Append the EXT-29 entry**

After the EXT-25 entry in `## Class 4 — Reference deployment and server gaps` (or wherever fits the existing structure):

```markdown
### EXT-29: WOS applicant API recent-throughput projection

**Owning repo:** work-spec (schema) + formspec-server (proxy)
**Closes:** the "actual recent throughput" half of J-021. Today the WOS `ApplicantStatusTimelineEntry[]` exposes per-case event history; there is no projection of cross-case stage-duration statistics (e.g., "median time from `applicant-task-submitted` to `decision-reached` for cases on this workflow in the last 90 days"). Without it, the formspec-web post-submit status surface (FW-0039) shows only per-case timing and cannot satisfy the J-021 "realistic time estimates from actual recent throughput, not vendor estimates" claim.
**FW rows blocked:** FW-0067 (consumer slice — render the throughput strip on the /status page).
**Shape:** new applicant-scoped subresource — likely `GET /api/v1/applicant/workflows/{workflowUrl}/throughput` returning a small shape: `{ workflowUrl, sampleWindow: { fromAt, toAt, sampleCount }, stageDurations: [{ fromEvent, toEvent, p50, p75, p90 }] }`. Closed `fromEvent` / `toEvent` enum reuses `ApplicantStatusTimelineEntry.event`. Server-side filters: sample window, minimum sample count (no projection if sample is too small to be honest), tenant scope respected.
**Honesty constraint:** when sample is below the minimum (the workflow is too new, or the issuer is too low-volume), the projection MUST return an empty `stageDurations[]` rather than synthesizing percentiles from a tiny sample. The consumer slice (FW-0067) renders the "Timing for similar applications is not yet available" copy in both the no-projection and empty-projection cases — that is the load-bearing honesty seam.
**Why not a Formspec-web client-side aggregate over many cases the wallet has cached:** ADR-0010 forbids server-side cross-tenant aggregation; client-side aggregation over the respondent's own cases is per-respondent, not per-workflow — meaningless for "throughput for cases like yours."
**Fixture status:** none. Land with sample-window + minimum-sample fixtures.
**Status:** not yet filed.
```

- [x] **Step 2: Commit**

```bash
git -C formspec-web commit \
  thoughts/specs/2026-05-22-upstream-extension-queue.md \
  -m "feat(queue): file EXT-29 — WOS applicant API recent-throughput projection (FW-0039)

Honesty constraint: the projection returns empty stageDurations rather
than synthesizing percentiles from a tiny sample. The consumer slice
(FW-0067) renders the 'no aggregate yet' copy in both no-projection and
empty-projection cases. Cross-tenant client-side aggregation is rejected
per ADR-0010."
```

---

### Task 11: PLANNING row close-out + FW-0067 file

**Files:**
- Modify: `PLANNING.md`

- [x] **Step 1: Update the FW-0039 Post-MVP row**

Find the existing FW-0039 row in `## Post-MVP`. Append a "Progress" bullet that summarizes what slice 1 landed, then leave the row body in place and convert the row to a stub pointing into `## Closed` (mirroring the FW-0065 close-out pattern in `git show 2b4856c -- PLANNING.md`):

```markdown
### FW-0039 — *(closed as live (slice 1); see [## Closed](#closed); follow-on FW-0067)*
```

- [x] **Step 2: Append the closed entry**

In `## Closed`, after FW-0065:

```markdown
### FW-0039 — Post-submit status surface (slice 1) — standalone /status route + accountless URN access

- **Phase:** Post-MVP
- **Status:** live (slice 1; cross-case throughput deferred to FW-0067 + EXT-29)
- **Persona:** Respondent
- **Journey:** [J-021](JOURNEYS.md#j-021--i-hit-submit-where-is-it-now-and-what-do-i-owe-next)
- **What slice 1 landed:** Standalone `/status?case={WosResourceUrn}` route reachable without an account; `StatusRuntime` renders the WOS applicant API timeline + open tasks + AI-involvement disclosure + per-case timing strip with prominent "Timing for similar applications is not yet available on this site." framing. Confirmation panel hands the respondent a "Track this application" link when the submit transport returns a case URN. Vocabulary firewall preserved (WOS enums pass through `labelFromToken`; no case-URN leaks into body copy). Identity boot is bypassed on the `/status` route — the page composes ONLY: runtime profile resolution + StatusReader.readStatus + render. Per-route runtime-feature gate reuses the `status` key (no new key, no taxonomy extension). Plain "Status not shared" copy renders for all disabled-cause branches (org-forbidden, form-forbidden, instance-unavailable, demo-stub-in-production-rejected) per FW-0065's M-3 plumbing extended to a non-form surface.
- **Done (slice 1):** `tests/app/status-runtime.test.tsx` (12 cases); `tests/app/app-routing.test.tsx`; `tests/app/status-route.test.ts`; `tests/adapters/stub-submit-transport.test.ts`; extended `tests/app/respondent-runtime.test.tsx`; extended `tests/e2e/placeholder-a11y.spec.ts`; `docs/ports/status-reader.md`; `docs/policy/runtime-feature-resolution.md` worked example. `npm run ci` green. Vocabulary firewall pinned (all status enum values routed through `labelFromToken`; no spec/server vocabulary in default views). Accessibility: e2e click-through passes axe.
- **User-visible behavior change:** post-submit confirmation now offers a bookmarkable "Track this application" link instead of dead-ending at a reference number. Reopening that link in any browser, without signing in, shows the live application status page.
- **Consumes ports:** `StatusReader` (existing). No new ports.
- **Plan:** [`thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md`](thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md).
- **Design:** [`thoughts/specs/2026-05-23-fw-0039-post-submit-status-surface-design.md`](thoughts/specs/2026-05-23-fw-0039-post-submit-status-surface-design.md).
- **Release gaps named:** (a) cross-case recent-throughput projection — see FW-0067 + EXT-29; (b) production `ProxiedApplicantStatusAdapter` — the same one FW-0039's `Blocked on:` named; until it ships, the production composition wires `unavailableStatusReader` and the `/status` route renders the "Status not shared. This site does not provide application status." copy honestly; (c) URN-as-possession-factor model — adapter-side rate limiting is load-bearing for the slice's honesty contract (named in `docs/ports/status-reader.md`); URN expiry / magic-link rotation / browser-bound proof remain FW-0054's job.
- **Note:** Closes web ADR-0011 §Failure Semantics for an OPTIONAL non-form surface (the design and the resolver permit it cleanly without forcing a `required` form-policy synthesis — arch-review F-4). Consumes web ADR-0010 §DI shape `StatusReader` port without extension.
```

- [x] **Step 3: File FW-0067 in `## Post-MVP`**

Place between FW-0066 and FW-0002 (mirroring FW-0066's neighborhood):

```markdown
### FW-0067 — Cross-case throughput strip on the /status page

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-021](JOURNEYS.md#j-021--i-hit-submit-where-is-it-now-and-what-do-i-owe-next) (the "actual recent throughput" half)
- **Done:** The `/status?case={urn}` page (FW-0039 slice 1) shows a workflow-scoped throughput strip drawn from the EXT-29 projection — "Most decisions on this workflow have been issued within X days over the last 90 days (N cases)." When the projection is empty or below the minimum-sample threshold, the page continues to render the FW-0039 slice 1 "Timing for similar applications is not yet available" copy honestly. Strip text + threshold behavior is fixture-pinned so future copy edits trip the assertions.
- **Consumes ports:** likely a new `WorkflowThroughputReader` port (or an extension on `StatusReader`) — port-shape ratified per web ADR-0009 when this row's consumer code lands.
- **Blocked on:** EXT-29 (WOS applicant API recent-throughput projection — see `thoughts/specs/2026-05-22-upstream-extension-queue.md`).
- **Anti-patterns:** AP-006, AP-013.
```

- [x] **Step 4: Run the PLANNING validators**

```bash
npm run check:testing-plan
npm run check:mvp-audit
npm run check:upstream-blockers
```

Fix any validator complaints inline.

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit \
  PLANNING.md \
  -m "docs(planning): close FW-0039 as live (slice 1); file FW-0067 throughput consumer

Mirrors the FW-0065 close-out shape (stub-in-place pointing to ## Closed,
substantive entry in ## Closed with Progress/Done/Release-gaps bullets).
FW-0067 names EXT-29 as its block; the throughput strip is its only
remaining piece for the J-021 'realistic time estimates from actual
recent throughput' claim."
```

---

### Task 12: ADR-0011 cross-link

**Files:**
- Modify: `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md`

- [x] **Step 1: Append the FW-0039 implementation plan to §Related Decisions**

Under the existing "Implementation plan:" bullet, add one more bullet:

```markdown
- Implementation plan: [`thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md`](../plans/2026-05-23-fw-0039-post-submit-status-surface.md) — worked example of the `status` capability key driving an optional non-form surface (FW-0039 slice 1)
```

- [x] **Step 2: Commit**

```bash
git -C formspec-web commit \
  thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md \
  -m "docs(adr-0011): cross-link to FW-0039 slice 1 plan as a non-form surface worked example"
```

---

### Task 13: Full-suite verification

**Files:** none.

- [x] **Step 1: Run the full CI catch-all**

```bash
cd formspec-web
npm run ci
```

Expected: all green.

- [x] **Step 2: Spot-check the new test suites ran**

```bash
npx vitest run tests/app/status-route.test.ts tests/app/status-runtime.test.tsx tests/app/app-routing.test.tsx tests/adapters/stub-submit-transport.test.ts
```

Each must report explicit non-zero passing-test counts.

- [x] **Step 3: Re-run the architecture review on the diff**

Dispatch `formspec-specs:semi-formal-architecture-review` against the final diff. Address any BLOCKER findings. LOW / MEDIUM ship as follow-up rows or get fixed inline at the implementer's discretion.

- [x] **Step 4: Commit any review fix-ups, then prepare the parent submodule pointer bump**

```bash
cd ../
git status                          # confirm formspec-web is the only bumped submodule
git add formspec-web
git commit -m "chore(formspec-web): bump submodule for FW-0039 slice 1 (post-submit status surface)"
```

---

## Self-review

**Spec coverage** (each design claim → task):

| Design claim | Task |
|---|---|
| Standalone `/status?case={urn}` route | Tasks 1, 4 |
| Accountless access via URN-as-token | Tasks 4, 8 (doc) |
| Confirmation panel hands respondent the tracking link | Task 3 |
| StatusReader port reuse, no new port | Tasks 2, 6 |
| Optional surface — no required form-policy synthesis (arch-review F-4) | Task 6 (gate logic + tests 9 & 10) |
| Identity boot bypassed (arch-review F-9) | Task 6 (no `bootIdentity`; tested at #no identity authenticate) |
| Honest per-case timing (arch-review F-6) | Task 6 (timing strip + no-aggregate copy fixture-pinned) |
| URN rate-limiting is the adapter's job (arch-review F-1) | Task 8 (port doc) |
| No router dependency / no soft-nav (arch-review F-3) | Task 4 + design §Non-goals |
| `SubmitConfirmation.caseUrn` optional (arch-review F-7) | Task 2 |
| Status-reader port doc was a pre-existing gap (arch-review F-2) | Task 8 |
| `tests/e2e/placeholder-a11y.spec.ts` not renamed (arch-review F-5) | Task 7 |
| EXT-29 ↔ FW-0067 cross-link (arch-review F-8, F-10) | Tasks 10, 11 |
| Vocabulary firewall — `labelFromToken` over WOS enums | Task 6 |
| ADR-0010 status vocabulary stays WOS-owned | Tasks 2, 5, 6 |
| FW-0065 M-3 plumbing reused on non-form surface | Task 6 |

**Placeholder scan:** No "TBD", no "implement later", no "add appropriate error handling." Every test step shows the test body. Every commit step shows the message. Some shared helpers (e.g., `formatDuration`) are described shape-only — implementation surface is small enough that the executing agent can write it from the shape; explicit code shown for the load-bearing pieces (route parser, route selection, run-time-feature gate logic).

**Type consistency check:**
- `WosResourceUrn` (existing) used in `StatusRouteParams`, `SubmitConfirmation.caseUrn`, `buildConfirmationTrackingUri`.
- `StatusRouteParams` defined Task 1, consumed Task 4 + Task 6.
- `Composition.statusReader` (existing) consumed Task 6.
- `ResolvedRuntimeProfile` (existing) consumed Task 6.
- `DisabledCause` (existing) used in Task 6's disabled-branch dispatch — `org-forbidden | form-forbidden | optional-no-instance | not-requested` all routed to the appropriate "Status not shared" copy.
- `ApplicantStatusResource` union (existing) — Task 6 discriminates over it; ApplicantCaseDetail is the primary render branch, others render a reduced surface.

No drift.

---

## Execution Handoff

**Plan complete and saved to `formspec-web/thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md`.**

Inline execution proceeds per TDD red/green/refactor with arch-review or code-review skill applied after every 3–5 commits per CLAUDE.md §Review discipline.

---

## Deviations

Tracked during the 2026-05-23 inline execution. Each row records an intentional divergence from the plan body and the justification.

### Closed inline (review remediation)

- **Code-review F-1: `parseStatusRoute` accepted bare `urn:wos:` prefix.** `startsWith(prefix)` returns true for the prefix itself; a production status adapter receiving an empty URN tail would cascade-fail. Tightened to require `length > prefix.length` and added a regression test. Commit `0b16a27`.

- **Arch-review F-4 design revision + Task 6 implementation.** Original design said `StatusRuntime` passes `form: { features: {} }` to the resolver — meaning the `status` feature would fall through to `not-requested` and the page would render "Status not shared" even on a fully-supported deployment. Revised in the design + implemented in `StatusRuntime.tsx:55-62`: synthesize `form: { features: { status: 'optional' } }` because the user IS opting in by visiting `/status`. Stays OPTIONAL, never required — preserves the F-4 honesty (no synthetic required-policy, no form-load error boundary semantics on the route). Documented in the design + `docs/policy/runtime-feature-resolution.md` worked example.

- **Arch-review F-1 design revision.** Original design treated URN entropy as "high enough" without naming the adapter's load-bearing rate-limit responsibility. Added explicit naming in the design §Accountless access + a load-bearing section in `docs/ports/status-reader.md`. The page returns uniform "not found" for every unknown URN so it is not an enumeration oracle.

- **Arch-review F-6 design revision + Task 6 implementation.** Original design's "Your application's timing so far" subtly implied progress-toward-typical. Reshaped to "Time since each step on your application" + made the "Timing for similar applications is not yet available on this site." copy **prominent** (not a footnote). Both literal copy strings exported as constants from `StatusRuntime.tsx` and pinned in `tests/app/status-runtime.test.tsx#StatusRuntime copy constants` per code-review F-3.

- **Arch-review F-9 design revision.** Original design implicitly said StatusRuntime would skip identity boot; revised to make it explicit. Pinned via `tests/app/status-runtime.test.tsx#identity discipline` (spies on `authenticate` + `discover`, asserts zero calls).

- **Arch-review F-7 acknowledgment.** Plan + design call out `SubmitConfirmation.caseUrn` as optional; HTTP transport stays unchanged; `tests/adapters/stub-submit-transport.test.ts` pins the new field; HTTP-transport tests do not touch caseUrn.

- **Code-review F-2 remediation.** PolicyErrorPage branch was untested. Added `tests/app/status-runtime.test.tsx#StatusRuntime policy-error path` injecting an invalid org-policy mode so `InvalidRuntimePolicyError` fires; pins the "not configured correctly" copy + the typed code as the support reference. Commit `885324c`.

- **Code-review F-3 remediation.** Promoted `NO_AGGREGATE_COPY` + `PER_CASE_HEADER` to exported constants and added a literal-pin test (`StatusRuntime copy constants`). Future copy edits trip the literal pin BEFORE the component-render test. Commit `885324c`.

- **Code-review F-4 remediation.** `stageFromEvent(event)` collapsed `lifecycle-changed` to `'in-review'` regardless of `newLifecycleState`. Mislabelling a completed case is exactly the kind of dishonest UI FW-0039 is meant to prevent. Reshaped to `stageFromEntry(entry)` — branches on `newLifecycleState` for `lifecycle-changed`, so `completed`/`terminated` correctly lights the Closed cell. Also reclassified `correspondence-received` from `'received'` to `'in-review'` per the WOS semantic read. Three new test cases pin the corrected mapping. Commit `885324c`.

- **Final arch-review F-1 acknowledgment.** Added a "Non-form-surface caveat" sub-bullet to FW-0066 (`PLANNING.md`) so the FormRuntimePolicyExtractor port promotion picks up the second-shape decision when triggered. The slice-1 literal synthesis at the route boundary is acceptable today because there's no port yet to bypass.

### Closed inline (a11y / sandbox-mode fixups)

- **Axe failure: `<aside>` nested inside `<section>` landmark.** Reshaped `AiDisclosure` to use `<div>` with `aria-labelledby` retained. The `<aside>` complementary landmark inside the region landmark was rejected by axe. Commit `1fd2559`.

- **Axe failure: stage-strip + status-subtitle contrast.** Non-current cells + subtitle used `--formspec-color-text-muted` which clocked 4.46 contrast on the surface-2 background (WCAG AA requires 4.5). Switched to the full `--formspec-color-text` token; current-cell accent still differentiates visually. Commit `1fd2559`.

- **Demo composition shape upgrade.** Stub composition originally registered `demoApplicantStatusResource()` (single timeline entry) for `urn:wos:case_demo_0001`; that wouldn't drive the full `StatusRuntime` render. Added `demoApplicantCaseDetail()` to `src/demo/respondent-place.ts` and switched the stub registration. The old single-entry helper stayed in place (no consumer today). Commit `3265de6`.

### Process notes

- Review-in-loop applied per stack `CLAUDE.md` §Review discipline. The harness in this session does NOT expose a `Task` tool for dispatching parallel subagents, so reviews were run via the `formspec-specs:semi-formal-architecture-review` and `formspec-specs:semi-formal-code-review` skills inline.
- Two reviews dispatched: (1) on the design doc before any implementation — caught F-1/F-3/F-4/F-5/F-6/F-7/F-8/F-9/F-10, addressed F-1/F-4/F-6/F-9 inline and acknowledged the rest in plan/design before writing code. (2) Code review after 4 commits (Tasks 1-4) — caught F-1 (bare-prefix URN bug), remediated before Task 5.
- Two more reviews: (3) Code review after 5 more commits (Tasks 5-10) — caught F-1/F-2/F-3/F-4, remediated F-2/F-3/F-4 inline; F-1 (App.tsx dangling label) deferred to the next runtime addition. (4) Final architecture review on the complete slice — APPROVE verdict; only OBSERVATION-class findings; one was actioned (FW-0066 second-order obligation noted).
- Submodule discipline preserved: every commit confined to formspec-web; parent stack-root pointer bump staged separately per the owner's instructions, not pushed.
- Honesty-over-completion preserved: the "actual recent throughput" half is openly named as deferred in the design, plan, port doc, runtime-feature-resolution doc, and PLANNING close-out; the "no aggregate" copy is fixture-pinned to prevent dishonest edits.

## Plan complete
