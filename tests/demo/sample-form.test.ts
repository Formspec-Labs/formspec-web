import { beforeAll, describe, expect, it } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { demoSampleForm } from '../../src/demo/index.ts';
import { demoLocaleDocuments } from '../../src/demo/locales.ts';

beforeAll(async () => {
  await initFormspecEngine();
});

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
    expect(demoLocaleDocuments.map((doc) => doc.locale)).toEqual(['en', 'es']);
    expect(demoLocaleDocuments.every((doc) => (
      doc.target.kind === 'definition' && doc.target.url === demoSampleForm.url
    ))).toBe(
      true,
    );
  });

  it('localizes group and repeat children through bare Item keys', () => {
    const engine = createFormEngine(demoSampleForm);
    for (const document of demoLocaleDocuments) engine.loadLocale(document);
    engine.setLocale('es');

    expect(engine.getFieldVM('applicant.fullName')?.label.value).toBe('Nombre completo');
    expect(engine.getFieldVM('applicant.fullName')?.hint.value).toBe('Como aparece en su identificacion.');
    expect(engine.getFieldVM('household[0].memberName')?.label.value).toBe('Nombre del miembro');
    engine.dispose();
  });

  it('covers required, optional, repeat, and conditional fields', () => {
    const bindPaths = new Set(demoSampleForm.binds?.map((bind) => bind.path));
    expect(bindPaths.has('applicant.fullName')).toBe(true);
    expect(bindPaths.has('applicant.preferredLanguage')).toBe(true);
    expect(JSON.stringify(demoSampleForm.items)).toContain('"repeatable":true');
    expect(JSON.stringify(demoSampleForm.items)).toContain('"phone"');
    expect(demoSampleForm.binds?.some((bind) => bind.relevant)).toBe(true);
  });

  it('includes an optional attachment field for the refresh-surviving demo upload path', () => {
    expect(JSON.stringify(demoSampleForm.items)).toContain('"dataType":"attachment"');
    const bindPaths = new Set(demoSampleForm.binds?.map((bind) => bind.path));
    expect(bindPaths.has('supportingDocument')).toBe(false);
  });

  it('declares mobile keyboard hints for contact fields', () => {
    expect(JSON.stringify(demoSampleForm.items)).toContain('"inputMode":"email"');
    expect(JSON.stringify(demoSampleForm.items)).toContain('"inputMode":"tel"');
  });
});
