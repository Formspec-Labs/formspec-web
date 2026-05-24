import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Boot-narrowing tests for FW-0068.
 *
 * Closes FW-0039 H-1 — the slice-1 closeout independent architecture review
 * named the missing assertion: "the /status route does NOT invoke the
 * unrelated adapter constructors." These tests provide it.
 *
 * Strategy: `vi.mock` interposes the HTTP / anonymous-session module
 * constructors at module-load time (per inline arch-review Finding 4 —
 * `vi.spyOn` on ESM named exports is brittle). The mock factories make the
 * constructors track their invocations as `vi.fn` and throw if called from
 * the status-route boot path, so unintended construction is loud.
 *
 * The differential coverage — the full-app factory still constructs them —
 * proves the test is not a tautology.
 */

// `vi.hoisted` lets the mock factories close over the spies despite hoisting.
// Each adapter is invoked with `new`, so the spies are class constructors —
// `vi.fn()` works as a class only when called with `new`, but spy tracking
// records the call either way. The mock-class shape gives us back an object
// with the minimal methods the rest of the composition root reaches for.
const spies = vi.hoisted(() => ({
  httpDef: vi.fn(function () {
    return { __mockHttpDefinitionSource: true };
  }),
  httpDraft: vi.fn(function () {
    return {
      __mockHttpDraftStore: true,
      draftIdFor: () => undefined,
    };
  }),
  httpSubmit: vi.fn(function () {
    return { __mockHttpSubmitTransport: true };
  }),
  anonSession: vi.fn(function () {
    return {
      __mockAnonymousSessionBridge: true,
      tokenForDraftKey: () => undefined,
      tokenForHandoff: () => undefined,
    };
  }),
  httpAnonProvider: vi.fn(function () {
    return { __mockHttpAnonymousIdentityProvider: true };
  }),
  oidcAdapter: vi.fn(function () {
    return {
      __mockOidcAdapter: true,
      currentAccessToken: () => undefined,
    };
  }),
  magicLinkAdapter: vi.fn(function () {
    return { __mockMagicLinkAdapter: true };
  }),
  anonymousAdapter: vi.fn(function () {
    return { __mockAnonymousAdapter: true };
  }),
}));

vi.mock('../../src/adapters/http/definition-source.ts', () => ({
  HttpDefinitionSource: spies.httpDef,
}));
vi.mock('../../src/adapters/http/draft-store.ts', () => ({
  HttpDraftStore: spies.httpDraft,
}));
vi.mock('../../src/adapters/http/submit-transport.ts', () => ({
  HttpSubmitTransport: spies.httpSubmit,
}));
vi.mock('../../src/adapters/http/anonymous-session.ts', () => ({
  AnonymousSessionBridge: spies.anonSession,
  HttpAnonymousIdentityProvider: spies.httpAnonProvider,
}));
vi.mock('../../src/adapters/identity/oidc.ts', () => ({
  OidcAdapter: spies.oidcAdapter,
}));
vi.mock('../../src/adapters/identity/magic-link.ts', () => ({
  MagicLinkAdapter: spies.magicLinkAdapter,
}));
vi.mock('../../src/adapters/identity/anonymous.ts', () => ({
  AnonymousAdapter: spies.anonymousAdapter,
}));

import { createDefaultComposition } from '../../src/composition/default.ts';
import { createRouteNarrowedComposition } from '../../src/composition/route-narrowing.ts';
import { DOCUMENTS_ROUTE_NARROWING } from '../../src/app/documents-route.ts';
import { OBLIGATIONS_ROUTE_NARROWING } from '../../src/app/obligations-route.ts';
import { STATUS_ROUTE_NARROWING } from '../../src/app/status-route.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import type { FormspecWebConfig, PortCompositionConfig } from '../../src/config/types.ts';
import { chooseComposition } from '../../src/app/main-helpers.ts';

function productionConfig(): FormspecWebConfig {
  return {
    ...departmentAppProfile,
    ports: referenceHttpDataPorts(departmentAppProfile.ports),
    referenceAdapters: {
      formspecStack: {
        ...departmentAppProfile.referenceAdapters?.formspecStack,
        tenantHeaderDialect: 'formspec',
        formspecServerUrl: 'https://formspec-server.example.test',
      },
    },
  };
}

function referenceHttpDataPorts(ports: PortCompositionConfig): PortCompositionConfig {
  return {
    ...ports,
    definitionSource: 'reference-http',
    draftStore: 'reference-http',
    submitTransport: 'reference-http',
  };
}

describe('status-route composition boot narrowing (FW-0068, closes FW-0039 H-1)', () => {
  beforeEach(() => {
    spies.httpDef.mockClear();
    spies.httpDraft.mockClear();
    spies.httpSubmit.mockClear();
    spies.anonSession.mockClear();
    spies.httpAnonProvider.mockClear();
    spies.oidcAdapter.mockClear();
    spies.magicLinkAdapter.mockClear();
    spies.anonymousAdapter.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('status-route narrowed composition does NOT invoke HTTP adapter constructors in production mode (FW-0068 via FW-0070)', () => {
    createRouteNarrowedComposition({
      mode: 'default',
      config: productionConfig(),
      route: STATUS_ROUTE_NARROWING,
    });

    expect(spies.httpDef).not.toHaveBeenCalled();
    expect(spies.httpDraft).not.toHaveBeenCalled();
    expect(spies.httpSubmit).not.toHaveBeenCalled();
    expect(spies.anonSession).not.toHaveBeenCalled();
    expect(spies.httpAnonProvider).not.toHaveBeenCalled();
  });

  it('createDefaultComposition (full-app) DOES invoke the HTTP constructors when configured (differential)', () => {
    createDefaultComposition(productionConfig());

    expect(spies.httpDef).toHaveBeenCalled();
    expect(spies.httpDraft).toHaveBeenCalled();
    expect(spies.httpSubmit).toHaveBeenCalled();
    expect(spies.anonSession).toHaveBeenCalled();
  });

  it('chooseComposition picks the status-route factory when the URL matches /status?case=urn:wos:...', async () => {
    const composition = chooseComposition({
      href: 'http://localhost/status?case=urn:wos:case_demo_0001',
      config: productionConfig(),
    });
    // The status-route factory wires noop adapters that throw with FW-0068
    // cite; verify by calling one. Awaited so the assertion is not racy.
    await expect(composition.definitionSource.getDefinition('https://x')).rejects.toThrow(/FW-0068/);
    expect(spies.httpDef).not.toHaveBeenCalled();
  });

  it('chooseComposition picks the full-app factory when the URL is /', () => {
    chooseComposition({
      href: 'http://localhost/',
      config: productionConfig(),
    });
    // The full-app factory in production mode constructs the HTTP adapters.
    expect(spies.httpDef).toHaveBeenCalled();
  });

  it('obligations-route narrowed composition does NOT construct the real identity adapter when respondentPlace is unavailable (MED-4 via FW-0070)', async () => {
    // Today's production posture hardcodes `respondentPlace: 'unavailable'`
    // (no production respondent-place adapter ships yet — FW-0068 design
    // §"Production gap"). The parameterized factory still needs to boot
    // honestly; constructing OidcAdapter (or any other identity adapter with
    // eager network/IndexedDB work) at boot would lie about the surface's
    // runtime cost. MED-4: short-circuit to noopIdentityProvider when the
    // gated respondent-place capability is unavailable.
    const c = createRouteNarrowedComposition({
      mode: 'default',
      config: productionConfig(),
      route: OBLIGATIONS_ROUTE_NARROWING,
    });
    expect(c.instanceCapabilities.respondentPlace).toBe('unavailable');
    expect(spies.oidcAdapter).not.toHaveBeenCalled();
    expect(spies.magicLinkAdapter).not.toHaveBeenCalled();
    expect(spies.anonymousAdapter).not.toHaveBeenCalled();
    expect(spies.httpAnonProvider).not.toHaveBeenCalled();
    expect(spies.anonSession).not.toHaveBeenCalled();
    // Identity provider on this narrowed surface is the noop adapter — calling
    // it throws with the FW-0068 cite, same as the other narrowed ports.
    await expect(c.identityProvider.discover()).rejects.toThrow(/FW-0068/);
  });

  it('createDefaultComposition (full-app) DOES construct the OIDC identity adapter when configured (differential)', () => {
    createDefaultComposition(productionConfig());
    // Full-app composition wires the real OidcAdapter — proves the obligations-
    // route factory's narrowing is a deliberate short-circuit, not a
    // tautology of the test setup.
    expect(spies.oidcAdapter).toHaveBeenCalled();
  });

  it('chooseComposition picks the obligations-route factory when the URL is /obligations (FW-0055)', async () => {
    const composition = chooseComposition({
      href: 'http://localhost/obligations',
      config: productionConfig(),
    });
    // The obligations-route factory does NOT construct HTTP definition / draft
    // / submit adapters — those ports are noop because the surface never
    // reads them.
    await expect(composition.definitionSource.getDefinition('https://x')).rejects.toThrow(/FW-0068/);
    expect(spies.httpDef).not.toHaveBeenCalled();
    expect(spies.httpDraft).not.toHaveBeenCalled();
    expect(spies.httpSubmit).not.toHaveBeenCalled();
    // Per MED-4: identity is now gated on the respondent-place capability
    // being available. Today the production obligations-route factory always
    // declares `respondentPlace: 'unavailable'`, so neither the
    // AnonymousSessionBridge nor any real identity adapter is constructed.
    // The identity port is the noop sentinel — the dashboard renders the
    // "not shared" copy and never reads it.
    expect(spies.anonSession).not.toHaveBeenCalled();
    expect(spies.oidcAdapter).not.toHaveBeenCalled();
  });

  it('documents-route narrowed composition does NOT construct HTTP / identity adapters when respondentPlace is unavailable (FW-0056 via FW-0070)', async () => {
    // Same MED-4 gating as the obligations-route descriptor: the documents
    // dashboard is identity-bound, but identity is wired only when the
    // gated respondent-place capability is available. Production today
    // always declares unavailable, so the noop branch fires.
    const c = createRouteNarrowedComposition({
      mode: 'default',
      config: productionConfig(),
      route: DOCUMENTS_ROUTE_NARROWING,
    });
    expect(c.instanceCapabilities.respondentPlace).toBe('unavailable');
    expect(c.instanceCapabilities.documentPresentation).toBe('unavailable');
    expect(spies.httpDef).not.toHaveBeenCalled();
    expect(spies.httpDraft).not.toHaveBeenCalled();
    expect(spies.httpSubmit).not.toHaveBeenCalled();
    expect(spies.oidcAdapter).not.toHaveBeenCalled();
    expect(spies.magicLinkAdapter).not.toHaveBeenCalled();
    expect(spies.anonymousAdapter).not.toHaveBeenCalled();
    expect(spies.httpAnonProvider).not.toHaveBeenCalled();
    expect(spies.anonSession).not.toHaveBeenCalled();
    await expect(c.identityProvider.discover()).rejects.toThrow(/FW-0068/);
  });

  it('chooseComposition picks the documents-route factory when the URL is /documents (FW-0056)', async () => {
    const composition = chooseComposition({
      href: 'http://localhost/documents',
      config: productionConfig(),
    });
    await expect(composition.definitionSource.getDefinition('https://x')).rejects.toThrow(/FW-0068/);
    expect(spies.httpDef).not.toHaveBeenCalled();
    expect(spies.httpDraft).not.toHaveBeenCalled();
    expect(spies.httpSubmit).not.toHaveBeenCalled();
    expect(spies.anonSession).not.toHaveBeenCalled();
    expect(spies.oidcAdapter).not.toHaveBeenCalled();
  });
});
