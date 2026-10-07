import { describe, expect, it } from 'vitest';
import { captureResponseFieldMetadata, type CapturedResponseFields, type ResponseFieldMetadataReader } from '@formspec-org/surface';
import type { AcceptedResponseReviewPresentation } from '@formspec-org/surface-react/widget-metadata';
import { sampleFormDefinition, sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';

describe('installed public response field metadata helper', () => {
  it('captures an own prototype-named field without changing the result prototype', () => {
    const definition = { ...sampleFormDefinition, items: [{ key: '__proto__', type: 'field' as const, dataType: 'string' as const, label: 'Retained label' }] };
    const response = { ...sampleFormResponse, data: JSON.parse('{"__proto__":"original"}') };
    const reader: ResponseFieldMetadataReader = { label: () => 'Retained label', options: () => [] };
    const fields: CapturedResponseFields = captureResponseFieldMetadata(definition, response, reader);
    const acceptedFields: AcceptedResponseReviewPresentation['fields'] = fields;
    expect(Object.hasOwn(acceptedFields, '__proto__')).toBe(true);
    expect(acceptedFields.__proto__).toEqual({ label: 'Retained label' });
    expect(Object.getPrototypeOf(acceptedFields)).toBe(Object.prototype);
    expect(Object.keys(acceptedFields)).toEqual(['__proto__']);
  });

  it('refuses missing original options and propagates a metadata provider refusal', () => {
    const definition = { ...sampleFormDefinition, items: [{ key: 'choice', type: 'field' as const, dataType: 'choice' as const, label: 'Choice' }] };
    const response = { ...sampleFormResponse, data: { choice: 'a' } };
    expect(() => captureResponseFieldMetadata(definition, response, { label: () => 'Original choice', options: () => undefined })).toThrow('response-review-field-unavailable');
    const refusal = new Error('original-metadata-not-qualified');
    expect(() => captureResponseFieldMetadata(definition, response, { label: () => 'Original choice', options: () => { throw refusal; } })).toThrow(refusal);
  });
});
