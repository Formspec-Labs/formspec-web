import { describe, expect, it } from 'vitest';
import {
  parseScreenerRoute,
  SCREENER_ROUTE_NARROWING,
} from '../../src/app/screener-route.ts';

describe('parseScreenerRoute', () => {
  it('returns null on a non-/screener URL', () => {
    expect(parseScreenerRoute('http://localhost/')).toBeNull();
    expect(parseScreenerRoute('http://localhost/status?case=urn:wos:abc')).toBeNull();
    expect(parseScreenerRoute('http://localhost/history')).toBeNull();
  });

  it('returns the docUrl when ?doc=URN is present', () => {
    const result = parseScreenerRoute(
      'http://localhost/screener?doc=urn:demo:formspec-web:screener:benefits-or-grant',
    );
    expect(result).toEqual({
      docUrl: 'urn:demo:formspec-web:screener:benefits-or-grant',
    });
  });

  it('returns an empty docUrl when /screener is requested without ?doc', () => {
    const result = parseScreenerRoute('http://localhost/screener');
    // The runtime renders a "no-doc" surface on empty docUrl rather than
    // falling through to the form runtime; null would mis-route the request.
    expect(result).toEqual({ docUrl: '' });
  });

  it('returns null on a malformed href', () => {
    expect(parseScreenerRoute('not a url')).toBeNull();
  });
});

describe('SCREENER_ROUTE_NARROWING descriptor', () => {
  it('consumes the screener feature key', () => {
    expect(SCREENER_ROUTE_NARROWING.consumes.has('screener')).toBe(true);
  });

  it('consumes exactly the screener feature key (no incidental drift)', () => {
    expect([...SCREENER_ROUTE_NARROWING.consumes]).toEqual(['screener']);
  });

  it('is not identity-bound (J-047: pre-flight is the moment before account choices)', () => {
    expect(SCREENER_ROUTE_NARROWING.identityBound).toBe(false);
  });

  it('cites /screener so noop-adapter errors are recognizable', () => {
    expect(SCREENER_ROUTE_NARROWING.routeCite).toBe('/screener');
  });
});
