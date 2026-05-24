import { describe, expect, it } from 'vitest';
import { parseStatusRoute } from '../../src/app/status-route.ts';

describe('parseStatusRoute', () => {
  it('returns null for the form-fill root', () => {
    expect(parseStatusRoute('https://app.example.test/')).toBeNull();
    expect(parseStatusRoute('https://app.example.test/?utm_source=x')).toBeNull();
  });

  it('returns null for /status without a case param', () => {
    expect(parseStatusRoute('https://app.example.test/status')).toBeNull();
    expect(parseStatusRoute('https://app.example.test/status?ref=x')).toBeNull();
  });

  it('extracts a WOS resource URN from /status?case=', () => {
    const parsed = parseStatusRoute('https://app.example.test/status?case=urn:wos:case_demo_0001');
    expect(parsed).toEqual({ caseUrn: 'urn:wos:case_demo_0001' });
  });

  it('decodes a percent-encoded URN', () => {
    const href = 'https://app.example.test/status?case=urn%3Awos%3Acase_demo_0001';
    expect(parseStatusRoute(href)).toEqual({ caseUrn: 'urn:wos:case_demo_0001' });
  });

  it('rejects a case param that does not look like a WOS URN', () => {
    expect(parseStatusRoute('https://app.example.test/status?case=javascript:alert(1)')).toBeNull();
    expect(parseStatusRoute('https://app.example.test/status?case=')).toBeNull();
  });
});
