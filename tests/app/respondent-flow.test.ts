import { beforeAll, describe, expect, it } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';
import {
  buildIntakeHandoff,
  hydrateEngineFromData,
} from '../../src/app/respondent-flow.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
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
    expect(handoff.responseHash).toMatch(/^sha256:[a-f0-9]+$/);
  });
});
