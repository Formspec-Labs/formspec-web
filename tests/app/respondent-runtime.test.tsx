import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
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
  FormDefinition,
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

    expect(composition.definitionSource.getLocaleDocuments).toHaveBeenCalledWith(
      demoSampleForm.url,
      demoSampleForm.version,
    );
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
    expect(composition.definitionSource.getLocaleDocuments).toHaveBeenCalledWith(
      runtimeDefinitionUrl,
      canonicalDefinition.version,
    );
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

  it('FW-0028: keeps "Sign in to continue" heading when a single OIDC option is on offer', async () => {
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider);

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    expect(text()).not.toContain('Choose how to sign in');
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
    await expect(composition.draftStore.load(multiPartyDraftKey({
      formUrl: definition.url,
      formVersion: definition.version,
    }, 'spouse-b'))).resolves.toBeUndefined();

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
    await expect(composition.draftStore.load(multiPartyDraftKey({
      formUrl: definition.url,
      formVersion: definition.version,
    }, 'spouse-b'))).resolves.toBeUndefined();

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
    this.current = testClaimForOption(option);
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
    if (!formAssuranceRequirements) {
      return options;
    }
    return options.filter(
      (option) => assuranceRank(option.minAssurance) >= assuranceRank(formAssuranceRequirements),
    );
  });

  private readonly listeners = new Set<(claim: IdentityClaim | null) => void>();
  private current: IdentityClaim | null = null;

  constructor(
    private readonly init: { error?: unknown; options?: readonly IdpOption[] } = {},
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

function testClaimForOption(option: IdpOption): IdentityClaim {
  if (option.kind === 'anonymous') {
    return {
      provider: 'anonymous',
      adapter: 'test-anonymous',
      subjectRef: 'anonymous:test-subject',
      credentialType: 'other',
      subjectBinding: 'respondent',
      assuranceLevel: 'L1',
      privacyTier: 'anonymous',
    };
  }

  return {
    provider: option.kind === 'oidc' ? option.issuer : `magic-link:${option.channel}`,
    adapter: 'test-oidc',
    subjectRef: 'oidc:test-subject',
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
