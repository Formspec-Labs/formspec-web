import { describe, expect, it } from 'vitest';
import { localeOptionsForDefinition } from '../../src/demo/locales.ts';
import { sampleFormDefinition } from '../../src/adapter-conformance/fixtures.ts';

describe('locale sidecar discovery', () => {
  it('offers a loaded definition-targeted language without changing authored definition bytes', () => {
    const definition = { ...sampleFormDefinition, extensions: undefined };
    const document = { $formspecLocale: '2.0' as const, version: '1.0.0', locale: 'es-US', target: { kind: 'definition' as const, url: definition.url }, strings: {} };
    expect(localeOptionsForDefinition(definition, [document, document])).toEqual([
      { code: 'en', label: 'English' }, { code: 'es-US', label: 'español (Estados Unidos)' },
    ]);
    expect(localeOptionsForDefinition(definition, [{ ...document, target: { ...document.target, url: 'urn:other' } }])).toEqual([{ code: 'en', label: 'English' }]);
  });
});
