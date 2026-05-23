import { beforeAll, describe, expect, it } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';
import {
  buildIntakeHandoff,
  hydrateEngineFromData,
  identitySubjectChanged,
  selectBootIdentityOption,
  subjectRefInvalidatedByIdentityChange,
} from '../../src/app/respondent-flow.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import type { IdentityClaim } from '../../src/ports/identity-provider.ts';
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
      'x-formspec-draft-key': {
        formUrl: demoSampleForm.url,
        formVersion: demoSampleForm.version,
      },
      'x-formspec-response-data': sampleFormResponse.data,
    });
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
