import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { sampleFormResponse, sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import {
  assertIdentityPolicySatisfied,
  buildIntakeHandoff,
  hydrateEngineFromData,
  identitySubjectChanged,
  isIdentityInteractionStarted,
  selectBootIdentityOption,
  signInOptionsForIdentityPolicy,
  subjectRefInvalidatedByIdentityChange,
  submitOrQueue,
} from '../../src/app/respondent-flow.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import type { IdentityClaim } from '../../src/ports/identity-provider.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
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

  it('only auto-selects anonymous identity at boot', () => {
    expect(
      selectBootIdentityOption([
        { kind: 'oidc', issuer: 'https://idp.example.test', displayName: 'IdP', minAssurance: 'L3' },
        { kind: 'magic-link', channel: 'email', minAssurance: 'L2' },
      ]),
    ).toBeUndefined();
    expect(
      selectBootIdentityOption([
        { kind: 'oidc', issuer: 'https://idp.example.test', displayName: 'IdP', minAssurance: 'L3' },
        { kind: 'anonymous', minAssurance: 'L1' },
      ]),
    ).toMatchObject({ kind: 'anonymous' });
  });

  it('offers explicit sign-in options only for production OIDC-required profiles', () => {
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
    expect(
      signInOptionsForIdentityPolicy({
        options,
        identityMode: 'anonymous-allowed',
        runtimeMode: 'production',
      }),
    ).toEqual([]);
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

function claim(subjectRef: string): IdentityClaim {
  return {
    provider: 'test',
    adapter: 'test',
    subjectRef,
    credentialType: 'other',
    subjectBinding: 'respondent',
    assuranceLevel: 'L1',
  };
}

function profile(enabled: ReadonlyArray<string> = []): ResolvedRuntimeProfile {
  return {
    mode: 'demo',
    enabled: new Set(enabled as ReadonlyArray<'offlineSubmit'>),
    disabled: new Map(),
    limits: {},
  } as ResolvedRuntimeProfile;
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
