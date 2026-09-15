import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  kidOrThumbprint,
  semVer,
  uri,
} from '@integrity-stack/signature-port';
import {
  SURFACE_LOCALE_KEY_PREFIX,
  SURFACE_STRING_KEYS,
} from '@formspec-org/surface';
import type {
  SurfaceBundleSignedPayloadV1,
} from '@formspec-org/surface-bundle-signing';
import type { Composition } from '../../src/composition/types.ts';
import type {
  RespondentSurfaceBundleConfig,
} from '../../src/config/types.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import { createStubComposition } from '../../src/composition/stub.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import {
  loadSurfaceBundleSchemaValidators,
} from '../../src/adapters/schema/index.ts';
import {
  createSurfaceBundleSnapshot,
  type SurfaceBundleSnapshot,
  type SurfaceBundleSource,
} from '../../src/ports/surface-bundle-source.ts';
import type {
  SurfaceBundleReleasePrecondition,
  SurfaceBundleVerifiedResult,
  SurfaceBundleVerifier,
} from '../../src/ports/surface-bundle-verifier.ts';
import type {
  IdentityClaim,
  IdentityProvider,
  IdpOption,
} from '../../src/ports/identity-provider.ts';
import {
  admitSurfaceBundle,
} from '../../src/verifying-surface/admission.ts';
import {
  VerifiedRespondentSurface,
} from '../../src/verifying-surface/respondent/VerifiedRespondentSurface.tsx';
import {
  withRespondentPublicAppValidation,
} from '../../src/verifying-surface/respondent/public-app-validation.ts';
import {
  createMemoryRespondentReceiptSessionStore,
} from '../../src/verifying-surface/respondent/session-store.ts';

const APP = 'https://example.gov/apps/respondent';
const SURFACE = 'https://example.gov/surfaces/respondent';
const ACTIONS = 'https://example.gov/actions/respondent';
const DATA = 'https://example.gov/data/respondent';
const REGISTRY = 'https://example.gov/registries/respondent';
const LOCALE = 'https://example.gov/locales/respondent/en';
const THEME = 'https://example.gov/themes/respondent';
const RESOURCE = 'https://runtime.example.gov/respondent/receipt';
const MODULE = 'x-respondent';
const PUBLISHER = 'https://publisher.example.gov/';
const TENANT_COLOR = '#7A1F3D';
const CHECKED_AT = '2026-07-28T20:00:00.000Z';
const RESPONDENT_DEFINITION = definitionWithoutLegacyPresentation(demoSampleForm);

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('style');
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('verified respondent Surface integration', () => {
  it('passes the production schema, AppGraph, actor, dereference, and release-commit gate', async () => {
    const fixture = await createFixture();
    const reports: unknown[] = [];

    const state = await admitSurfaceBundle({
      source: fixture.source,
      verifier: fixture.verifier,
      request: { locator: bundleConfig.locator },
      validation: async () => withRespondentPublicAppValidation(
        { schemaValidators: await loadSurfaceBundleSchemaValidators() },
        {
          appId: APP,
          starterModuleId: MODULE,
          receiptResourceUrl: RESOURCE,
        },
      ),
      onValidationReport: (report) => reports.push(report),
    });

    expect(
      state,
      JSON.stringify(reports, null, 2),
    ).toMatchObject({
      status: 'admitted',
      snapshot: { identity: fixture.snapshot.identity },
    });
    expect(fixture.commitRelease).toHaveBeenCalledOnce();
  });

  it('resumes a draft checkpoint, submits once, navigates with the real caseRef, and reloads the persisted receipt', async () => {
    window.history.replaceState({}, '', '/apply');
    const fixture = await createFixture({ pendingFirstSubmit: true });
    const sessionStore = createMemoryRespondentReceiptSessionStore();
    const pushState = vi.spyOn(window.history, 'pushState');
    const first = render(
      <VerifiedRespondentSurface
        bundleConfig={bundleConfig}
        composition={fixture.composition}
        config={publicPortalProfile}
        now={() => new Date(CHECKED_AT)}
        preferredLocales={['en']}
        sessionStore={sessionStore}
      />,
    );

    await screen.findByRole('heading', { name: 'Apply for benefits', level: 1 });
    await screen.findByRole('textbox', { name: /Full name/ });
    expect(screen.queryByRole('heading', { name: 'Demo Benefits Intake' })).toBeNull();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(fixture.definitionSourceGet).not.toHaveBeenCalled();
    const intake = document.querySelector<HTMLElement>('[data-route="apply"]');
    expect(intake?.getAttribute('data-tenant-theme')).toBe('admitted');
    expect(intake?.style.getPropertyValue('--formspec-color-primary')).toBe(TENANT_COLOR);
    expect(document.documentElement.style.getPropertyValue('--formspec-color-primary')).toBe('');

    fillRequiredForm('Ada Lovelace');
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(fixture.submit).toHaveBeenCalledOnce();
    });
    expect(fixture.draftSave).toHaveBeenCalled();
    expect(JSON.stringify(fixture.draftSave.mock.calls.at(-1)?.[1])).toContain(
      'Ada Lovelace',
    );

    first.unmount();
    fixture.rejectFirstSubmit?.(new Error('interrupted before transport confirmation'));
    window.history.replaceState({}, '', '/apply');

    render(
      <VerifiedRespondentSurface
        bundleConfig={bundleConfig}
        composition={fixture.composition}
        config={publicPortalProfile}
        now={() => new Date(CHECKED_AT)}
        preferredLocales={['en']}
        sessionStore={sessionStore}
      />,
    );
    await waitFor(() => {
      expect(fixture.draftLoad.mock.calls.length).toBeGreaterThan(1);
    });
    expect(fixture.draftLoad.mock.calls.at(-1)?.[0]).toEqual(
      fixture.draftSave.mock.calls.at(-1)?.[0],
    );
    expect(
      JSON.stringify(await fixture.draftLoad.mock.results.at(-1)?.value),
    ).toContain('Ada Lovelace');
    await waitFor(() => {
      expect(
        (screen.getByRole('textbox', { name: /Full name/ }) as HTMLInputElement).value,
      ).toBe('Ada Lovelace');
    });
    const loadsBeforeConfirmedSubmit = fixture.draftLoad.mock.calls.length;
    const pushesBeforeConfirmedSubmit = pushState.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByRole('heading', { name: 'Your receipt', level: 1 });
    expect(window.location.pathname).toBe('/receipt/CASE-301');
    expect(pushState.mock.calls.length - pushesBeforeConfirmedSubmit).toBe(1);
    expect(fixture.submit).toHaveBeenCalledTimes(2);
    expect(fixture.draftLoad).toHaveBeenCalledTimes(loadsBeforeConfirmedSubmit);
    expect(fixture.definitionSourceGet).not.toHaveBeenCalled();
    expect(fixture.acquire).toHaveBeenCalledTimes(2);
    expect(fixture.verify).toHaveBeenCalledTimes(2);
    const status = screen.getByLabelText('App verification');
    expect(within(status).getByText('Published by Example Benefits Publisher')).toBeDefined();
    expect(await screen.findByText('CASE-301')).toBeDefined();
    expect(await screen.findByText('accepted')).toBeDefined();
    const proof = document.querySelector<HTMLElement>('[data-route="receipt"]');
    expect(proof?.getAttribute('data-tenant-theme')).toBe('refused');
    expect(proof?.getAttribute('data-tenant-token-count')).toBe('0');
    expect(styleValues(proof)).not.toContain(TENANT_COLOR);

    cleanup();
    window.history.replaceState({}, '', '/receipt/CASE-301');
    render(
      <VerifiedRespondentSurface
        bundleConfig={bundleConfig}
        composition={fixture.composition}
        config={publicPortalProfile}
        now={() => new Date(CHECKED_AT)}
        preferredLocales={['en']}
        sessionStore={sessionStore}
      />,
    );

    await screen.findByRole('heading', { name: 'Your receipt', level: 1 });
    expect(await screen.findByText('CASE-301')).toBeDefined();
    expect(await screen.findByText('accepted')).toBeDefined();
    expect(screen.getByLabelText('App verification')).toBeDefined();
  });
});

interface FixtureOptions {
  readonly pendingFirstSubmit?: boolean;
}

interface Fixture {
  readonly snapshot: SurfaceBundleSnapshot;
  readonly source: SurfaceBundleSource;
  readonly verifier: SurfaceBundleVerifier;
  readonly composition: Composition;
  readonly acquire: ReturnType<typeof vi.fn>;
  readonly verify: ReturnType<typeof vi.fn>;
  readonly commitRelease: ReturnType<typeof vi.fn>;
  readonly definitionSourceGet: ReturnType<typeof vi.fn>;
  readonly draftLoad: ReturnType<typeof vi.fn>;
  readonly draftSave: ReturnType<typeof vi.fn>;
  readonly submit: ReturnType<typeof vi.fn>;
  readonly rejectFirstSubmit?: (error: unknown) => void;
}

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const snapshot = await createSurfaceBundleSnapshot(
    new TextEncoder().encode('verified-respondent-bundle'),
    {
      adapterId: 'urn:formspec-web:test:source@1',
      requestedLocator: bundleConfig.locator,
      resolvedLocator: bundleConfig.locator,
      acquiredAt: CHECKED_AT,
      responseStatus: 200,
    },
  );
  const acquire = vi.fn(async () => snapshot);
  const verify = vi.fn(async () => verifiedResult(snapshot));
  const commitRelease = vi.fn(async () => ({
    status: 'committed' as const,
    releaseCommit: 'not-required' as const,
    snapshotIdentity: snapshot.identity,
  }));
  const source: SurfaceBundleSource = { acquire };
  const verifier: SurfaceBundleVerifier = { verify, commitRelease };
  const definitionSourceGet = vi.fn(async () => {
    throw new Error('Resolved Surface forms must not refetch the Definition');
  });
  const draftStore = stubDraftStore();
  const draftLoad = vi.fn(draftStore.load.bind(draftStore));
  const draftSave = vi.fn(draftStore.save.bind(draftStore));
  let rejectFirstSubmit: ((error: unknown) => void) | undefined;
  const submit = vi.fn(async () => {
    if (options.pendingFirstSubmit && submit.mock.calls.length === 1) {
      return new Promise<never>((_resolve, reject) => {
        rejectFirstSubmit = reject;
      });
    }
    return {
      referenceNumber: 'CASE-301',
      status: 'accepted' as const,
      trackingUri: 'https://status.example.gov/CASE-301',
    };
  });
  const base = createStubComposition();
  const composition: Composition = {
    ...base,
    definitionSource: {
      getDefinition: definitionSourceGet,
    },
    draftStore: {
      ...draftStore,
      load: draftLoad,
      save: draftSave,
    },
    identityProvider: stableAnonymousIdentityProvider(),
    submitTransport: { submit },
    surfaceBundleSource: source,
    surfaceBundleVerifier: verifier,
  };
  return {
    snapshot,
    source,
    verifier,
    composition,
    acquire,
    verify,
    commitRelease,
    definitionSourceGet,
    draftLoad,
    draftSave,
    submit,
    get rejectFirstSubmit() {
      return rejectFirstSubmit;
    },
  };
}

function stableAnonymousIdentityProvider(): IdentityProvider {
  const option: IdpOption = { kind: 'anonymous', minAssurance: 'L1' };
  const claim: IdentityClaim = {
    provider: 'test-anonymous',
    adapter: 'test-identity-provider@1',
    subjectRef: 'anonymous:verified-respondent-session',
    credentialType: 'other',
    subjectBinding: 'respondent',
    assuranceLevel: 'L1',
    privacyTier: 'anonymous',
  };
  const listeners = new Set<(current: IdentityClaim | null) => void>();
  let current: IdentityClaim | null = null;

  return {
    async discover() {
      return [option];
    },
    async authenticate() {
      current = claim;
      for (const listener of listeners) {
        listener(current);
      }
      return current;
    },
    async revoke() {
      current = null;
      for (const listener of listeners) {
        listener(current);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
  };
}

function verifiedResult(snapshot: SurfaceBundleSnapshot): SurfaceBundleVerifiedResult {
  return {
    status: 'verified',
    snapshotIdentity: snapshot.identity,
    payload: signedPayload(),
    provenance: {
      adapterId: 'urn:formspec-web:test:verifier@1',
      snapshotIdentity: snapshot.identity,
      source: snapshot.evidence,
      checkedAt: CHECKED_AT,
      signedPayloadDigest: 'sha256:respondent-payload',
      integrityReceipt: {
        result: 'verified',
        method: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        methodRegistryVersion: semVer('1.0.0'),
        adapter: {
          id: uri('urn:formspec:test:webcrypto@1'),
          version: semVer('1.0.0'),
        },
        key: { ref: kidOrThumbprint('cmVzcG9uZGVudC1rZXk') },
        verifiedAt: CHECKED_AT,
      },
      trust: {
        status: 'authorized',
        kid: 'cmVzcG9uZGVudC1rZXk',
        publisherId: PUBLISHER,
        publisherDisplayName: 'Example Benefits Publisher',
        appId: APP,
        methodUri: 'urn:formspec:sig-method:ed25519-cose-sign1@1',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        revoked: false,
      },
      release: {
        status: 'current',
        mode: 'pinned',
        releaseId: 'respondent-2026-07-28',
        sequence: 1,
        digest: 'sha256:respondent-payload',
      },
    },
    releasePrecondition: {} as SurfaceBundleReleasePrecondition,
  };
}

function signedPayload(): SurfaceBundleSignedPayloadV1 {
  const shellStrings = Object.fromEntries(SURFACE_STRING_KEYS.map((key) => [
    `${SURFACE_LOCALE_KEY_PREFIX}${key}`,
    key === 'transitionContinue'
      ? 'Continue to {{$target}}'
      : `Respondent ${key}`,
  ]));
  return {
    profile: 'formspec-surface-bundle-signing-v1',
    publisher: { id: PUBLISHER },
    release: { id: 'respondent-2026-07-28', sequence: 1 },
    manifest: {
      $formspecBundle: '2.4',
      id: APP,
      version: '1.0.0',
      title: 'Verified benefits application',
      definitions: [{
        url: RESPONDENT_DEFINITION.url,
        version: RESPONDENT_DEFINITION.version,
      }],
      responseActions: { url: ACTIONS, version: '1.0.0' },
      theme: { url: THEME, version: '1.0.0' },
      registries: [{ url: REGISTRY, version: '1.0.0' }],
      surfaces: [{ url: SURFACE, version: '1.0.0' }],
      entrySurface: SURFACE,
      dataSources: [{ url: DATA, version: '1.0.0' }],
      locales: [{ url: LOCALE, version: '1.0.0', locale: 'en' }],
      modules: [{ id: MODULE, version: '1.0.0' }],
    },
    documents: {
      [RESPONDENT_DEFINITION.url]: RESPONDENT_DEFINITION,
      [ACTIONS]: {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        targetDefinition: { url: RESPONDENT_DEFINITION.url },
        actions: [{
          id: 'submit-intake',
          intent: 'submit',
          label: { literal: 'Submit' },
          effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
        }],
      },
      [THEME]: {
        $formspecTheme: '1.0',
        url: THEME,
        version: '1.0.0',
        name: 'respondent-tenant',
        targetDefinition: { url: RESPONDENT_DEFINITION.url },
        tokens: { 'color.primary': TENANT_COLOR },
      },
      [REGISTRY]: {
        $formspecRegistry: '1.1',
        publisher: { name: 'Example Benefits Agency' },
        published: '2026-07-28T00:00:00.000Z',
        entries: [
          {
            name: MODULE,
            category: 'module',
            version: '1.0.0',
            status: 'stable',
            description: 'Public respondent widgets.',
            compatibility: { formspecVersion: '>=1.0.0 <2.0.0' },
            contributes: ['x-receipt-panel'],
          },
          {
            name: 'x-receipt-panel',
            category: 'widget',
            version: '1.0.0',
            status: 'stable',
            description: 'Shows the authenticated submission receipt.',
            compatibility: { formspecVersion: '>=1.0.0 <2.0.0' },
            widgetShape: {
              widgetName: 'ReceiptPanel',
              dataInputs: [{ name: 'receipt', required: true }],
            },
          },
        ],
      },
      [SURFACE]: {
        $formspecSurface: '0.2',
        id: 'respondent',
        modules: [{ id: MODULE, version: '1.0.0' }],
        entry: 'apply',
        routes: [
          {
            id: 'apply',
            path: '/apply',
            title: 'Apply for benefits',
            routeClass: 'intake',
            slots: [{
              id: 'form',
              slotType: 'definition-form',
              binding: { definitionRef: RESPONDENT_DEFINITION.url },
            }],
            transitions: [{
              trigger: 'submit-intake',
              to: 'receipt',
              params: { caseRef: 'caseRef' },
            }],
          },
          {
            id: 'receipt',
            path: '/receipt/{caseRef}',
            params: [{ name: 'caseRef', type: 'string' }],
            title: 'Your receipt',
            routeClass: 'proof',
            slots: [{
              id: 'receipt-panel',
              title: 'Submission receipt',
              slotType: 'module-widget',
              binding: {
                moduleId: MODULE,
                widgetName: 'ReceiptPanel',
                dataBindings: {
                  receipt: {
                    catalogRef: DATA,
                    sourceRef: 'resource:receipt',
                  },
                },
              },
            }],
          },
        ],
      },
      [DATA]: {
        $formspecDataSources: '1.0',
        id: DATA,
        version: '1.0.0',
        sources: [{
          id: 'resource:receipt',
          kind: 'document-resource',
          owner: 'host',
          scope: 'route',
          availability: {
            level: 'slot',
            surfaceRef: SURFACE,
            routeRef: 'receipt',
            slotId: 'receipt-panel',
          },
          runtime: {
            delivery: 'snapshot',
            cache: { mode: 'none' },
            authorizationBoundary: 'host',
            failureMode: 'block-render',
            provenance: {
              kind: 'document-resource',
              source: RESOURCE,
            },
          },
          schema: {
            type: 'object',
            required: ['caseRef', 'submittedAt', 'facts'],
            additionalProperties: false,
            properties: {
              caseRef: { type: 'string' },
              submittedAt: { type: 'string' },
              facts: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['label', 'value'],
                  additionalProperties: false,
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                  },
                },
              },
            },
          },
        }],
      },
      [LOCALE]: {
        $formspecLocale: '2.0',
        url: LOCALE,
        version: '1.0.0',
        locale: 'en',
        target: { kind: 'app', url: APP },
        strings: shellStrings,
      },
    },
  } as unknown as SurfaceBundleSignedPayloadV1;
}

const bundleConfig: RespondentSurfaceBundleConfig = {
  locator: 'https://bundles.example.gov/respondent.cose',
  allowedOrigins: ['https://bundles.example.gov'],
  maxBytes: 1_000_000,
  timeoutMs: 15_000,
  redirectPolicy: 'refuse',
  starterModuleId: MODULE,
  receiptResourceUrl: RESOURCE,
  verification: {
    expectedAppId: APP,
    methodRegistry: {
      version: '1.0.0',
      entries: [{
        id: 'urn:formspec:sig-method:ed25519-cose-sign1@1',
        suite: 'Ed25519',
        wire: 'COSE_Sign1',
        alg: -8,
        status: 'registered',
      }],
    },
    keys: [{ kid: 'cmVzcG9uZGVudC1rZXk', publicKey: 'cHVibGljLWtleQ' }],
    authorities: [{
      kid: 'cmVzcG9uZGVudC1rZXk',
      publisherId: PUBLISHER,
      publisherDisplayName: 'Example Benefits Publisher',
      appIds: [APP],
      methods: ['urn:formspec:sig-method:ed25519-cose-sign1@1'],
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      revoked: false,
    }],
    pinnedReleases: [{
      digest: 'sha256:respondent-payload',
      releaseId: 'respondent-2026-07-28',
    }],
  },
};

function fillRequiredForm(fullName: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: /Full name/ }), {
    target: { value: fullName },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /Email address/ }), {
    target: { value: 'ada@example.test' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: /Preferred contact method/ }), {
    target: { value: 'email' },
  });
  fireEvent.change(screen.getAllByRole('textbox', { name: /Member name/ })[0]!, {
    target: { value: fullName },
  });
}

function styleValues(element: HTMLElement | null): string[] {
  if (!element) return [];
  return Array.from(
    { length: element.style.length },
    (_, index) => element.style.getPropertyValue(element.style[index] ?? ''),
  );
}

function definitionWithoutLegacyPresentation(
  definition: typeof demoSampleForm,
): typeof demoSampleForm {
  const copy = structuredClone(definition);
  const strip = (items: unknown[]): void => {
    for (const value of items) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      delete item.presentation;
      if (Array.isArray(item.children)) strip(item.children);
    }
  };
  strip(copy.items as unknown[]);
  return copy;
}
