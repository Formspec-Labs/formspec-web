import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { sampleFormResponse, sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import {
  assertIdentityPolicySatisfied,
  buildIntakeHandoff,
  formAssuranceFloorForDefinition,
  hydrateEngineFromData,
  identityClaimMeetsAssurance,
  identitySubjectChanged,
  isIdentityInteractionStarted,
  selectBootIdentityOption,
  signInOptionsForIdentityPolicy,
  subjectRefInvalidatedByIdentityChange,
  submitOrQueue,
  submitWithPayment,
} from '../../src/app/respondent-flow.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import type { FormDefinition } from '@formspec-org/types';
import type { IdentityClaim } from '../../src/ports/identity-provider.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../../src/adapters/stub/payment-rail-adapter.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import type { RuntimeFeatureKey } from '../../src/policy/feature-keys.ts';
import type { ResolvedRuntimeProfile } from '../../src/policy/index.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';

beforeAll(async () => {
  await initFormspecEngine();
});

describe('respondent flow helpers', () => {
  it('hydrates flat and repeat data through the engine', () => {
    const engine = createFormEngine(demoSampleForm);
    hydrateEngineFromData(engine, {
      applicant: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.test',
        preferredContact: 'email',
      },
      household: [
        { memberName: 'Ada Lovelace', memberAge: 36 },
        { memberName: 'Charles Babbage', memberAge: 64 },
      ],
    });

    const response = engine.getResponse({ profile: 'off' });
    expect(response.data).toMatchObject({
      applicant: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.test',
        preferredContact: 'email',
      },
      household: [
        { memberName: 'Ada Lovelace', memberAge: 36 },
        { memberName: 'Charles Babbage', memberAge: 64 },
      ],
    });
    engine.dispose();
  });

  it('builds a public-intake handoff with a response digest', async () => {
    const idempotencyKey = generateIdempotencyKey();
    const handoff = await buildIntakeHandoff({
      definition: demoSampleForm,
      response: sampleFormResponse,
      validationReport: null,
      draftKey: { formUrl: demoSampleForm.url, formVersion: demoSampleForm.version },
      claim: null,
      idempotencyKey,
    });

    expect(handoff).toMatchObject({
      $formspecIntakeHandoff: '1.0',
      initiationMode: 'publicIntake',
      definitionRef: {
        url: demoSampleForm.url,
        version: demoSampleForm.version,
      },
      responseRef: `response:${sampleFormResponse.id ?? idempotencyKey}`,
      validationReportRef: 'validation:none',
    });
    expect(handoff.extensions).toMatchObject({
      'x-formspec-response-data': sampleFormResponse.data,
    });
    // FW-0064: the web-runtime draft key no longer rides through extensions.
    // The HTTP adapter cohort derives the binding from
    // `handoff.definitionRef + handoff.subjectRef`. Regression guard so the
    // smell does not silently come back.
    expect(handoff.extensions).not.toHaveProperty('x-formspec-draft-key');
    expect(handoff.responseHash).toMatch(/^sha256:[a-f0-9]+$/);
  });

  it('selects no boot identity when no anonymous option is on offer', () => {
    // Without anonymous in the discovered set there is nothing for boot to
    // auto-select; the picker (or boot-time auth-required surface) decides.
    expect(
      selectBootIdentityOption([
        { kind: 'oidc', issuer: 'https://idp.example.test', displayName: 'IdP', minAssurance: 'L3' },
        { kind: 'magic-link', channel: 'email', minAssurance: 'L2' },
      ]),
    ).toBeUndefined();
  });

  it('auto-selects anonymous at boot when anonymous is on offer and the picker will not render', () => {
    // Picker suppressed (demo mode, oidc-required where the policy filters
    // anonymous out anyway, or single-option deployments) → boot
    // auto-selects anonymous if present.
    expect(
      selectBootIdentityOption([
        { kind: 'oidc', issuer: 'https://idp.example.test', displayName: 'IdP', minAssurance: 'L3' },
        { kind: 'anonymous', minAssurance: 'L1' },
      ]),
    ).toMatchObject({ kind: 'anonymous' });
    expect(
      selectBootIdentityOption([{ kind: 'anonymous', minAssurance: 'L1' }]),
    ).toMatchObject({ kind: 'anonymous' });
  });

  it('FW-0028: suppresses anonymous auto-select at boot when the picker will render', () => {
    // The user must see the choice; without this gate, anonymous-allowed
    // deployments would silently boot anonymous and never reach the picker.
    expect(
      selectBootIdentityOption(
        [
          { kind: 'oidc', issuer: 'https://idp.example.test', displayName: 'IdP', minAssurance: 'L3' },
          { kind: 'anonymous', minAssurance: 'L1' },
        ],
        true,
      ),
    ).toBeUndefined();
  });

  it('offers OIDC-only options for production OIDC-required profiles (anonymous filtered out)', () => {
    const options = [
      { kind: 'oidc', issuer: 'https://idp.example.test', displayName: 'IdP', minAssurance: 'L3' },
      { kind: 'magic-link', channel: 'email', minAssurance: 'L2' },
      { kind: 'anonymous', minAssurance: 'L1' },
    ] as const;

    expect(
      signInOptionsForIdentityPolicy({
        options,
        identityMode: 'oidc-required',
        runtimeMode: 'production',
      }),
    ).toEqual([options[0]]);
    expect(
      signInOptionsForIdentityPolicy({
        options,
        identityMode: 'oidc-required',
        runtimeMode: 'demo',
      }),
    ).toEqual([]);
  });

  it('FW-0028: shows the full picker in anonymous-allowed production when more than one option exists', () => {
    const oidcA = {
      kind: 'oidc',
      issuer: 'https://idp-a.example.test',
      displayName: 'IdP A',
      minAssurance: 'L3',
    } as const;
    const oidcB = {
      kind: 'oidc',
      issuer: 'https://idp-b.example.test',
      displayName: 'IdP B',
      minAssurance: 'L2',
    } as const;
    const anon = { kind: 'anonymous', minAssurance: 'L1' } as const;

    // Single anonymous option — no picker, boot auto-selects.
    expect(
      signInOptionsForIdentityPolicy({
        options: [anon],
        identityMode: 'anonymous-allowed',
        runtimeMode: 'production',
      }),
    ).toEqual([]);

    // Anonymous + OIDC — picker shows both so the user can opt into the
    // higher-assurance path.
    expect(
      signInOptionsForIdentityPolicy({
        options: [oidcA, anon],
        identityMode: 'anonymous-allowed',
        runtimeMode: 'production',
      }),
    ).toEqual([oidcA, anon]);

    // Multiple OIDC + anonymous — every option in the discovered order.
    expect(
      signInOptionsForIdentityPolicy({
        options: [oidcA, oidcB, anon],
        identityMode: 'anonymous-allowed',
        runtimeMode: 'production',
      }),
    ).toEqual([oidcA, oidcB, anon]);

    // Demo mode never shows the picker; the runtime stays on the demo path.
    expect(
      signInOptionsForIdentityPolicy({
        options: [oidcA, anon],
        identityMode: 'anonymous-allowed',
        runtimeMode: 'demo',
      }),
    ).toEqual([]);
  });

  it('FW-0028 M-3: single interactive option in anonymous-allowed mode renders the picker (no silent auto-skip)', () => {
    // Anonymous-allowed deployment with one OIDC option and no anonymous
    // path: the prior `length > 1` predicate short-circuited to `[]` →
    // applyReadyState(null) → form rendered with no claim. The OIDC button
    // was offered but never reachable. The corrected predicate keeps the
    // single-anonymous auto-select but renders the picker when the only
    // option requires explicit user action.
    const oidc = {
      kind: 'oidc',
      issuer: 'https://idp-single.example.test',
      displayName: 'Solo IdP',
      minAssurance: 'L2',
    } as const;
    expect(
      signInOptionsForIdentityPolicy({
        options: [oidc],
        identityMode: 'anonymous-allowed',
        runtimeMode: 'production',
      }),
    ).toEqual([oidc]);
    // Single magic-link option — same rule, renders the picker so the user
    // can request the link.
    const magic = {
      kind: 'magic-link',
      channel: 'email',
      minAssurance: 'L2',
    } as const;
    expect(
      signInOptionsForIdentityPolicy({
        options: [magic],
        identityMode: 'anonymous-allowed',
        runtimeMode: 'production',
      }),
    ).toEqual([magic]);
    // Single anonymous — boot auto-selects (no picker).
    expect(
      signInOptionsForIdentityPolicy({
        options: [{ kind: 'anonymous', minAssurance: 'L1' }],
        identityMode: 'anonymous-allowed',
        runtimeMode: 'production',
      }),
    ).toEqual([]);
  });

  it('FW-0028 slice 2: extracts the form assurance floor from the EXT-8 metadata shape', () => {
    const definition = {
      ...demoSampleForm,
      metadata: {
        assurance: {
          ial: 'L2',
          aal: 'L3',
          jurisdiction: 'US',
        },
      },
    } as FormDefinition;

    expect(formAssuranceFloorForDefinition(definition)).toBe('L3');
    expect(identityClaimMeetsAssurance(claim('subject-l2', 'L2'), 'L3')).toBe(false);
    expect(identityClaimMeetsAssurance(claim('subject-l4', 'L4'), 'L3')).toBe(true);
    expect(identityClaimMeetsAssurance(null, 'L1')).toBe(false);
  });

  it('FW-0028 slice 2: rejects invalid EXT-8 assurance values loudly', () => {
    const definition = {
      ...demoSampleForm,
      metadata: { assurance: { aal: 'AAL2' } },
    } as FormDefinition;

    expect(() => formAssuranceFloorForDefinition(definition)).toThrow(
      /metadata\.assurance\.aal/,
    );
  });

  it('FW-0028 slice 2: treats jurisdiction as metadata but validates the string shape', () => {
    const definition = {
      ...demoSampleForm,
      metadata: { assurance: { aal: 'L2', jurisdiction: 123 } },
    } as FormDefinition;

    expect(() => formAssuranceFloorForDefinition(definition)).toThrow(
      /metadata\.assurance\.jurisdiction/,
    );
  });

  it('recognizes the narrow identity redirect-started signal', () => {
    const redirectStarted = new Error('redirect started');
    redirectStarted.name = 'IdentityInteractionStartedError';

    expect(isIdentityInteractionStarted(redirectStarted)).toBe(true);
    expect(isIdentityInteractionStarted(new Error('OIDC unavailable'))).toBe(false);
  });

  it('invalidates the prior draft subject when identity changes or revokes', () => {
    const previous = claim('subject-1');
    expect(subjectRefInvalidatedByIdentityChange(null, previous)).toBeUndefined();
    expect(subjectRefInvalidatedByIdentityChange(previous, claim('subject-1'))).toBeUndefined();
    expect(subjectRefInvalidatedByIdentityChange(previous, claim('subject-2'))).toBe('subject-1');
    expect(subjectRefInvalidatedByIdentityChange(previous, null)).toBe('subject-1');
  });

  it('detects subject changes even when there is no prior subject to invalidate', () => {
    const previous = claim('subject-1');
    expect(identitySubjectChanged(null, null)).toBe(false);
    expect(identitySubjectChanged(null, previous)).toBe(true);
    expect(identitySubjectChanged(previous, claim('subject-1'))).toBe(false);
    expect(identitySubjectChanged(previous, null)).toBe(true);
  });

  it('fails closed for production OIDC-required profiles without a claim', () => {
    expect(() =>
      assertIdentityPolicySatisfied({
        claim: null,
        identityMode: 'oidc-required',
        runtimeMode: 'production',
      }),
    ).toThrow(/requires sign-in/);
    expect(() =>
      assertIdentityPolicySatisfied({
        claim: null,
        identityMode: 'oidc-required',
        runtimeMode: 'demo',
      }),
    ).not.toThrow();
    expect(() =>
      assertIdentityPolicySatisfied({
        claim: claim('subject-1'),
        identityMode: 'oidc-required',
        runtimeMode: 'production',
      }),
    ).not.toThrow();
  });
});

function claim(subjectRef: string, assuranceLevel: IdentityClaim['assuranceLevel'] = 'L1'): IdentityClaim {
  return {
    provider: 'test',
    adapter: 'test',
    subjectRef,
    credentialType: 'other',
    subjectBinding: 'respondent',
    assuranceLevel,
  };
}

function profile(enabled: ReadonlyArray<string> = []): ResolvedRuntimeProfile {
  return {
    mode: 'demo',
    enabled: new Set(enabled as ReadonlyArray<RuntimeFeatureKey>),
    disabled: new Map(),
    limits: {},
  } as ResolvedRuntimeProfile;
}

function productionProfile(enabled: ReadonlyArray<string> = []): ResolvedRuntimeProfile {
  return {
    mode: 'production',
    enabled: new Set(enabled as ReadonlyArray<RuntimeFeatureKey>),
    disabled: new Map(),
    limits: {},
  } as ResolvedRuntimeProfile;
}

function paymentRequiredDefinition(): FormDefinition {
  return {
    $formspec: '1.0',
    url: 'https://test.example/forms/payment',
    version: '1.0.0',
    title: 'Payment-required form',
    items: [],
    extensions: {
      'x-formspec-payment-required': true,
      'x-formspec-payment-amount': { amountMinorUnits: 2500, currency: 'USD' },
    },
  };
}

describe('submitOrQueue (FW-0044) — offline-aware submit routing', () => {
  it('routes to the transport when online (even if offlineSubmit enabled)', async () => {
    const transport = stubSubmitTransport();
    const queue = stubOfflineSubmitQueue({ transport });
    const transportSpy = vi.spyOn(transport, 'submit');
    const enqueueSpy = vi.spyOn(queue, 'enqueue');
    const outcome = await submitOrQueue({
      navigatorOnLine: true,
      runtimeProfile: profile(['offlineSubmit']),
      submitTransport: transport,
      offlineSubmitQueue: queue,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(outcome.kind).toBe('submitted');
    expect(transportSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('routes to the queue when offline AND offlineSubmit enabled', async () => {
    const transport = stubSubmitTransport();
    const queue = stubOfflineSubmitQueue({ transport });
    const transportSpy = vi.spyOn(transport, 'submit');
    const enqueueSpy = vi.spyOn(queue, 'enqueue');
    const key = generateIdempotencyKey();
    const outcome = await submitOrQueue({
      navigatorOnLine: false,
      runtimeProfile: profile(['offlineSubmit']),
      submitTransport: transport,
      offlineSubmitQueue: queue,
      handoff: sampleIntakeHandoff,
      idempotencyKey: key,
    });
    expect(outcome.kind).toBe('queued');
    if (outcome.kind === 'queued') {
      expect(outcome.queuedSubmit.idempotencyKey).toBe(key);
    }
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(transportSpy).not.toHaveBeenCalled();
  });

  it('routes to the transport when offline but offlineSubmit disabled (falls through to existing error path)', async () => {
    const transport = stubSubmitTransport();
    const queue = stubOfflineSubmitQueue({ transport });
    const transportSpy = vi.spyOn(transport, 'submit');
    const enqueueSpy = vi.spyOn(queue, 'enqueue');
    const outcome = await submitOrQueue({
      navigatorOnLine: false,
      runtimeProfile: profile([]),
      submitTransport: transport,
      offlineSubmitQueue: queue,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(outcome.kind).toBe('submitted');
    expect(transportSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('preserves the original idempotency key through the queue at replay', async () => {
    const transport = stubSubmitTransport();
    const queue = stubOfflineSubmitQueue({ transport });
    const transportSpy = vi.spyOn(transport, 'submit');
    const key = generateIdempotencyKey();
    await submitOrQueue({
      navigatorOnLine: false,
      runtimeProfile: profile(['offlineSubmit']),
      submitTransport: transport,
      offlineSubmitQueue: queue,
      handoff: sampleIntakeHandoff,
      idempotencyKey: key,
    });
    const outcomes = await queue.replay();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe('sent');
    expect(outcomes[0].idempotencyKey).toBe(key);
    expect(transportSpy).toHaveBeenCalledWith(sampleIntakeHandoff, key);
  });
});

describe('submitWithPayment (FW-0027) — authorize → submit → capture-or-void orchestration', () => {
  it('FW-0027 M-2: throws when invoked with payment disabled — caller must branch on paymentEnabled before calling (free-form path is submitOrQueue)', async () => {
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    const authorizeSpy = vi.spyOn(rail, 'authorize');
    const submitSpy = vi.spyOn(transport, 'submit');
    await expect(
      submitWithPayment({
        runtimeProfile: profile([]),
        definition: demoSampleForm,
        submitTransport: transport,
        paymentRailAdapter: rail,
        handoff: sampleIntakeHandoff,
        idempotencyKey: generateIdempotencyKey(),
      }),
    ).rejects.toThrow(/payment disabled/);
    // No rail call, no submit — fail loud, fail fast.
    expect(authorizeSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('authorizes, submits, and captures when payment is enabled (happy path)', async () => {
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    const outcome = await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(outcome.kind).toBe('submitted-with-payment');
    if (outcome.kind === 'submitted-with-payment') {
      expect(outcome.captureReceipt.amount).toEqual({
        amountMinorUnits: 2500,
        currency: 'USD',
      });
    }
    // Authorization state is captured.
    const states = rail._internalAuthorizationStates();
    expect([...states.values()][0]?.status).toBe('captured');
  });

  it('voids the authorization when submit fails (submit-fails-payment-voided)', async () => {
    const transport = stubSubmitTransport();
    vi.spyOn(transport, 'submit').mockRejectedValueOnce(new Error('intake unreachable'));
    const rail = stubPaymentRailAdapter();
    const outcome = await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(outcome.kind).toBe('submit-failed-payment-voided');
    const states = rail._internalAuthorizationStates();
    expect([...states.values()][0]?.status).toBe('voided');
  });

  it('returns authorize-failed when the rail throws on authorize (submit never runs)', async () => {
    const transport = stubSubmitTransport();
    const submitSpy = vi.spyOn(transport, 'submit');
    const rail = stubPaymentRailAdapter();
    rail.failNextAuthorize(new Error('card declined'));
    const outcome = await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(outcome.kind).toBe('authorize-failed');
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('returns capture-failed when submit lands but capture throws', async () => {
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    rail.failNextCapture(new Error('settlement queue down'));
    const outcome = await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(outcome.kind).toBe('capture-failed');
    if (outcome.kind === 'capture-failed') {
      // The submit IS in the system; the hold is still authorized (not voided).
      expect(outcome.authorization.amount.amountMinorUnits).toBe(2500);
    }
    const states = rail._internalAuthorizationStates();
    expect([...states.values()][0]?.status).toBe('authorized');
  });

  it('returns void-failed-after-submit-failure when both submit and void throw', async () => {
    const transport = stubSubmitTransport();
    vi.spyOn(transport, 'submit').mockRejectedValueOnce(new Error('intake unreachable'));
    const rail = stubPaymentRailAdapter();
    rail.failNextVoid(new Error('void service down'));
    const outcome = await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(outcome.kind).toBe('void-failed-after-submit-failure');
  });

  it('uses caller-supplied authorize / capture / void keys when provided (adopter reconciliation hook)', async () => {
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    const authorizeSpy = vi.spyOn(rail, 'authorize');
    const captureSpy = vi.spyOn(rail, 'capture');
    const authorizeKey = generateIdempotencyKey();
    const captureKey = generateIdempotencyKey();
    await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
      authorizeKey,
      captureKey,
    });
    expect(authorizeSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      authorizeKey,
    );
    expect(captureSpy).toHaveBeenCalledWith(expect.any(Object), captureKey);
  });

  it('uses fresh UUIDv7 keys when no override is supplied (port idempotency-key requirement)', async () => {
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    const authorizeSpy = vi.spyOn(rail, 'authorize');
    const captureSpy = vi.spyOn(rail, 'capture');
    await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey: generateIdempotencyKey(),
    });
    expect(authorizeSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    // The 3rd arg (idempotencyKey) on authorize must be UUIDv7-shaped.
    const authKey = authorizeSpy.mock.calls[0][2] as string;
    expect(authKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}/);
  });

  it('FW-0027 H-1+H-2: a runtime retry with the same orchestration idempotencyKey reuses the derived authorize/capture key triple (rail-side idempotency suppresses dupes)', async () => {
    // Root-domino fix: without deterministic derivation, a second call with
    // the same `idempotencyKey` would mint fresh UUIDv7s for authorize /
    // capture / void — the rail's same-key contract would no longer
    // suppress the second hold (= double-charge in production).
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    const authorizeSpy = vi.spyOn(rail, 'authorize');
    const captureSpy = vi.spyOn(rail, 'capture');
    const idempotencyKey = generateIdempotencyKey();

    const first = await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey,
    });
    const second = await submitWithPayment({
      runtimeProfile: profile(['payment']),
      definition: paymentRequiredDefinition(),
      submitTransport: transport,
      paymentRailAdapter: rail,
      handoff: sampleIntakeHandoff,
      idempotencyKey,
    });

    // Same authorize key, same capture key — both calls.
    const authKey1 = authorizeSpy.mock.calls[0][2] as string;
    const authKey2 = authorizeSpy.mock.calls[1][2] as string;
    expect(authKey1).toBe(authKey2);
    const capKey1 = captureSpy.mock.calls[0][1] as string;
    const capKey2 = captureSpy.mock.calls[1][1] as string;
    expect(capKey1).toBe(capKey2);
    // Authorize and capture keys differ from each other.
    expect(authKey1).not.toBe(capKey1);
    // The rail produced exactly ONE Authorization (same-key contract).
    const states = rail._internalAuthorizationStates();
    expect(states.size).toBe(1);
    // Both outcomes are happy-path; only one charge moved.
    expect(first.kind).toBe('submitted-with-payment');
    expect(second.kind).toBe('submitted-with-payment');
  });

  it('FW-0027 N-2: throws in production mode when no methodToken override and no form-declared method token (no demo-stub default leak)', async () => {
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    await expect(
      submitWithPayment({
        runtimeProfile: productionProfile(['payment']),
        definition: paymentRequiredDefinition(),
        submitTransport: transport,
        paymentRailAdapter: rail,
        handoff: sampleIntakeHandoff,
        idempotencyKey: generateIdempotencyKey(),
      }),
    ).rejects.toThrow(/payment method token/i);
  });

  it('throws when payment is enabled but the form has no amount declared', async () => {
    const transport = stubSubmitTransport();
    const rail = stubPaymentRailAdapter();
    const noAmountDefinition: FormDefinition = {
      ...paymentRequiredDefinition(),
      extensions: { 'x-formspec-payment-required': true },
    };
    await expect(
      submitWithPayment({
        runtimeProfile: profile(['payment']),
        definition: noAmountDefinition,
        submitTransport: transport,
        paymentRailAdapter: rail,
        handoff: sampleIntakeHandoff,
        idempotencyKey: generateIdempotencyKey(),
      }),
    ).rejects.toThrow(/payment-amount/);
  });
});


import {
  matchesAllowedOrigin,
  verifyEmbedOriginAllowed,
} from "../../src/app/respondent-flow.ts";
import { stubEmbedTransport } from "../../src/adapters/stub/embed-transport.ts";
import { unavailableEmbedTransport } from "../../src/adapters/unavailable/embed-transport.ts";
import { EmbedOriginNotAllowedError } from "../../src/policy/errors.ts";
import type { OrgRuntimePolicy } from "../../src/policy/index.ts";

function org(allowedOrigins: readonly string[] = []): OrgRuntimePolicy {
  return {
    features: { embed: "allowed" },
    limits: { embed: { allowedOrigins } },
  };
}

describe("matchesAllowedOrigin", () => {
  it("returns false for an empty allow-list", () => {
    expect(matchesAllowedOrigin("https://allowed.example.test", [])).toBe(false);
  });

  it("accepts wildcard", () => {
    expect(matchesAllowedOrigin("https://anywhere.example", ["*"])).toBe(true);
  });

  it("matches an exact origin", () => {
    expect(
      matchesAllowedOrigin("https://allowed.example.test", ["https://allowed.example.test"]),
    ).toBe(true);
  });

  it("rejects a different origin", () => {
    expect(
      matchesAllowedOrigin("https://attacker.example.test", ["https://allowed.example.test"]),
    ).toBe(false);
  });

  it("rejects a malformed host origin", () => {
    expect(matchesAllowedOrigin("not-a-url", ["https://allowed.example.test"])).toBe(false);
  });
});

describe("verifyEmbedOriginAllowed", () => {
  it("no-ops when embed is disabled in the resolved profile", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile([]),
        orgRuntimePolicy: org([]),
        embedTransport: stubEmbedTransport({
          embedded: true,
          hostOrigin: "https://attacker.example.test",
        }),
      }),
    ).not.toThrow();
  });

  it("no-ops when not embedded (top-level window)", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile(["embed"]),
        orgRuntimePolicy: org(["https://allowed.example.test"]),
        embedTransport: stubEmbedTransport({ embedded: false }),
      }),
    ).not.toThrow();
  });

  it("no-ops when embedded and host origin is in the allow-list", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile(["embed"]),
        orgRuntimePolicy: org(["https://allowed.example.test"]),
        embedTransport: stubEmbedTransport({
          embedded: true,
          hostOrigin: "https://allowed.example.test",
        }),
      }),
    ).not.toThrow();
  });

  it("no-ops when the wildcard is in the allow-list", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile(["embed"]),
        orgRuntimePolicy: org(["*"]),
        embedTransport: stubEmbedTransport({
          embedded: true,
          hostOrigin: "https://anywhere.example.test",
        }),
      }),
    ).not.toThrow();
  });

  it("throws EmbedOriginNotAllowedError when embedded with disallowed origin", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile(["embed"]),
        orgRuntimePolicy: org(["https://allowed.example.test"]),
        embedTransport: stubEmbedTransport({
          embedded: true,
          hostOrigin: "https://attacker.example.test",
        }),
      }),
    ).toThrow(EmbedOriginNotAllowedError);
  });

  it("throws EmbedOriginNotAllowedError when embedded with null host origin (fail-closed)", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile(["embed"]),
        orgRuntimePolicy: org(["https://allowed.example.test"]),
        embedTransport: stubEmbedTransport({ embedded: true }),
      }),
    ).toThrow(EmbedOriginNotAllowedError);
  });

  it("throws EmbedOriginNotAllowedError when allow-list is empty and embedded", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile(["embed"]),
        orgRuntimePolicy: org([]),
        embedTransport: stubEmbedTransport({
          embedded: true,
          hostOrigin: "https://allowed.example.test",
        }),
      }),
    ).toThrow(EmbedOriginNotAllowedError);
  });

  it("no-ops with the unavailable sentinel (isEmbedded returns false)", () => {
    expect(() =>
      verifyEmbedOriginAllowed({
        runtimeProfile: profile(["embed"]),
        orgRuntimePolicy: org(["https://allowed.example.test"]),
        embedTransport: unavailableEmbedTransport(),
      }),
    ).not.toThrow();
  });
});
