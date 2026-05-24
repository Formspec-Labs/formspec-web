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

import {
  createDefaultComposition,
  createDefaultStatusRouteComposition,
} from '../../src/composition/default.ts';
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createDefaultStatusRouteComposition does NOT invoke HTTP adapter constructors in production mode', () => {
    createDefaultStatusRouteComposition(productionConfig());

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

  it('chooseComposition picks the status-route factory when the URL matches /status?case=urn:wos:...', () => {
    const composition = chooseComposition({
      href: 'http://localhost/status?case=urn:wos:case_demo_0001',
      config: productionConfig(),
    });
    // The status-route factory wires noop adapters that throw with FW-0068
    // cite; verify by calling one.
    expect(composition.definitionSource.getDefinition('https://x')).rejects.toThrow(/FW-0068/);
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
});
