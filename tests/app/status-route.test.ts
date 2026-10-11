import { describe, expect, it } from 'vitest';
import { parseStatusRoute, buildStatusTrackingUri, STATUS_ROUTE_NARROWING } from '../../src/app/status-route.ts';

describe('authenticated status navigation', () => {
  it('preserves the complete opaque durable case selector', () => {
    const caseLedgerId = 'urn:wos:case:opaque/a?b#c';
    const url = new URL('https://app.example.test/status');
    url.searchParams.set('caseLedgerId', caseLedgerId);
    expect(parseStatusRoute(url.href)).toEqual({ caseLedgerId });
    expect(STATUS_ROUTE_NARROWING.identityBound).toBe(true);
  });
  it.each([
    '/', '/status', '/status?case=urn:wos:old', '/status?caseLedgerId=',
    '/status?caseLedgerId=one&caseLedgerId=two', '/status?caseLedgerId=one&token=secret',
    '/status?caseLedgerId=one#extra', '/status?caseLedgerId=%20one',
    '/status?caseLedgerId=one%00', '/status?caseLedgerId=%ED%A0%80',
  ])('refuses malformed or superseded selection %s', path => {
    expect(parseStatusRoute('https://app.example.test' + path)).toBeNull();
  });
  it('refuses credentials and unsupported protocols', () => {
    expect(parseStatusRoute('https://user:password@app.example.test/status?caseLedgerId=one')).toBeNull();
    expect(parseStatusRoute('file:///status?caseLedgerId=one')).toBeNull();
  });
});


it('rejects a lone surrogate before URLSearchParams can replace it', () => {
  expect(() => buildStatusTrackingUri(String.fromCharCode(0xd800))).toThrow();
  const id = 'urn:wos:opaque/é🌐?x#y';
  expect(parseStatusRoute('https://app.test' + buildStatusTrackingUri(id))).toEqual({ caseLedgerId: id });
});
