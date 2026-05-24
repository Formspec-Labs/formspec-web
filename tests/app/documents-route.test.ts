import { describe, expect, it } from 'vitest';
import { parseDocumentsRoute } from '../../src/app/documents-route.ts';

describe('parseDocumentsRoute', () => {
  it('returns null for the form-fill root', () => {
    expect(parseDocumentsRoute('https://app.example.test/')).toBeNull();
    expect(parseDocumentsRoute('https://app.example.test/?x=y')).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(parseDocumentsRoute('https://app.example.test/status?case=urn:wos:case_demo_0001')).toBeNull();
    expect(parseDocumentsRoute('https://app.example.test/obligations')).toBeNull();
    expect(parseDocumentsRoute('https://app.example.test/documents/foo')).toBeNull();
  });

  it('matches /documents with no params', () => {
    expect(parseDocumentsRoute('https://app.example.test/documents')).toEqual({});
  });

  it('matches /documents and ignores irrelevant query params', () => {
    expect(parseDocumentsRoute('https://app.example.test/documents?utm_source=x')).toEqual({});
  });

  it('returns null for malformed URLs', () => {
    expect(parseDocumentsRoute('not a url')).toBeNull();
  });
});
