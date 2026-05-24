# FW-0068 — Route-aware composition narrowing (implementation plan)

> **For agentic workers:** This plan is small enough for a single-session execution by an implementer. Steps use checkbox (`- [ ]`) syntax for tracking. TDD throughout — red, green, refactor.

**Goal:** Close FW-0039 closeout independent architecture review H-1 — make `src/app/main.tsx` route-aware so the `/status` route constructs ONLY the composition slots the `StatusRuntime` consumer reads. Land the design in [`thoughts/specs/2026-05-23-fw-0068-route-aware-composition-narrowing-design.md`](../specs/2026-05-23-fw-0068-route-aware-composition-narrowing-design.md).

**Architecture:** Sibling factories `createDefaultStatusRouteComposition` / `createStubStatusRouteComposition` / `createDemoStatusRouteComposition` return the same `Composition` type with non-status MVP-port slots filled by a new `noop-for-status-route` adapter family that throws on call. The two seeded gated keys (`status`, `respondentPlace`) keep their existing `unavailable*` / `stub*` sentinels with coherent `instanceCapabilities` declarations. `main.tsx` parses the route once at boot via the existing pure `parseStatusRoute` and dispatches to the matching factory.

**Tech Stack:** TypeScript 5 strict, React 19, Vitest. No new runtime dependencies.

---

## File structure

**New files:**

- `src/adapters/noop-for-status-route/definition-source.ts`
- `src/adapters/noop-for-status-route/draft-store.ts`
- `src/adapters/noop-for-status-route/submit-transport.ts`
- `src/adapters/noop-for-status-route/identity-provider.ts`
- `src/adapters/noop-for-status-route/index.ts` (barrel)
- `tests/adapters/noop-for-status-route.test.ts`
- `tests/app/status-boot-narrowing.test.ts`

**Modified files:**

- `src/composition/default.ts` — add `createDefaultStatusRouteComposition`
- `src/composition/stub.ts` — add `createStubStatusRouteComposition`
- `src/composition/demo.ts` — add `createDemoStatusRouteComposition` (delegate to stub variant)
- `src/composition/index.ts` — re-export new factories
- `src/app/main.tsx` — parse route → pick factory
- `tests/profiles/composition-coherence.test.ts` — extend to cover new factories
- `tests/smoke/composition.test.ts` — extend smoke coverage to new factories
- `PLANNING.md` — move FW-0068 to ## Closed; update FW-0039 closed row prose

---

### Task 1: Noop-for-status-route adapter family

**Files:**
- Create: `src/adapters/noop-for-status-route/{definition-source,draft-store,submit-transport,identity-provider}.ts`
- Create: `src/adapters/noop-for-status-route/index.ts`
- Test: `tests/adapters/noop-for-status-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/noop-for-status-route.test.ts
import { describe, expect, it } from 'vitest';
import {
  noopDefinitionSource,
  noopDraftStore,
  noopIdentityProvider,
  noopSubmitTransport,
} from '../../src/adapters/noop-for-status-route/index.ts';

describe('noop-for-status-route adapters throw with FW-0068 cite on any call', () => {
  it('noopDefinitionSource.getDefinition throws', async () => {
    await expect(noopDefinitionSource().getDefinition('https://x')).rejects.toThrow(/FW-0068/);
  });

  it('noopDraftStore.save throws', async () => {
    await expect(
      noopDraftStore().save(
        { formUrl: 'https://x', subjectRef: 's' },
        { definitionUrl: 'https://x', definitionVersion: undefined, data: {}, metadata: undefined } as never,
      ),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopDraftStore.load throws', async () => {
    await expect(noopDraftStore().load({ formUrl: 'https://x', subjectRef: 's' })).rejects.toThrow(/FW-0068/);
  });

  it('noopSubmitTransport.submit throws', async () => {
    await expect(
      noopSubmitTransport().submit({} as never, 'idempotency-key'),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopIdentityProvider.discover throws', async () => {
    await expect(noopIdentityProvider().discover()).rejects.toThrow(/FW-0068/);
  });

  it('noopIdentityProvider.authenticate throws', async () => {
    await expect(noopIdentityProvider().authenticate({} as never)).rejects.toThrow(/FW-0068/);
  });

  it('noopIdentityProvider.subscribe delivers null then is inert (no callbacks)', () => {
    const received: Array<unknown> = [];
    const unsub = noopIdentityProvider().subscribe((c) => received.push(c));
    expect(received).toEqual([null]);
    unsub();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/adapters/noop-for-status-route.test.ts`

- [ ] **Step 3: Implement the adapters**

Each file follows the same shape: an adapter implementing the port interface where every async method throws `notForStatusRouteError(portName)`. `IdentityProvider.subscribe` synchronously delivers `null` once (matching the contract that the initial value is delivered to subscribers — see existing `stubIdentityProvider`) and returns an inert unsubscribe.

```ts
// src/adapters/noop-for-status-route/_error.ts (internal helper, optional inline)
export function notForStatusRouteError(portName: string): Error {
  return new Error(
    `${portName} is not constructed on the /status route (FW-0068 route-aware composition narrowing). ` +
    `If you see this, a consumer outside StatusRuntime is reading the composition on the /status route.`,
  );
}
```

Concrete adapter files mirror the existing `stub*` shapes 1:1 — just throw instead of returning data.

- [ ] **Step 4: Wire the barrel** at `src/adapters/noop-for-status-route/index.ts` exporting all four factories.

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Commit**

```bash
git -C formspec-web commit src/adapters/noop-for-status-route tests/adapters/noop-for-status-route.test.ts -m "feat(adapters): noop-for-status-route adapter family (FW-0068)

Inert adapters for the four MVP ports that StatusRuntime never reads.
Each throws a clear FW-0068 cite if a future consumer mistakenly invokes
them on the /status route — fail-fast rather than silently boot HTTP /
OIDC machinery the route does not need."
```

---

### Task 2: createDefaultStatusRouteComposition

**Files:**
- Modify: `src/composition/default.ts` (add factory)
- Modify: `src/composition/index.ts` (re-export)
- Test: extend `tests/smoke/composition.test.ts`

- [ ] **Step 1: Write the failing test** — add to `tests/smoke/composition.test.ts`:

```ts
it('createDefaultStatusRouteComposition wires statusReader + policy slots; non-status MVP ports throw on call', async () => {
  const c = createDefaultStatusRouteComposition();
  expect(c.mode).toBe('demo'); // no formspecServerUrl → demo fallback, matching createDefaultComposition
  expect(c.statusReader).toBeDefined();
  expect(c.respondentPlaceSource).toBeDefined();
  expect(c.instanceCapabilities.status).toBeDefined();
  expect(c.orgRuntimePolicy.features).toBeDefined();
  await expect(c.definitionSource.getDefinition('https://x')).rejects.toThrow(/FW-0068/);
  await expect(c.draftStore.load({ formUrl: 'https://x', subjectRef: 's' })).rejects.toThrow(/FW-0068/);
  await expect(c.submitTransport.submit({} as never, 'k')).rejects.toThrow(/FW-0068/);
  await expect(c.identityProvider.discover()).rejects.toThrow(/FW-0068/);
});

it('createDefaultStatusRouteComposition in production mode keeps unavailable sentinel for status', () => {
  const c = createDefaultStatusRouteComposition({
    ...departmentAppProfile,
    ports: referenceHttpDataPorts(departmentAppProfile.ports),
    referenceAdapters: {
      formspecStack: {
        ...departmentAppProfile.referenceAdapters?.formspecStack,
        tenantHeaderDialect: 'formspec',
        formspecServerUrl: 'https://formspec-server.example.test',
      },
    },
  });
  expect(c.mode).toBe('production');
  expect(c.instanceCapabilities.status).toBe('unavailable');
  expect(c.instanceCapabilities.respondentPlace).toBe('unavailable');
});
```

- [ ] **Step 2: Implement `createDefaultStatusRouteComposition` in `src/composition/default.ts`**

Pattern:

```ts
export function createDefaultStatusRouteComposition(
  config: FormspecWebConfig = departmentAppProfile,
): Composition {
  const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
  if (!serverUrl) {
    return createDemoStatusRouteComposition();
  }
  // Production mode: status reader is still the production-unavailable sentinel
  // until a real ProxiedApplicantStatusAdapter is wired (FW-0039 release gap b).
  // The non-status MVP ports are noops because the /status route never reads them.
  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl: 'about:not-constructed#fw-0068',
    definitionSource: noopDefinitionSource(),
    draftStore: noopDraftStore(),
    submitTransport: noopSubmitTransport(),
    identityProvider: noopIdentityProvider(),
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
    },
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    },
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
}
```

The `notificationDelivery` slot is optional in the `Composition` type — leave it unset.

- [ ] **Step 3: Wire the barrel** at `src/composition/index.ts`:

```ts
export { createDefaultComposition, createDefaultStatusRouteComposition } from './default.ts';
export { createDemoComposition, createDemoStatusRouteComposition } from './demo.ts';
export { createStubComposition, createStubStatusRouteComposition } from './stub.ts';
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git -C formspec-web commit src/composition/default.ts src/composition/index.ts tests/smoke/composition.test.ts -m "feat(composition): createDefaultStatusRouteComposition (FW-0068)

Production composition for the /status route — wires statusReader +
policy slots, noops every MVP port that StatusRuntime never reads.
Coherence assertion still applies."
```

---

### Task 3: createStubStatusRouteComposition + createDemoStatusRouteComposition

**Files:**
- Modify: `src/composition/stub.ts`
- Modify: `src/composition/demo.ts`
- Test: extend `tests/smoke/composition.test.ts`

- [ ] **Step 1: Write the failing test** — add to `tests/smoke/composition.test.ts`:

```ts
it('createStubStatusRouteComposition delivers a status-reader the StatusRuntime tests use', async () => {
  const c = createStubStatusRouteComposition();
  expect(c.mode).toBe('demo');
  expect(c.instanceCapabilities.status).toBe('demo-stub');
  expect(c.instanceCapabilities.respondentPlace).toBe('demo-stub');
  // The seeded demo URN resolves through the stub status reader.
  await expect(c.statusReader.readStatus({ resourceRef: 'urn:wos:case_demo_0001' }))
    .resolves.toBeDefined();
  // MVP-port slots are noops.
  await expect(c.definitionSource.getDefinition('https://x')).rejects.toThrow(/FW-0068/);
});

it('createDemoStatusRouteComposition delegates to the stub status-route variant', () => {
  const c = createDemoStatusRouteComposition();
  expect(c.mode).toBe('demo');
  expect(c.instanceCapabilities.status).toBe('demo-stub');
});
```

- [ ] **Step 2: Implement `createStubStatusRouteComposition` in `src/composition/stub.ts`**

Reuses the same stub statusReader seed the full stub composition uses (the `urn:wos:case_demo_0001 → demoApplicantCaseDetail()` pairing). Per design Finding 1 inline reshape: declares `respondentPlace: 'demo-stub'` and wires `stubRespondentPlaceSource()` so the demo's `instanceCapabilities` continues to describe what the deployment can do, not what the slot wires. The narrowing on the status-route surface is the noop MVP ports; the gated keys keep their existing demo declarations.

- [ ] **Step 3: Implement `createDemoStatusRouteComposition` in `src/composition/demo.ts`** as `createStubStatusRouteComposition()` delegation.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git -C formspec-web commit src/composition/stub.ts src/composition/demo.ts tests/smoke/composition.test.ts -m "feat(composition): createStub/DemoStatusRouteComposition (FW-0068)

Demo + stub status-route compositions mirror the full-app stub family.
respondentPlace narrows to unavailable on the status surface — the
coherence assertion polices the declaration↔provenance pairing."
```

---

### Task 4: Composition coherence assertion covers the new factories

**Files:**
- Modify: `tests/profiles/composition-coherence.test.ts`

- [ ] **Step 1: Extend the existing test** to add:

```ts
it('default status-route composition is coherent', () => {
  expect(() => assertCompositionCoherence(createDefaultStatusRouteComposition())).not.toThrow();
});

it('stub status-route composition is coherent', () => {
  expect(() => assertCompositionCoherence(createStubStatusRouteComposition())).not.toThrow();
});

it('demo status-route composition is coherent', () => {
  expect(() => assertCompositionCoherence(createDemoStatusRouteComposition())).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it passes** — the factories already call `freezeComposition` so the assertion runs at construction; these tests are a belt-and-braces guard against future drift.

- [ ] **Step 3: Commit**

```bash
git -C formspec-web commit tests/profiles/composition-coherence.test.ts -m "test(composition-coherence): cover three new status-route factories (FW-0068)"
```

---

### Task 5: Boot-narrowing test — the H-1 missing assertion

**Files:**
- Create: `tests/app/status-boot-narrowing.test.ts`

This is the load-bearing assertion FW-0039 was missing. It proves the /status route does NOT invoke the unrelated HTTP / identity adapter constructors.

- [ ] **Step 1: Write the failing test** (will pass once the route-aware boot logic in Task 6 lands):

```ts
// tests/app/status-boot-narrowing.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('status-route composition boot narrowing (FW-0068, closes FW-0039 H-1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createDefaultStatusRouteComposition in production mode does NOT invoke HTTP adapter constructors', async () => {
    // The test imports the HTTP adapter modules and spies on their constructors.
    // The status-route factory must not touch any of them.
    const httpDefinition = await import('../../src/adapters/http/definition-source.ts');
    const httpDraft = await import('../../src/adapters/http/draft-store.ts');
    const httpSubmit = await import('../../src/adapters/http/submit-transport.ts');
    const anonSession = await import('../../src/adapters/http/anonymous-session.ts');

    const defSpy = vi.spyOn(httpDefinition, 'HttpDefinitionSource');
    const draftSpy = vi.spyOn(httpDraft, 'HttpDraftStore');
    const submitSpy = vi.spyOn(httpSubmit, 'HttpSubmitTransport');
    const sessionSpy = vi.spyOn(anonSession, 'AnonymousSessionBridge');

    const { createDefaultStatusRouteComposition } = await import('../../src/composition/default.ts');
    const { departmentAppProfile } = await import('../../src/profiles/profiles.ts');
    createDefaultStatusRouteComposition({
      ...departmentAppProfile,
      ports: {
        ...departmentAppProfile.ports,
        definitionSource: 'reference-http',
        draftStore: 'reference-http',
        submitTransport: 'reference-http',
      },
      referenceAdapters: {
        formspecStack: {
          ...departmentAppProfile.referenceAdapters?.formspecStack,
          tenantHeaderDialect: 'formspec',
          formspecServerUrl: 'https://formspec-server.example.test',
        },
      },
    });

    expect(defSpy).not.toHaveBeenCalled();
    expect(draftSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('createDefaultComposition (full-app) DOES invoke the HTTP constructors when configured', async () => {
    const httpDefinition = await import('../../src/adapters/http/definition-source.ts');
    const defSpy = vi.spyOn(httpDefinition, 'HttpDefinitionSource');
    const { createDefaultComposition } = await import('../../src/composition/default.ts');
    const { departmentAppProfile } = await import('../../src/profiles/profiles.ts');
    createDefaultComposition({
      ...departmentAppProfile,
      ports: {
        ...departmentAppProfile.ports,
        definitionSource: 'reference-http',
        draftStore: 'reference-http',
        submitTransport: 'reference-http',
      },
      referenceAdapters: {
        formspecStack: {
          ...departmentAppProfile.referenceAdapters?.formspecStack,
          tenantHeaderDialect: 'formspec',
          formspecServerUrl: 'https://formspec-server.example.test',
        },
      },
    });
    expect(defSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test** — the first assertion proves the status-route factory does not invoke the HTTP constructors; the second is the differential proof that the full-app factory still does. Prefer `vi.mock(modulePath, factory)` to interpose the named-export constructors at module-load time (per Finding 4 from the inline arch review — `vi.spyOn` on ESM named exports is brittle). The mock factory replaces the constructor with a `vi.fn` that throws if called, surfacing any unintended construction loudly.

If `vi.mock` proves brittle in this project's Vitest/ESM config, the fallback is to stub `globalThis.fetch` and assert no fetch invocations land during composition construction:

```ts
it('createDefaultStatusRouteComposition production mode does not call fetch at construction', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  createDefaultStatusRouteComposition({ /* production config */ });
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

That assertion is weaker but defends the H-1 claim adequately (no HTTP boot-cost).

- [ ] **Step 3: Commit**

```bash
git -C formspec-web commit tests/app/status-boot-narrowing.test.ts -m "test(boot-narrowing): status route does not construct HTTP adapters (FW-0068, FW-0039 H-1)"
```

---

### Task 6: main.tsx — parse route, pick factory

**Files:**
- Modify: `src/app/main.tsx`

- [ ] **Step 1: Write the failing test** — the existing `tests/app/app-routing.test.tsx` already proves the route discovery works; the boot-narrowing test from Task 5 already proves the status-route factory doesn't construct HTTP adapters. The remaining gap is `main.tsx` itself wiring the dispatch. Because `main.tsx` is the boot entrypoint and is not directly unit-testable, the test surface is the *combination* of:

  - Task 5's boot-narrowing test (proves the factory does what it says).
  - The existing `app-routing.test.tsx` (proves App.tsx still routes correctly when given the right composition).
  - A new integration assertion in the boot-narrowing test file confirming `main.tsx` exports the dispatch helper as a named function (so a follow-on test can call it directly).

Pragmatically: extract the route-aware factory selection into a tiny named helper in `src/app/main.tsx` (or a sibling `src/app/boot.ts` if `main.tsx` should stay side-effect-only), then test the helper directly.

```ts
// New unit test in tests/app/status-boot-narrowing.test.ts
it('chooseComposition picks the status-route factory when the URL matches /status?case=urn:wos:...', () => {
  const composition = chooseComposition({
    href: 'http://localhost/status?case=urn:wos:case_demo_0001',
    config: departmentAppProfile,
  });
  expect(composition.instanceCapabilities.respondentPlace).toBe('unavailable');
  // noop adapter signal — definition source throws on call
  expect(() => composition.definitionSource.getDefinition('https://x')).rejects.toThrow(/FW-0068/);
});

it('chooseComposition picks the full-app factory when the URL is /', () => {
  const composition = chooseComposition({
    href: 'http://localhost/',
    config: departmentAppProfile,
  });
  // demo mode without formspec server — should yield a real (stub) definition source
  // that does NOT throw the FW-0068 sentinel.
  expect(composition.definitionSource).toBeDefined();
});
```

- [ ] **Step 2: Implement the helper inside `main.tsx`**

Either inline the dispatch or extract to a tiny `chooseComposition({ href, config })` helper exported from `main.tsx` for unit testing. Recommended: extract.

```ts
// src/app/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import rootConfig from '../../formspec.config.ts';
import { createDefaultComposition, createDefaultStatusRouteComposition } from '../composition/default.ts';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { readRuntimeConfig, resolveActiveConfig } from '../config/runtime.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import '@formspec-org/layout/formspec-default.css';
import '../theme/upstream/adapters/tailwind-formspec-core.css';
import { App } from './App.tsx';
import './app.css';
import { CompositionProvider } from './CompositionProvider.tsx';
import { parseStatusRoute } from './status-route.ts';

export function chooseComposition({
  href,
  config,
}: {
  href: string;
  config: FormspecWebConfig;
}): Composition {
  const statusRoute = parseStatusRoute(href);
  return statusRoute
    ? createDefaultStatusRouteComposition(config)
    : createDefaultComposition(config);
}

const activeConfig = resolveActiveConfig(rootConfig, readRuntimeConfig());
const composition = chooseComposition({
  href: window.location.href,
  config: activeConfig,
});
// ...rest unchanged
```

- [ ] **Step 3: Run test** — `npx vitest run tests/app/status-boot-narrowing.test.ts`

- [ ] **Step 4: Run full unit suite** — `npm run test:unit`

- [ ] **Step 5: Commit**

```bash
git -C formspec-web commit src/app/main.tsx tests/app/status-boot-narrowing.test.ts -m "feat(boot): main.tsx parses route before composition (FW-0068)

chooseComposition dispatches to the route-aware factory. Closes the
FW-0039 H-1 gap — the /status route no longer boots HTTP / OIDC
machinery the StatusRuntime never reads."
```

---

### Task 7: PLANNING.md updates + FW-0039 closed-row prose

**Files:**
- Modify: `PLANNING.md`

- [ ] **Step 1: Move FW-0068 row to ## Closed** following the FW-0065 closed-row shape (sections: Phase / Status / Persona / Journey / What / Done / User-visible behavior change / Consumes ports / Closed / Note).

- [ ] **Step 2: Edit FW-0039's closed-row narrative** in the same file to:

  - Replace "is filed as FW-0068" with "closed by FW-0068" in the slice-1 prose where it appears.
  - Update the Release-gaps narrative to no longer name route-aware composition narrowing as an open gap.

- [ ] **Step 3: Verify `npm run check:testing-plan` + `npm run check:mvp-audit` green.**

- [ ] **Step 4: Commit**

```bash
git -C formspec-web commit PLANNING.md -m "docs(planning): close FW-0068; update FW-0039 closed-row prose

Route-aware composition narrowing shipped; the FW-0039 H-1 gap is closed."
```

---

### Task 8: Full CI + parent stack pointer

- [ ] **Step 1: Run `npm run ci` in formspec-web.** Iterate on any failures inline.

- [ ] **Step 2: Stage the stack pointer at the parent** (do NOT push):

```bash
git -C /Users/mikewolfd/Work/formspec-stack add formspec-web
git -C /Users/mikewolfd/Work/formspec-stack commit -m "chore(formspec-web): bump submodule for FW-0068 route-aware composition narrowing"
```

- [ ] **Step 3: Verify `git status` clean across both repos.**

---

## Process notes

- Inline architecture-review invocation via `formspec-specs:semi-formal-architecture-review` after the design lands (the Task tool is not exposed for subagent dispatch in this implementer's context).
- Inline code-review invocation via `formspec-specs:semi-formal-code-review` after Tasks 2–6 (or earlier if a 3-5-commit threshold trips).
- The main agent will dispatch an independent reviewer when the implementer returns.

## Deviations

(Track post-hoc as the implementation runs.)
