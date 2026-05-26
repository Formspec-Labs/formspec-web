import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { HttpDefinitionSource } from '../../src/adapters/http/definition-source.ts';
import {
  PARITY_FIXTURE_OBLIGATION,
  renderParityFixture,
} from './obligations-view.test.tsx';
import { cleanup as rtlCleanup, fireEvent } from '@testing-library/react';
import type { Composition } from '../../src/composition/types.ts';
import { departmentAppProfile, publicPortalProfile } from '../../src/profiles/profiles.ts';
import type { FormspecWebConfig } from '../../src/config/types.ts';
import type { FormRuntimePolicy } from '../../src/policy/index.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import type { IdentityClaim, IdentityProvider, IdpOption } from '../../src/ports/identity-provider.ts';
import type { IntakeHandoff } from '../../src/ports/submit-transport.ts';
import type {
  ApplicantStatusResource,
  ComponentDocument,
  ComponentGraphProjectionContext,
  FormDefinition,
  LayoutHostEvidence,
  LocaleDocument,
  RespondentPlaceSnapshot,
  RespondentSubmissionRecord,
} from '../../src/ports/index.ts';
import { unavailablePreallocatedFeaturePorts } from '../../src/adapters/unavailable/preallocated-feature-port.ts';
import {
  multiPartyDraftKey,
  multiPartyProgressDraftKey,
} from '../../src/app/respondent-flow.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { jsonResponse, recordingFetch } from '../adapters/http/test-fetch.ts';
import {
  RESPONSE_ACTION_LEDGER_CAPABILITY_HEADER,
  createHttpResponseActionLedgerInvokerFactory,
} from '../../src/adapters/http/response-action-ledger.ts';

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

describe('RespondentRuntime identity sign-in', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
  });

  it('renders explicit OIDC sign-in and loads the form after user action', async () => {
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider);

    await renderRuntime(composition);
    await waitForText('Sign in to continue');

    expect(identityProvider.authenticate).not.toHaveBeenCalled();

    await clickButton('Sign in with Example IdP');
    await waitForText('Demo Benefits Intake');

    expect(identityProvider.authenticate).toHaveBeenCalledOnce();
    expect(composition.definitionSource.getDefinition).toHaveBeenCalledOnce();
  });

  it('keeps redirect-started as in-progress instead of a load failure', async () => {
    const redirectStarted = new Error('OIDC authentication redirect started');
    redirectStarted.name = 'IdentityInteractionStartedError';
    const identityProvider = new TestIdentityProvider({ error: redirectStarted });

    await renderRuntime(testComposition(identityProvider));
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Opening sign-in');

    expect(text()).not.toContain('We could not load this form.');
    expect(text()).not.toContain('OIDC authentication redirect started');
  });

  it('keeps real OIDC authentication failures visible', async () => {
    const identityProvider = new TestIdentityProvider({ error: new Error('OIDC unavailable') });

    await renderRuntime(testComposition(identityProvider));
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('OIDC unavailable');

    expect(text()).toContain('Sign in to continue');
  });

  it('loads server-supplied Locale Documents through the definition source', async () => {
    const identityProvider = new TestIdentityProvider();
    const serverLocaleDocument: LocaleDocument = {
      $formspecLocale: '1.0',
      url: 'https://formspec-server.example.test/runtime/locales/demo-intake/es',
      version: '1.0.0',
      locale: 'es',
      targetDefinition: { url: demoSampleForm.url },
      strings: {
        '$form.title': 'Solicitud desde el servidor',
      },
    };
    const composition = testComposition(identityProvider, {
      localeDocuments: [serverLocaleDocument],
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Demo Benefits Intake');
    await clickButton('Spanish');
    await waitForText('Solicitud desde el servidor');

    expect(composition.definitionSource.getLocaleDocuments).toHaveBeenCalledWith(demoSampleForm.url);
  });

  it('loads Locale Documents from the original runtime definition URL', async () => {
    const identityProvider = new TestIdentityProvider();
    const runtimeDefinitionUrl =
      'https://formspec-server.example.test/runtime/forms/demo-benefits-intake-live';
    const canonicalDefinition: FormDefinition = {
      ...demoSampleForm,
      url: 'https://benefits.example.gov/forms/demo-benefits-intake',
      version: '2026.05.25',
    };
    const serverLocaleDocument: LocaleDocument = {
      $formspecLocale: '1.0',
      url: 'https://formspec-server.example.test/runtime/locales/demo-benefits-intake-live/es',
      version: '1.0.0',
      locale: 'es',
      targetDefinition: { url: canonicalDefinition.url },
      strings: {
        '$form.title': 'Solicitud desde el servidor',
      },
    };
    const composition = testComposition(identityProvider, {
      definition: canonicalDefinition,
      initialDefinitionUrl: runtimeDefinitionUrl,
      localeDocuments: [serverLocaleDocument],
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Demo Benefits Intake');
    await clickButton('Spanish');
    await waitForText('Solicitud desde el servidor');

    expect(composition.definitionSource.getDefinition).toHaveBeenCalledWith(runtimeDefinitionUrl);
    expect(composition.definitionSource.getLocaleDocuments).toHaveBeenCalledWith(runtimeDefinitionUrl);
  });

  it('uses one HTTP runtime payload for the definition and Locale Documents', async () => {
    const identityProvider = new TestIdentityProvider();
    const runtimeDefinitionUrl =
      'https://formspec-server.example.test/runtime/forms/demo-benefits-intake-live';
    const canonicalDefinition: FormDefinition = {
      ...demoSampleForm,
      url: 'https://benefits.example.gov/forms/demo-benefits-intake',
      version: '2026.05.25',
    };
    const serverLocaleDocument: LocaleDocument = {
      $formspecLocale: '1.0',
      url: 'https://formspec-server.example.test/runtime/locales/demo-benefits-intake-live/es',
      version: '1.0.0',
      locale: 'es',
      targetDefinition: { url: canonicalDefinition.url },
      strings: {
        '$form.title': 'Solicitud desde un solo payload',
      },
    };
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({
        definition: canonicalDefinition,
        locales: { es: serverLocaleDocument },
      }),
    );
    const composition: Composition = {
      ...testComposition(identityProvider, { initialDefinitionUrl: runtimeDefinitionUrl }),
      definitionSource: new HttpDefinitionSource({
        baseUrl: 'https://formspec-server.example.test',
        fetchImpl: fetch,
      }),
    };

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Demo Benefits Intake');
    await clickButton('Spanish');
    await waitForText('Solicitud desde un solo payload');

    expect(requests.map((request) => request.url)).toEqual([
      'https://formspec-server.example.test/runtime/forms/demo-benefits-intake-live',
    ]);
  });

  it('passes host-supplied Component graph sidecars into the React renderer as inert metadata', async () => {
    const componentDocument = componentDocumentForRuntime();
    const componentGraph: ComponentGraphProjectionContext = {
      component: {
        handle: 'respondent',
        url: componentDocument.url,
        version: componentDocument.version,
      },
      surface: {
        url: 'https://surfaces.example.test/intake',
        version: '1.0.0',
      },
      route: 'apply',
    };
    const identityProvider = new TestIdentityProvider({
      options: [{ kind: 'anonymous', minAssurance: 'L1' }],
    });
    const composition = testComposition(
      identityProvider,
      {
        componentDocument,
        componentGraph,
      },
      publicPortalProfile,
    );

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Demo Benefits Intake');

    const rootStack = container?.querySelector('.formspec-stack') as HTMLElement | null;
    const notesField = container?.querySelector('.formspec-field[data-name="notes"]') as HTMLElement | null;
    expect(rootStack?.dataset.formspecComponentHandle).toBe('respondent');
    expect(rootStack?.dataset.formspecRoute).toBe('apply');
    expect(rootStack?.dataset.formspecNodePath).toBe('/root-stack');
    expect(notesField?.dataset.formspecComponentNodeId).toBe('notes-node');
    expect(notesField?.dataset.formspecNodePath).toBe('/root-stack/notes');
    expect(composition.definitionSource.getComponentDocument).toHaveBeenCalledWith(demoSampleForm.url);
    expect(composition.definitionSource.getComponentGraphContext).toHaveBeenCalledWith(demoSampleForm.url);
  });

  it('passes host-supplied LayoutHostEvidence into the React renderer as inert UI policy metadata', async () => {
    const componentDocument = componentDocumentForRuntime();
    const componentGraph: ComponentGraphProjectionContext = {
      component: {
        handle: 'respondent',
        url: componentDocument.url,
        version: componentDocument.version,
      },
      surface: {
        url: 'https://surfaces.example.test/intake',
        version: '1.0.0',
      },
      route: 'apply',
    };
    const hostEvidence = uiGraphPolicyHostEvidence();
    const identityProvider = new TestIdentityProvider({
      options: [{ kind: 'anonymous', minAssurance: 'L1' }],
    });
    const composition = testComposition(
      identityProvider,
      {
        componentDocument,
        componentGraph,
        hostEvidence,
      },
      publicPortalProfile,
    );

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Demo Benefits Intake');

    const rootStack = container?.querySelector('.formspec-stack') as HTMLElement | null;
    const notesField = container?.querySelector('.formspec-field[data-name="notes"]') as HTMLElement | null;
    expect(rootStack?.dataset.formspecUiPolicySchema).toBe(UI_GRAPH_POLICY_SCHEMA_ID);
    expect(rootStack?.dataset.formspecUiPolicySource).toBe('host://policy/respondent-ui-policy');
    expect(rootStack?.dataset.formspecUiPolicySurfaceUrl).toBe('https://surfaces.example.test/intake');
    expect(rootStack?.dataset.formspecUiPolicyRoute).toBe('apply');
    expect(rootStack?.dataset.formspecUiPolicyA11yLandmark).toBe('main');
    expect(rootStack?.dataset.formspecUiPolicyKeyboardNavigation).toBe('true');
    expect(rootStack?.dataset.formspecUiPolicyResponsiveMinColumns).toBe('1');
    expect(rootStack?.dataset.formspecUiPolicyResponsiveCollapseOrder).toBe('["summary","details"]');
    expect(notesField?.dataset.formspecUiPolicySchema).toBeUndefined();
    expect(composition.definitionSource.getLayoutHostEvidence).toHaveBeenCalledWith(demoSampleForm.url);
  });

  it('fails closed when LayoutHostEvidence lacks matching completed AppGraph report proof', async () => {
    const componentDocument = componentDocumentForRuntime();
    const componentGraph: ComponentGraphProjectionContext = {
      component: {
        handle: 'respondent',
        url: componentDocument.url,
        version: componentDocument.version,
      },
      surface: {
        url: 'https://surfaces.example.test/intake',
        version: '1.0.0',
      },
      route: 'apply',
    };
    const hostEvidence = uiGraphPolicyHostEvidence('host://policy/other-ui-policy');
    const identityProvider = new TestIdentityProvider({
      options: [{ kind: 'anonymous', minAssurance: 'L1' }],
    });
    const composition = testComposition(
      identityProvider,
      {
        componentDocument,
        componentGraph,
        hostEvidence,
      },
      publicPortalProfile,
    );

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Demo Benefits Intake');

    const rootStack = container?.querySelector('.formspec-stack') as HTMLElement | null;
    expect(rootStack?.dataset.formspecUiPolicySchema).toBeUndefined();
    expect(rootStack?.dataset.formspecComponentHandle).toBe('respondent');
    expect(composition.definitionSource.getLayoutHostEvidence).toHaveBeenCalledWith(demoSampleForm.url);
  });

  it('renders respondent-place history, saved files, and status feedback', async () => {
    const identityProvider = new TestIdentityProvider();
    const applicantStatus: ApplicantStatusResource = {
      event: 'decision-reached',
      occurredAt: '2026-05-24T12:00:00.000Z',
      summary: 'Decision issued. Check your correspondence for next steps.',
    };
    const composition = testComposition(identityProvider, {
      applicantStatus,
      respondentPlace: respondentPlaceSnapshotWithData(),
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Your forms and files');

    expect(text()).toContain('Renew household benefits');
    expect(text()).toContain('Utility bill');
    expect(text()).toContain('Decision Reached');
    expect(text()).toContain('Decision issued. Check your correspondence for next steps.');
    expect(composition.respondentPlaceSource.readPlace).toHaveBeenCalledWith({
      subjectRef: 'oidc:test-subject',
    });
    expect(composition.statusReader.readStatus).toHaveBeenCalledWith(expect.objectContaining({
      resourceRef: 'urn:wos:case_test_0001',
      subjectRef: 'oidc:test-subject',
      submissionId: 'sub-test-0001',
    }));
  });

  it('in-form obligations panel renders ObligationItem with the SAME <li> HTML the shared component produces (MED-3 parity)', async () => {
    // Render the shared ObligationItem in isolation first, then compare to
    // the in-form panel's rendered <li>. Locks out drift if a future change
    // inlines custom obligation markup in the RespondentRuntime panel.
    const isolatedHtml = renderParityFixture();
    rtlCleanup(); // drop the isolated render before mounting the full runtime.

    const identityProvider = new TestIdentityProvider();
    const placeSnapshot = {
      ...emptyRespondentPlaceSnapshot(),
      obligations: [PARITY_FIXTURE_OBLIGATION],
    };
    const composition = testComposition(identityProvider, {
      respondentPlace: placeSnapshot,
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Your forms and files');

    const li = container?.querySelector('li.place-list__item');
    if (!li) throw new Error('in-form obligations panel did not render <li class="place-list__item">');
    expect(li.outerHTML).toBe(isolatedHtml);
  });

  it('FW-0028: renders the multi-IdP picker with "Choose how to sign in" heading and "Continue without an account"', async () => {
    const identityProvider = new TestIdentityProvider({
      options: [
        {
          kind: 'oidc',
          issuer: 'https://idp-a.example.test',
          displayName: 'Login.gov',
          minAssurance: 'L2',
        },
        {
          kind: 'oidc',
          issuer: 'https://idp-b.example.test',
          displayName: 'ID.me',
          minAssurance: 'L3',
        },
        { kind: 'anonymous', minAssurance: 'L1' },
      ],
    });
    const composition = testComposition(identityProvider, {}, publicPortalProfile);

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Choose how to sign in');

    const rendered = text();
    expect(rendered).toContain('Sign in with Login.gov');
    expect(rendered).toContain('Sign in with ID.me');
    expect(rendered).toContain('Continue without an account');
    // Vocabulary firewall — internal taxonomy must not appear in user-visible
    // chrome.
    expect(rendered).not.toMatch(/\bOIDC\b/);
    expect(rendered).not.toMatch(/\bACR\b/);
    expect(rendered).not.toMatch(/\bIdentityProvider\b/);
    expect(rendered).not.toMatch(/\banonymous access\b/);
    // No-oversharing: composite renders only the configured options — three
    // buttons, nothing more.
    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    expect(buttons).toHaveLength(3);
  });

  it('FW-0028 slice 2: steps up after form load when anonymous is below the form assurance floor', async () => {
    const identityProvider = new TestIdentityProvider({
      options: [
        {
          kind: 'oidc',
          issuer: 'https://idp-high.example.test',
          displayName: 'High Assurance IdP',
          minAssurance: 'L3',
        },
        { kind: 'anonymous', minAssurance: 'L1' },
      ],
    });
    const definition = {
      ...demoSampleForm,
      metadata: {
        assurance: {
          aal: 'L3',
          jurisdiction: 'US',
        },
      },
    } as FormDefinition;
    const composition = testComposition(identityProvider, { definition }, publicPortalProfile);

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Choose how to sign in');
    await clickButton('Continue without an account');
    await waitForText('Use a stronger sign-in');

    const stepUpText = text();
    expect(stepUpText).toContain('This form needs a stronger sign-in');
    expect(stepUpText).toContain('Sign in with High Assurance IdP');
    expect(stepUpText).not.toContain('Continue without an account');
    expect(identityProvider.discover).toHaveBeenCalledWith('L1');
    expect(identityProvider.discover).toHaveBeenCalledWith('L3');
    expect(composition.draftStore.load).not.toHaveBeenCalled();

    await clickButton('Sign in with High Assurance IdP');
    await waitForText('Demo Benefits Intake');

    expect(composition.draftStore.load).toHaveBeenCalledWith(expect.objectContaining({
      subjectRef: 'oidc:test-subject',
    }));
  });

  it('FW-0028 slice 2: filters under-assurance step-up options returned by an adapter', async () => {
    const identityProvider = new TestIdentityProvider({
      honorAssuranceFilter: false,
      options: [
        {
          kind: 'oidc',
          issuer: 'https://idp-low.example.test',
          displayName: 'Lower Assurance IdP',
          minAssurance: 'L2',
        },
        {
          kind: 'oidc',
          issuer: 'https://idp-high.example.test',
          displayName: 'High Assurance IdP',
          minAssurance: 'L3',
        },
        { kind: 'anonymous', minAssurance: 'L1' },
      ],
    });
    const definition = {
      ...demoSampleForm,
      metadata: { assurance: { aal: 'L3' } },
    } as FormDefinition;
    const composition = testComposition(identityProvider, { definition }, publicPortalProfile);

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Choose how to sign in');
    await clickButton('Continue without an account');
    await waitForText('Use a stronger sign-in');

    const stepUpText = text();
    expect(stepUpText).toContain('Sign in with High Assurance IdP');
    expect(stepUpText).not.toContain('Sign in with Lower Assurance IdP');
    expect(stepUpText).not.toContain('Continue without an account');
  });

  it('FW-0028 slice 2: same-subject assurance step-up restarts form load', async () => {
    const identityProvider = new TestIdentityProvider({
      subjectRef: 'shared:test-subject',
      options: [
        {
          kind: 'oidc',
          issuer: 'https://idp-high.example.test',
          displayName: 'High Assurance IdP',
          minAssurance: 'L3',
        },
        { kind: 'anonymous', minAssurance: 'L1' },
      ],
    });
    const definition = {
      ...demoSampleForm,
      metadata: { assurance: { ial: 'L3' } },
    } as FormDefinition;
    const composition = testComposition(identityProvider, { definition }, publicPortalProfile);

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Choose how to sign in');
    await clickButton('Continue without an account');
    await waitForText('Use a stronger sign-in');
    expect(composition.draftStore.load).not.toHaveBeenCalled();

    await clickButton('Sign in with High Assurance IdP');
    await waitForText('Demo Benefits Intake');

    expect(composition.draftStore.invalidateSubject).not.toHaveBeenCalled();
    expect(composition.draftStore.load).toHaveBeenCalledWith(expect.objectContaining({
      subjectRef: 'shared:test-subject',
    }));
  });

  it('FW-0028: keeps "Sign in to continue" heading when a single OIDC option is on offer', async () => {
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider);

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    expect(text()).not.toContain('Choose how to sign in');
  });

  it('injects a route-backed Response Actions Ledger invoker into the public respondent runtime', async () => {
    const runtimeDefinitionUrl = 'https://formspec-server.example.test/runtime/forms/demo-intake';
    const endpoint = 'https://formspec-server.example.test';
    const anonymousSession = {
      sessionId: 'anon_session_web_ledger',
      sessionToken: 'anon-token-web-ledger',
      subjectRef: 'anon:web-ledger',
      formId: 'demo-intake',
      expiresAt: '2026-05-26T01:00:00.000Z',
    };
    const anonymousSessions = {
      sessionForForm: vi.fn(async () => anonymousSession),
    };
    const capabilityRequests: Array<{ formId: string; anonymousSessionToken: string; appendCommand: any }> = [];
    const httpRequests: Array<{ url: string; body: any; headers: Headers }> = [];
    const fetchHostRoute = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const headers = new Headers(init?.headers);
      httpRequests.push({ url: String(url), body, headers });

      if (String(url).endsWith('/runtime/response-actions/ledger/session-op-batches')) {
        return jsonResponse({
          ledgerScope: body.ledgerScope,
          priorEventHash: null,
          eventHash: 'sha256:6666666666666666666666666666666666666666666666666666666666666666',
          idempotencyKey: body.idempotencyKey,
          status: 'anchored',
          substrateEventId: 'evt_web_ledger',
          sequence: 0,
          checkpointReference: 'checkpoint:web-ledger',
          bundleRef: 'bundle:web-ledger',
        });
      }

      return jsonResponse({ title: 'unexpected route' }, 404);
    });
    const responseActionInvoker = createHttpResponseActionLedgerInvokerFactory({
      endpoint,
      tenantBinding: publicPortalProfile.tenantBinding,
      anonymousSessions,
      capabilityProvider: async (request) => {
        capabilityRequests.push({
          formId: request.formId,
          anonymousSessionToken: request.anonymousSession.sessionToken,
          appendCommand: request.appendCommand,
        });
        return 'route-backed-web-ledger-capability';
      },
      fetchImpl: fetchHostRoute,
      branchId: 'branch-web-ledger',
      invocationId: () => 'inv-web-submit',
      now: () => '2026-05-26T00:00:00.000Z',
    });
    const identityProvider = new TestIdentityProvider({
      options: [{ kind: 'anonymous', minAssurance: 'L1' }],
      subjectRef: anonymousSession.subjectRef,
    });
    const composition = {
      ...testComposition(identityProvider, { initialDefinitionUrl: runtimeDefinitionUrl }, publicPortalProfile),
      responseActionInvoker,
    };

    await renderRuntime(composition, publicPortalProfile);
    await waitForText('Demo Benefits Intake');
    await clickSubmit();
    await waitFor(() => httpRequests.length === 1 && capabilityRequests.length === 1);

    expect(anonymousSessions.sessionForForm).toHaveBeenCalledWith(
      runtimeDefinitionUrl,
      demoSampleForm.version,
    );
    expect(capabilityRequests[0]).toMatchObject({
      formId: 'demo-intake',
      anonymousSessionToken: anonymousSession.sessionToken,
      appendCommand: {
        ledgerScope: 'urn:formspec:session:anon_session_web_ledger',
        branchId: 'branch-web-ledger',
        mode: 'require-anchored',
      },
    });
    expect(httpRequests[0]!.url).toBe(`${endpoint}/runtime/response-actions/ledger/session-op-batches`);
    expect(capabilityRequests[0]!.appendCommand).toEqual(httpRequests[0]!.body);
    expect(httpRequests[0]!.headers.get(RESPONSE_ACTION_LEDGER_CAPABILITY_HEADER)).toBe(
      'route-backed-web-ledger-capability',
    );
    expect(httpRequests[0]!.body).toMatchObject({
      ledgerScope: 'urn:formspec:session:anon_session_web_ledger',
      branchId: 'branch-web-ledger',
      mode: 'require-anchored',
      opBatch: {
        sessionRef: {
          id: 'urn:formspec:session:anon_session_web_ledger',
          actors: ['urn:formspec:actor:human:anon:web-ledger'],
        },
        actor: {
          id: 'urn:formspec:actor:human:anon:web-ledger',
          kind: 'human',
          actChannel: 'human',
        },
        semanticOps: expect.arrayContaining([
          expect.objectContaining({
            op: 'responseAction.invocation',
            actionId: 'submit',
            invocationId: 'inv-web-submit',
            status: 'completed',
          }),
        ]),
      },
    });
    expect(httpRequests[0]!.body.opBatchHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(httpRequests[0]!.body.idempotencyKey).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('requests submission status by submission id when a projection has no resource ref', async () => {
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider, {
      applicantStatus: {
        event: 'case-created',
        occurredAt: '2026-05-24T12:00:00.000Z',
        summary: 'Case created.',
      },
      respondentPlace: respondentPlaceSnapshotWithData({
        applicantStatus: {
          sourceSchema: 'https://schemas.formspec.io/wos-api/applicant/v1',
          projectionKind: 'ApplicantStatusTimelineEntry',
          endpoint: 'https://wos.example.test/applicant/cases/case_test_0002',
          updatedAt: '2026-05-24T12:00:00.000Z',
          headline: 'Received',
          summary: 'Your submission was received.',
        },
      }),
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Case Created');

    expect(composition.statusReader.readStatus).toHaveBeenCalledWith(expect.objectContaining({
      resourceRef: undefined,
      subjectRef: 'oidc:test-subject',
      submissionId: 'sub-test-0001',
      trackingUri: 'https://wos.example.test/applicant/cases/case_test_0002',
    }));
  });

  it('fails at form load when multiParty is required but the instance is unavailable', async () => {
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider, {
      formPolicy: {
        features: { multiParty: 'required' },
        limits: {
          multiParty: {
            tier: 'coEqual',
            invitationChannel: 'magic-link',
            parties: [
              {
                roleId: 'spouse-a',
                role: 'coEqual',
                cardinality: { min: 1, max: 1 },
                visibilityScope: 'shared',
              },
              {
                roleId: 'spouse-b',
                role: 'coEqual',
                cardinality: { min: 1, max: 1 },
                visibilityScope: 'shared',
              },
            ],
          },
        },
      },
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('This form cannot be loaded.');

    expect(text()).toContain('This form requires multiple signers');
    expect(composition.submitTransport.submit).not.toHaveBeenCalled();
  });

  it('masks safe-address fields by default and reveals per act', async () => {
    const definition: FormDefinition = {
      ...demoSampleForm,
      url: 'https://test.example/forms/safe-address',
      title: 'Safe address test',
      items: [
        {
          key: 'protectedHomeAddress',
          type: 'field',
          dataType: 'string',
          label: 'Protected home address',
          accessControl: { class: 'safe-address' },
        },
      ],
      extensions: {
        'x-formspec-safe-address': {
          mode: 'required',
          acpJurisdictionsAccepted: ['CA-ACP'],
          authorizedAudiences: ['issuer_verification'],
          fields: [
            {
              path: '/protectedHomeAddress',
              accessClass: 'safe-address',
              visibleTo: ['issuer_verification'],
            },
          ],
          rendererHints: {
            maskRenderToken: '(protected)',
            revealAffordanceLabel: 'Show protected value',
          },
        },
      },
    } as FormDefinition;
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider, { definition });
    composition.instanceCapabilities = {
      ...composition.instanceCapabilities,
      safeAddress: 'available',
    };
    composition.formRuntimePolicyExtractor = {
      extract: () => ({
        features: { respondentPlace: 'optional', status: 'optional', safeAddress: 'required' },
        limits: {
          safeAddress: definition.extensions?.['x-formspec-safe-address'],
        },
      }),
    };

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Protected home address');
    const input = container?.querySelector('.formspec-safe-address-field input') as HTMLInputElement;
    if (!input) throw new Error('safe-address input not found');

    await clickButton('Show protected value');
    await act(async () => {
      input.focus();
      fireEvent.change(input, { target: { value: '123 Private St' } });
      await tick();
      input.blur();
      await tick();
    });
    expect(input.value).toBe('(protected)');
    await clickButton('Show protected value');
    expect(input.value).toBe('123 Private St');
  });

  it('validates safe-address substitute values before submit handoff', async () => {
    const definition = {
      ...demoSampleForm,
      url: 'https://test.example/forms/safe-address-submit',
      title: 'Safe address submit test',
      items: [
        {
          key: 'protectedHomeAddress',
          type: 'field',
          dataType: 'string',
          label: 'Protected home address',
          accessControl: { class: 'safe-address' },
        },
      ],
      extensions: {
        'x-formspec-safe-address': {
          mode: 'required',
          acpJurisdictionsAccepted: ['CA-ACP'],
          authorizedAudiences: ['issuer_verification'],
          fields: [
            {
              path: '/protectedHomeAddress',
              accessClass: 'safe-address',
            },
          ],
        },
      },
    } as FormDefinition;
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider, { definition });
    composition.instanceCapabilities = {
      ...composition.instanceCapabilities,
      safeAddress: 'available',
    };
    composition.formRuntimePolicyExtractor = {
      extract: () => ({
        features: { respondentPlace: 'optional', status: 'optional', safeAddress: 'required' },
        limits: {
          safeAddress: definition.extensions?.['x-formspec-safe-address'],
        },
      }),
    };
    composition.safeAddressDirectory = {
      supportedJurisdictions: vi.fn(async () => []),
      validateSubstituteAddress: vi.fn(async (request) => ({
        valid: true as const,
        jurisdictionKey: request.jurisdictionKey,
        normalizedSubstitute: 'PO Box 846, Sacramento, CA 95812',
      })),
    };

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Protected home address');
    await clickButton('Reveal protected value');
    const input = container?.querySelector('.formspec-safe-address-field input') as HTMLInputElement;
    if (!input) throw new Error('safe-address input not found');

    await act(async () => {
      input.focus();
      fireEvent.change(input, { target: { value: 'PO Box 846, Sacramento, CA 95812' } });
      await tick();
      input.blur();
      await tick();
    });
    await clickSubmit();
    await waitForText('TEST-0001');

    expect(composition.safeAddressDirectory.validateSubstituteAddress).toHaveBeenCalledWith({
      jurisdictionKey: 'CA-ACP',
      candidate: 'PO Box 846, Sacramento, CA 95812',
      accessClass: 'safe-address',
    });
    expect(composition.submitTransport.submit).toHaveBeenCalledOnce();
  });

  it('blocks submit when a safe-address substitute is not recognized', async () => {
    const definition = {
      ...demoSampleForm,
      url: 'https://test.example/forms/safe-address-invalid-submit',
      title: 'Safe address invalid submit test',
      items: [
        {
          key: 'protectedHomeAddress',
          type: 'field',
          dataType: 'string',
          label: 'Protected home address',
          accessControl: { class: 'safe-address' },
        },
      ],
      extensions: {
        'x-formspec-safe-address': {
          mode: 'required',
          acpJurisdictionsAccepted: ['CA-ACP'],
          authorizedAudiences: ['issuer_verification'],
          fields: [
            {
              path: '/protectedHomeAddress',
              label: 'Protected home address',
              accessClass: 'safe-address',
            },
          ],
        },
      },
    } as FormDefinition;
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider, { definition });
    composition.instanceCapabilities = {
      ...composition.instanceCapabilities,
      safeAddress: 'available',
    };
    composition.formRuntimePolicyExtractor = {
      extract: () => ({
        features: { respondentPlace: 'optional', status: 'optional', safeAddress: 'required' },
        limits: {
          safeAddress: definition.extensions?.['x-formspec-safe-address'],
        },
      }),
    };
    composition.safeAddressDirectory = {
      supportedJurisdictions: vi.fn(async () => []),
      validateSubstituteAddress: vi.fn(async (request) => ({
        valid: false as const,
        jurisdictionKey: request.jurisdictionKey,
        reason: 'not-recognized' as const,
        message: 'This is not a recognized substitute address for the selected program.',
      })),
    };

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Protected home address');
    await clickButton('Reveal protected value');
    const input = container?.querySelector('.formspec-safe-address-field input') as HTMLInputElement;
    if (!input) throw new Error('safe-address input not found');

    await act(async () => {
      input.focus();
      fireEvent.change(input, { target: { value: '123 Private St' } });
      await tick();
      input.blur();
      await tick();
    });
    await clickSubmit();
    await waitForText('We could not submit this form.');
    await waitForText('This is not a recognized substitute address');

    expect(composition.submitTransport.submit).not.toHaveBeenCalled();
  });

  it('persists multi-party progress across identity changes and submits aggregate party responses', async () => {
    const identityProvider = new SwitchingIdentityProvider('subject-a');
    const definition: FormDefinition = {
      $formspec: '1.0',
      url: 'https://test.example/forms/joint',
      version: '1.0.0',
      title: 'Joint filing',
      items: [],
    };
    const formPolicy: FormRuntimePolicy = {
      features: { respondentPlace: 'optional', status: 'optional', multiParty: 'required' },
      limits: {
        multiParty: {
          tier: 'coEqual',
          invitationChannel: 'magic-link',
          parties: [
            {
              roleId: 'spouse-a',
              label: 'Spouse A',
              role: 'coEqual',
              cardinality: { min: 1, max: 1 },
              visibilityScope: 'shared',
            },
            {
              roleId: 'spouse-b',
              label: 'Spouse B',
              role: 'coEqual',
              cardinality: { min: 1, max: 1 },
              visibilityScope: 'shared',
            },
          ],
        },
      },
    };
    const composition = testComposition(identityProvider, { definition, formPolicy });
    composition.draftStore = stubDraftStore();
    composition.instanceCapabilities = {
      ...composition.instanceCapabilities,
      multiParty: 'available',
    };
    composition.orgRuntimePolicy = {
      ...composition.orgRuntimePolicy,
      features: {
        ...composition.orgRuntimePolicy.features,
        multiParty: 'allowed',
      },
    };

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Current signer: Spouse A');
    const subjectADraftKey = {
      formUrl: definition.url,
      formVersion: definition.version,
      subjectRef: 'subject-a',
    };
    await clickSubmit();
    await waitForText('Spouse B can review their part and sign next.');
    expect(composition.submitTransport.submit).not.toHaveBeenCalled();
    await expect(composition.draftStore.load(multiPartyProgressDraftKey({
      formUrl: definition.url,
      formVersion: definition.version,
    }))).resolves.toBeDefined();
    await clickSubmit();
    await act(async () => {
      await tick();
    });
    expect(composition.submitTransport.submit).not.toHaveBeenCalled();
    await expect(composition.draftStore.load(multiPartyDraftKey(
      subjectADraftKey,
      'spouse-b',
    ))).resolves.toBeUndefined();

    await act(async () => {
      root?.unmount();
      await tick();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    await renderRuntime(composition);
    await waitForText('Current signer: Spouse B');
    await clickSubmit();
    await waitForText('Each party must sign with a distinct authenticated identity.');
    expect(composition.submitTransport.submit).not.toHaveBeenCalled();
    await expect(composition.draftStore.load(multiPartyDraftKey(
      subjectADraftKey,
      'spouse-b',
    ))).resolves.toBeUndefined();

    await act(async () => {
      identityProvider.switchTo('subject-b');
      await tick();
    });
    await waitFor(() => text().includes('Current signer: Spouse B') && !text().includes('Saved for the next signer'));
    await clickSubmit();
    await waitForText('TEST-0001');

    expect(composition.submitTransport.submit).toHaveBeenCalledOnce();
    const handoff = vi.mocked(composition.submitTransport.submit).mock.calls[0]?.[0] as IntakeHandoff;
    expect(handoff.extensions?.['x-formspec-multi-party']).toMatchObject({
      partySignatures: [
        { partyRef: 'spouse-a', subjectRef: 'subject-a' },
        { partyRef: 'spouse-b', subjectRef: 'subject-b' },
      ],
    });
    const responseData = handoff.extensions?.['x-formspec-response-data'] as Record<string, unknown>;
    expect(responseData['x-formspec-multi-party']).toMatchObject({
      partyResponses: [
        { partyRef: 'spouse-a', subjectRef: 'subject-a' },
        { partyRef: 'spouse-b', subjectRef: 'subject-b' },
      ],
    });
  });

  async function renderRuntime(
    composition: Composition,
    config: FormspecWebConfig = departmentAppProfile,
  ): Promise<void> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<RespondentRuntime composition={composition} config={config} />);
    });
  }

  async function clickButton(label: string): Promise<void> {
    const button = Array.from(container?.querySelectorAll('button') ?? [])
      .find((candidate) => candidate.textContent?.includes(label));
    if (!button) {
      throw new Error(`button not found: ${label}`);
    }
    await act(async () => {
      button.click();
      await tick();
    });
  }

  async function clickSubmit(): Promise<void> {
    const button = Array.from(container?.querySelectorAll('button') ?? [])
      .find((candidate) => candidate.textContent?.toLowerCase().includes('submit'));
    if (!button) {
      throw new Error('submit button not found');
    }
    await act(async () => {
      button.click();
      await tick();
    });
  }

  async function waitForText(expected: string, timeoutMs = 2000): Promise<void> {
    const started = Date.now();
    while (!text().includes(expected)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for text: ${expected}\n\n${text()}`);
      }
      await act(async () => {
        await tick();
      });
    }
  }

  async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for condition\n\n${text()}`);
      }
      await act(async () => {
        await tick();
      });
    }
  }

  function text(): string {
    return container?.textContent ?? '';
  }
});

class TestIdentityProvider implements IdentityProvider {
  readonly authenticate = vi.fn(async (option: IdpOption): Promise<IdentityClaim> => {
    if (this.error) {
      throw this.error;
    }
    this.current = testClaimForOption(option, this.init.subjectRef);
    for (const listener of this.listeners) {
      listener(this.current);
    }
    return this.current;
  });

  readonly discover = vi.fn(async (formAssuranceRequirements?: IdentityClaim['assuranceLevel']): Promise<IdpOption[]> => {
    const options = this.init.options
      ? [...this.init.options]
      : [
          {
            kind: 'oidc',
            issuer: 'https://idp.example.test',
            displayName: 'Example IdP',
            minAssurance: 'L2',
          } as const,
        ];
    if (!formAssuranceRequirements || this.init.honorAssuranceFilter === false) {
      return options;
    }
    return options.filter(
      (option) => assuranceRank(option.minAssurance) >= assuranceRank(formAssuranceRequirements),
    );
  });

  private readonly listeners = new Set<(claim: IdentityClaim | null) => void>();
  private current: IdentityClaim | null = null;

  constructor(
    private readonly init: {
      error?: unknown;
      honorAssuranceFilter?: boolean;
      options?: readonly IdpOption[];
      subjectRef?: string;
    } = {},
  ) {}

  private get error(): unknown {
    return this.init.error;
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    this.current = null;
    for (const listener of this.listeners) {
      listener(null);
    }
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}

class SwitchingIdentityProvider implements IdentityProvider {
  readonly authenticate = vi.fn(async (_option: IdpOption): Promise<IdentityClaim> => {
    this.current = testClaimForSubject(this.subjectRef);
    for (const listener of this.listeners) {
      listener(this.current);
    }
    return this.current;
  });

  readonly discover = vi.fn(async (): Promise<IdpOption[]> => [
    {
      kind: 'oidc',
      issuer: 'https://idp.example.test',
      displayName: 'Example IdP',
      minAssurance: 'L2',
    },
  ]);

  private readonly listeners = new Set<(claim: IdentityClaim | null) => void>();
  private current: IdentityClaim | null = null;

  constructor(private subjectRef: string) {}

  switchTo(subjectRef: string): void {
    this.subjectRef = subjectRef;
    this.current = testClaimForSubject(subjectRef);
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    this.current = null;
    for (const listener of this.listeners) {
      listener(null);
    }
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}

function testComposition(
  identityProvider: IdentityProvider,
  options: {
    applicantStatus?: ApplicantStatusResource;
    componentDocument?: ComponentDocument | null;
    componentGraph?: ComponentGraphProjectionContext | null;
    hostEvidence?: LayoutHostEvidence | null;
    definition?: FormDefinition;
    initialDefinitionUrl?: string;
    localeDocuments?: readonly LocaleDocument[];
    respondentPlace?: RespondentPlaceSnapshot;
    formPolicy?: FormRuntimePolicy;
  } = {},
  _config?: FormspecWebConfig,
): Composition {
  const definition = options.definition ?? demoSampleForm;
  return {
    mode: 'production',
    initialDefinitionUrl: options.initialDefinitionUrl ?? definition.url,
    definitionSource: {
      getDefinition: vi.fn(async () => definition),
      getLocaleDocuments: vi.fn(async () => [...(options.localeDocuments ?? [])]),
      getComponentDocument: vi.fn(async () => options.componentDocument ?? null),
      getComponentGraphContext: vi.fn(async () => options.componentGraph ?? null),
      getLayoutHostEvidence: vi.fn(async () => options.hostEvidence ?? null),
    },
    draftStore: {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      delete: vi.fn(async () => undefined),
      invalidateSubject: vi.fn(async () => undefined),
    },
    submitTransport: {
      submit: vi.fn(async () => ({
        referenceNumber: 'TEST-0001',
        status: 'accepted' as const,
      })),
    },
    identityProvider,
    respondentPlaceSource: {
      readPlace: vi.fn(async (): Promise<RespondentPlaceSnapshot> => (
        options.respondentPlace ?? emptyRespondentPlaceSnapshot()
      )),
    },
    statusReader: {
      readStatus: vi.fn(async () => options.applicantStatus),
    },
    attachmentStore: {
      upload: vi.fn(async () => {
        throw new Error('upload not used in this test');
      }),
    },
    respondentHistorySource: {
      readHistory: vi.fn(async () => {
        throw new Error('readHistory not used in this test');
      }),
    },
    offlineSubmitQueue: {
      enqueue: vi.fn(async () => {
        throw new Error('enqueue not used in this test');
      }),
      replay: vi.fn(async () => []),
      pending: vi.fn(async () => []),
    },
    paymentRailAdapter: {
      authorize: vi.fn(async () => {
        throw new Error('authorize not used in this test');
      }),
      capture: vi.fn(async () => {
        throw new Error('capture not used in this test');
      }),
      voidAuthorization: vi.fn(async () => undefined),
    },
    embedTransport: {
      isEmbedded: vi.fn(() => false),
      hostOrigin: vi.fn(() => null),
      postMessage: vi.fn(() => undefined),
      subscribeFromHost: vi.fn(() => () => undefined),
    },
    screenerDocumentSource: {
      readScreener: vi.fn(async () => {
        throw new Error('respondent runtime tests do not exercise screener');
      }),
    },
    ...unavailablePreallocatedFeaturePorts(),
    // ADR-0011: production-mode composition with both seeded capabilities
    // available and the form opting both in. Without the form opt-in the
    // resolver would mark both `not-requested` (org=allowed + form=silent)
    // and Task 12b's gating would hide the panel — these tests assert on
    // panel content, so they need the features enabled.
    instanceCapabilities: {
      respondentPlace: 'available',
      status: 'available',
      // FW-0056: closed-taxonomy key — declare for resolver input validity.
      // The in-form respondent surface doesn't consume documentPresentation.
      documentPresentation: 'available',
      // FW-0033: closed-taxonomy key — the runtime test form has no
      // attachment field, so 'unavailable' satisfies the resolver without
      // forcing an upload affordance into these tests.
      fileUpload: 'unavailable',
      // FW-0057: closed-taxonomy key — in-form surface doesn't consume
      // crossIssuerHistory; 'unavailable' keeps the resolver happy.
      crossIssuerHistory: 'unavailable',
      // FW-0044: closed-taxonomy key — this test does not exercise the
      // offline path; the form does not declare it, so 'unavailable' is
      // honest and the resolver records 'not-requested'.
      offlineSubmit: 'unavailable',
      // FW-0027: closed-taxonomy key — this test does not exercise the
      // payment path; the form does not declare it, so 'unavailable' is
      // honest and the resolver records 'not-requested'.
      payment: 'unavailable',
      // FW-0040: closed-taxonomy key — this test does not exercise the
      // embed path; the form does not declare it.
      embed: 'unavailable',
      // FW-0046: closed-taxonomy key — the in-form respondent surface
      // doesn't consume the screener; 'unavailable' satisfies the resolver.
      screener: 'unavailable',
      trustedReviewer: 'unavailable',
      preparerFiling: 'unavailable',
      bringYourOwnAssistant: 'unavailable',
      safeAddress: 'unavailable',
      duressAware: 'unavailable',
      multiParty: 'unavailable',
      recordLifecycle: 'unavailable',
    },
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
        crossIssuerHistory: 'allowed',
        offlineSubmit: 'allowed',
        payment: 'allowed',
        embed: 'allowed',
        screener: 'allowed',
      },
    },
    formRuntimePolicyExtractor: {
      extract: () => options.formPolicy ?? ({
        features: { respondentPlace: 'optional', status: 'optional' },
      }),
    },
  };
}

function componentDocumentForRuntime(): ComponentDocument {
  return {
    $formspecComponent: '1.2',
    url: 'https://components.example.test/respondent',
    version: '1.0.0',
    targetSurfaceRoutes: [
      {
        surface: {
          url: 'https://surfaces.example.test/intake',
          version: '1.0.0',
        },
        route: 'apply',
      },
    ],
    tree: {
      component: 'Stack',
      id: 'root-stack',
      children: [
        {
          component: 'TextInput',
          bind: 'notes',
          id: 'notes-node',
        },
      ],
    },
  } as unknown as ComponentDocument;
}

function uiGraphPolicyHostEvidence(
  reportSource = 'host://policy/respondent-ui-policy',
): LayoutHostEvidence {
  const policySource = 'host://policy/respondent-ui-policy';
  return {
    appGraphReport: {
      ok: true,
      summary: {
        artifacts: 0,
        loadedArtifacts: 0,
        schemaFailures: 0,
        unvalidatedArtifacts: 0,
        graphErrors: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        importedDiagnostics: 0,
        unsupportedFeatures: 0,
        skippedPhases: 0,
      },
      schemaResults: [],
      evidenceResults: [{
        evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
        schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
        source: reportSource,
        status: 'completed',
        ok: true,
        diagnostics: [],
      }],
      diagnostics: [],
      phases: [
        { phase: 'schema', status: 'completed' },
        { phase: 'cross-artifact', status: 'completed' },
      ],
    },
    uiGraphPolicies: [{
      schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
      source: policySource,
      document: {
        $formspecUiGraphPolicy: '0.1',
        version: '1.0.0',
        targetSurface: {
          url: 'https://surfaces.example.test/intake',
          version: '1.0.0',
        },
        routePolicies: [{
          routeId: 'apply',
          a11y: {
            landmark: 'main',
            keyboardNavigation: true,
          },
          responsive: {
            minColumns: 1,
            collapseOrder: ['summary', 'details'],
          },
          definitionVisibility: {
            hiddenDefinitionRefs: [{
              url: 'https://forms.example.test/internal-notes',
              version: '1.0.0',
            }],
          },
        }],
      },
    }],
  };
}

function emptyRespondentPlaceSnapshot(): RespondentPlaceSnapshot {
  return {
    $formspecRespondentLibrary: '1.0',
    version: '1.0.0',
    libraryId: 'urn:formspec:respondent-library:test',
    subject: {
      subjectRef: 'oidc:test-subject',
      privacyTier: 'pseudonymous',
    },
    aggregationMode: 'client-wallet',
    trustModel: {
      storagePosture: 'client-local-only',
      issuerIsolation: 'per-issuer',
      serverAggregation: 'forbidden',
      presentationDefault: 'explicit-consent',
    },
    obligations: [],
    documents: [],
    submissions: [],
    presentationPolicies: [],
  };
}

function respondentPlaceSnapshotWithData(
  overrides: Partial<RespondentSubmissionRecord> = {},
): RespondentPlaceSnapshot {
  return {
    ...emptyRespondentPlaceSnapshot(),
    obligations: [
      {
        id: 'renew-benefits',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        title: 'Renew household benefits',
        state: 'due',
        dueAt: '2026-06-30T23:59:59.000Z',
      },
    ],
    documents: [
      {
        id: 'doc-proof-address',
        kind: 'proof-of-address',
        displayName: 'Utility bill',
        capturedAt: '2026-05-01T12:00:00.000Z',
        contentRef: {
          uri: 'urn:formspec:blob:sha256:abc123',
          mediaType: 'application/pdf',
          sha256: 'abc123',
        },
      },
    ],
    submissions: [
      {
        id: 'sub-test-0001',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        definitionRef: {
          url: demoSampleForm.url,
          version: demoSampleForm.version,
        },
        submittedAt: '2026-05-23T12:00:00.000Z',
        applicantStatus: overrides.applicantStatus ?? {
          sourceSchema: 'https://schemas.formspec.io/wos-api/applicant/v1',
          projectionKind: 'ApplicantStatusTimelineEntry',
          resourceRef: 'urn:wos:case_test_0001',
          updatedAt: '2026-05-24T12:00:00.000Z',
          headline: 'Received',
          summary: 'Your submission was received.',
        },
        documentRefs: ['doc-proof-address'],
        ...overrides,
      },
    ],
  };
}

function testClaimForOption(option: IdpOption, subjectRef?: string): IdentityClaim {
  if (option.kind === 'anonymous') {
    return {
      provider: 'anonymous',
      adapter: 'test-anonymous',
      subjectRef: subjectRef ?? 'anonymous:test-subject',
      credentialType: 'other',
      subjectBinding: 'respondent',
      assuranceLevel: 'L1',
      privacyTier: 'anonymous',
    };
  }

  return {
    provider: option.kind === 'oidc' ? option.issuer : `magic-link:${option.channel}`,
    adapter: 'test-oidc',
    subjectRef: subjectRef ?? 'oidc:test-subject',
    credentialType: option.kind === 'oidc' ? 'oidc-token' : 'provider-assertion',
    subjectBinding: 'respondent',
    assuranceLevel: option.minAssurance,
    privacyTier: 'pseudonymous',
  };
}

function testClaimForSubject(subjectRef: string): IdentityClaim {
  return {
    provider: 'https://idp.example.test',
    adapter: 'test-oidc',
    subjectRef,
    credentialType: 'oidc-token',
    subjectBinding: 'respondent',
    assuranceLevel: 'L2',
    privacyTier: 'pseudonymous',
  };
}

function assuranceRank(level: IdentityClaim['assuranceLevel']): number {
  return Number(level.slice(1));
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
