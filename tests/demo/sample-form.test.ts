import { describe, expect, it } from 'vitest';
import { demoSampleForm } from '../../src/demo/index.ts';

describe('demo sample form fixture', () => {
  it('is branded with an inline issuer document', () => {
    expect(demoSampleForm.issuer).toMatchObject({
      $formspecIssuer: '1.0',
      kind: 'department',
      shortName: 'DBO',
    });
  });

  it('declares English and Spanish locale metadata', () => {
    expect(demoSampleForm.extensions?.['x-formspec-locales']).toMatchObject({
      default: 'en',
      available: ['en', 'es'],
    });
  });

  it('covers required, optional, repeat, and conditional fields', () => {
    const bindPaths = new Set(demoSampleForm.binds?.map((bind) => bind.path));
    expect(bindPaths.has('applicant.fullName')).toBe(true);
    expect(bindPaths.has('applicant.preferredLanguage')).toBe(true);
    expect(JSON.stringify(demoSampleForm.items)).toContain('"repeatable":true');
    expect(JSON.stringify(demoSampleForm.items)).toContain('"phone"');
    expect(demoSampleForm.binds?.some((bind) => bind.relevant)).toBe(true);
  });
});
