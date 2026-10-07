import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createStaticResponseMetadataReader, type StaticResponseMetadataInput } from '@formspec-org/engine/static-presentation';
import { captureResponseFieldMetadata, type CapturedResponseFields, type ResponseFieldMetadataReader } from '@formspec-org/surface';
import type { AcceptedResponseReviewPresentation } from '@formspec-org/surface-react/widget-metadata';
import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
import { sampleFormDefinition, sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';

// Synthetic inputs test API behavior. They provide no accepted source or custody proof.
function fixture(): StaticResponseMetadataInput & { locale: LocaleDocument } {
  const definition: FormDefinition = { ...sampleFormDefinition, items: [{ key: 'rows', type: 'group', label: 'Rows', repeatable: true,
    children: [{ key: 'choice', type: 'field', dataType: 'choice', label: 'Inline choice', options: [{ value: 'a', label: 'Inline A' }] }] }] };
  const locale: LocaleDocument = { $formspecLocale: '2.0', url: 'urn:test:static-original:en', version: '1.0.0', locale: 'en',
    target: { kind: 'definition', url: definition.url }, strings: { 'rows.label': 'Original rows', 'choice.label': 'Original choice', 'choice.options.a.label': 'Original A' } };
  const response: FormResponse = { ...sampleFormResponse, data: { rows: [{ choice: 'a' }, { choice: 'a' }] },
    displayedLocale: { url: locale.url, version: locale.version, locale: locale.locale } };
  return { definition, response, locale };
}

describe('installed public static response metadata reader', () => {
  it('fits the public accepted fields type and keeps captured repeated wording detached', () => {
    const input = fixture();
    const reader: ResponseFieldMetadataReader = createStaticResponseMetadataReader(input);
    input.locale.strings['choice.label'] = 'Later label';
    input.locale.strings['choice.options.a.label'] = 'Later option';
    const fields: CapturedResponseFields = captureResponseFieldMetadata(input.definition, input.response, reader);
    const acceptedFields: AcceptedResponseReviewPresentation['fields'] = fields;
    expect(acceptedFields.rows.label).toBe('Original rows');
    expect(acceptedFields['rows[1].choice']).toEqual({ label: 'Original choice', options: [{ value: 'a', label: 'Original A' }] });
    const options = reader.options('rows[1].choice');
    if (!options) throw new Error('Expected qualified static options');
    options[0].label = 'Caller change';
    expect(reader.options('rows[1].choice')?.[0]?.label).toBe('Original A');
  });

  it('refuses a missing or mismatched recorded Locale URL in either direction', () => {
    const missingPin = fixture();
    Reflect.deleteProperty(missingPin.response.displayedLocale!, 'url');
    expect(() => createStaticResponseMetadataReader(missingPin)).toThrow('static-response-metadata-locale-mismatch');
    const missingDocument = fixture();
    Reflect.deleteProperty(missingDocument.locale, 'url');
    expect(() => createStaticResponseMetadataReader(missingDocument)).toThrow('static-response-metadata-locale-mismatch');
    const mismatch = fixture();
    mismatch.response.displayedLocale!.url = 'urn:test:other-original-locale';
    expect(() => createStaticResponseMetadataReader(mismatch)).toThrow('static-response-metadata-locale-mismatch');
  });

  it('supports matching absent generic URL identities without adding a Portal policy', () => {
    const input = fixture();
    Reflect.deleteProperty(input.response.displayedLocale!, 'url');
    Reflect.deleteProperty(input.locale, 'url');
    const reader = createStaticResponseMetadataReader(input);
    expect(reader.label('rows[0].choice')).toBe('Original choice');
  });

  it('refuses missing, regional, fallback and mismatched original Locale inputs', () => {
    const input = fixture();
    expect(() => createStaticResponseMetadataReader({ ...input, locale: null })).toThrow('static-response-metadata-locale-unavailable');
    const regional = fixture();
    regional.response.displayedLocale!.locale = 'en-US'; regional.locale.locale = 'en-US';
    expect(() => createStaticResponseMetadataReader(regional)).toThrow('static-response-metadata-fallback-unproven');
    const fallback = fixture(); fallback.locale.fallback = 'es';
    expect(() => createStaticResponseMetadataReader(fallback)).toThrow('static-response-metadata-fallback-unproven');
    const mismatch = fixture(); mismatch.locale.version = '2.0.0';
    expect(() => createStaticResponseMetadataReader(mismatch)).toThrow('static-response-metadata-locale-mismatch');
  });

  it('refuses interpolation, context alternatives and dynamic options before capture', () => {
    const interpolated = fixture(); interpolated.locale.strings['choice.label'] = 'Name {{name}}';
    expect(() => captureResponseFieldMetadata(interpolated.definition, interpolated.response, createStaticResponseMetadataReader(interpolated))).toThrow('static-response-metadata-interpolation-unproven');
    const context = fixture(); context.locale.strings['choice.label@review'] = 'Other context';
    expect(() => captureResponseFieldMetadata(context.definition, context.response, createStaticResponseMetadataReader(context))).toThrow('static-response-metadata-context-unproven');
    const dynamic = fixture(); dynamic.definition.items[0].children![0].optionFilter = 'true()';
    expect(() => captureResponseFieldMetadata(dynamic.definition, dynamic.response, createStaticResponseMetadataReader(dynamic))).toThrow('static-response-metadata-options-unproven');
  });

  it('refuses changed Definition identity and unavailable original paths', () => {
    const input = fixture();
    expect(() => createStaticResponseMetadataReader({ ...input, response: { ...input.response, definitionVersion: '2.0.0' } })).toThrow('static-response-metadata-definition-mismatch');
    expect(() => createStaticResponseMetadataReader(input).label('rows[9].choice')).toThrow('static-response-metadata-path-invalid');
  });

  it('loads and captures through installed public entries in a fresh process with network and WASM guards', () => {
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const operations = [];
      const originalRead = fs.readFileSync;
      fs.readFileSync = function(path, ...args) {
        if (String(path).endsWith('.wasm')) { operations.push('wasm-read'); throw new Error('WASM read forbidden'); }
        return originalRead.call(this, path, ...args);
      };
      syncBuiltinESMExports();
      globalThis.fetch = () => { operations.push('fetch'); throw new Error('Network forbidden'); };
      for (const key of ['Module', 'Instance', 'compile', 'compileStreaming', 'instantiate', 'instantiateStreaming']) {
        WebAssembly[key] = function() { operations.push(key); throw new Error('WASM operation forbidden'); };
      }
      const { createStaticResponseMetadataReader } = await import('@formspec-org/engine/static-presentation');
      const { captureResponseFieldMetadata } = await import('@formspec-org/surface');
      const input = ${JSON.stringify(fixture())};
      const fields = captureResponseFieldMetadata(input.definition, input.response, createStaticResponseMetadataReader(input));
      console.log(JSON.stringify({ operations, fields }));
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    });
    const result = JSON.parse(output);
    expect(result.operations).toEqual([]);
    expect(result.fields['rows[1].choice']).toEqual({ label: 'Original choice', options: [{ value: 'a', label: 'Original A' }] });
  });
});
