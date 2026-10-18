import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveScopeKey, parseScopeKey, SCOPE_KEY_HEADER, scopeKeyHeaders } from '../../src/shared/scope-key.ts';

describe('the scope key (ADR 0168 §1.1)', () => {
  it('matches the Rust golden vectors, bound and unbound', () => {
    // stack-common-scope tests/scope.rs `scope_keys_match_the_golden_vectors`.
    expect(deriveScopeKey({ tenant: 'acme', workspace: 'benefits', environment: 'prod' }))
      .toBe('b790664e064ebbf64d0232be2ee357f10dcf3cfe4e9e243d26b156b0fd23ff78');
    expect(deriveScopeKey({ tenant: 'acme', workspace: 'benefits' }))
      .toBe('647aecf0092244aa064183a741b1ea1b9a7d2409f4ffae070a70854f12a38411');
  });

  it('equals the key formspec-server stamped into its producer fixture', () => {
    // The fixture is Rust output (Scope::fixture("tenant-test", "workspace-test", Some("environment-test"))).
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/source-composition-v1/valid-native-hydration.json'), 'utf8')) as { scope: string };
    expect(deriveScopeKey({ tenant: 'tenant-test', workspace: 'workspace-test', environment: 'environment-test' })).toBe(fixture.scope);
  });

  it('frames every name, so boundaries cannot shift', () => {
    expect(deriveScopeKey({ tenant: 'ab', workspace: 'c' })).not.toBe(deriveScopeKey({ tenant: 'a', workspace: 'bc' }));
    expect(deriveScopeKey({ tenant: 'a', workspace: 'b', environment: 'c' })).not.toBe(deriveScopeKey({ tenant: 'a', workspace: 'bc' }));
  });

  it('refuses names outside the DNS-label grammar', () => {
    for (const name of ['', 'Acme', 'acme_test', '1acme', 'acme-', 'a'.repeat(64), 'a.b']) {
      expect(() => deriveScopeKey({ tenant: name, workspace: 'w' })).toThrow('DNS labels');
      expect(() => deriveScopeKey({ tenant: 't', workspace: 'w', environment: name })).toThrow('DNS labels');
    }
    expect(deriveScopeKey({ tenant: 'a'.repeat(63), workspace: 'w' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('has one spelling: 64 lowercase hex digits', () => {
    const key = deriveScopeKey({ tenant: 'acme', workspace: 'benefits', environment: 'prod' });
    expect(parseScopeKey(key)).toBe(key);
    for (const text of [key.toUpperCase(), key.slice(0, 62), `${key}0`, ` ${key}`, 42, undefined]) {
      expect(() => parseScopeKey(text)).toThrow('64 lowercase hex');
    }
  });

  it('sends the key as the x-stack-scope-key selector, and nothing when unbound', () => {
    const key = deriveScopeKey({ tenant: 'acme', workspace: 'benefits' });
    expect(SCOPE_KEY_HEADER).toBe('x-stack-scope-key');
    expect(scopeKeyHeaders(key)).toEqual({ 'x-stack-scope-key': key });
    expect(scopeKeyHeaders(undefined)).toEqual({});
  });
});
