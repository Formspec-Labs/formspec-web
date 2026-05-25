import { describe, expect, it } from 'vitest';
import { HISTORY_ROUTE_NARROWING, parseHistoryRoute } from '../../src/app/history-route.ts';

describe('parseHistoryRoute', () => {
  it('returns null for the form-fill root', () => {
    expect(parseHistoryRoute('https://app.example.test/')).toBeNull();
    expect(parseHistoryRoute('https://app.example.test/?x=y')).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(parseHistoryRoute('https://app.example.test/status?case=urn:wos:case_demo_0001')).toBeNull();
    expect(parseHistoryRoute('https://app.example.test/obligations')).toBeNull();
    expect(parseHistoryRoute('https://app.example.test/documents')).toBeNull();
    expect(parseHistoryRoute('https://app.example.test/history/foo')).toBeNull();
  });

  it('matches /history with no params', () => {
    expect(parseHistoryRoute('https://app.example.test/history')).toEqual({});
  });

  it('matches /history and ignores irrelevant query params', () => {
    expect(parseHistoryRoute('https://app.example.test/history?utm_source=x')).toEqual({});
  });

  it('returns null for malformed URLs', () => {
    expect(parseHistoryRoute('not a url')).toBeNull();
  });
});

describe('HISTORY_ROUTE_NARROWING descriptor', () => {
  it('cites /history and identity-bound + consumes crossIssuerHistory', () => {
    expect(HISTORY_ROUTE_NARROWING.routeCite).toBe('/history');
    expect(HISTORY_ROUTE_NARROWING.identityBound).toBe(true);
    expect(HISTORY_ROUTE_NARROWING.consumes.has('crossIssuerHistory')).toBe(true);
  });

  it('does NOT consume respondent-place or status (those are sibling surfaces)', () => {
    expect(HISTORY_ROUTE_NARROWING.consumes.has('respondentPlace')).toBe(false);
    expect(HISTORY_ROUTE_NARROWING.consumes.has('status')).toBe(false);
  });
});
