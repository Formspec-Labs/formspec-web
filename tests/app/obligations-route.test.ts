import { describe, expect, it } from 'vitest';
import { parseObligationsRoute } from '../../src/app/obligations-route.ts';

describe('parseObligationsRoute', () => {
  it('returns null for the form-fill root', () => {
    expect(parseObligationsRoute('https://app.example.test/')).toBeNull();
    expect(parseObligationsRoute('https://app.example.test/?utm_source=x')).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(parseObligationsRoute('https://app.example.test/status?case=urn:wos:case_demo_0001')).toBeNull();
    expect(parseObligationsRoute('https://app.example.test/obligations/foo')).toBeNull();
    expect(parseObligationsRoute('https://app.example.test/obligationsx')).toBeNull();
  });

  it('matches /obligations with no params', () => {
    expect(parseObligationsRoute('https://app.example.test/obligations')).toEqual({});
  });

  it('matches /obligations and ignores irrelevant query params', () => {
    expect(parseObligationsRoute('https://app.example.test/obligations?utm_source=x')).toEqual({});
  });

  it('returns null for malformed input', () => {
    expect(parseObligationsRoute('not a url')).toBeNull();
  });
});
