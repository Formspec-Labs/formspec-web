import { describe, expect, it, vi } from 'vitest';
import { OidcBrowserAuthSession, type OidcClientDriver, type OidcClock, type OidcDriverEvent, type OidcUserLike } from '../../../src/adapters/identity/oidc-browser-session.ts';
import { OidcAdapter } from '../../../src/adapters/identity/oidc.ts';

const issuer = 'https://issuer.test/realms/dev';
const user = (token = 'access-a', sub = 'person'): OidcUserLike => ({ access_token: token, id_token: 'private-hint', profile: { iss: issuer, sub, acr: 'L3' }, expires_at: 2000 });
function fixture(initial: OidcUserLike | null = user()) {
  let stored = initial;
  let event: ((event: OidcDriverEvent) => void) | undefined;
  let now = 1000_000;
  let timer: (() => void) | undefined;
  const clock: OidcClock = { now: () => now, schedule: (callback) => { timer = callback; return () => { timer = undefined; }; } };
  const driver: OidcClientDriver = {
    getUser: vi.fn(async () => stored),
    removeUser: vi.fn(async () => { stored = null; }),
    signinRedirect: vi.fn(async () => undefined),
    signoutRedirect: vi.fn(async () => undefined),
    subscribe: (listener) => { event = listener; return () => { event = undefined; }; },
  };
  const session = new OidcBrowserAuthSession({ issuer, clientId: 'web', driver, clock });
  return { session, driver, clock, set: (value: OidcUserLike | null) => { stored = value; }, emit: (value: OidcDriverEvent) => event?.(value), advance: () => { now = 2000_000; }, expire: () => { now = 2000_000; timer?.(); } };
}

describe('OIDC browser lifecycle', () => {
  it('publishes token-free monotonic replacement state; passive unchanged reads do not notify', async () => {
    const f = fixture();
    const states: unknown[] = [];
    f.session.subscribe((state) => states.push(state));
    const first = await f.session.getSession();
    await f.session.accessToken(); await f.session.getSession();
    expect(states).toHaveLength(2);
    f.set(user('access-b')); f.emit({ type: 'loaded', user: user('access-b') });
    const second = await f.session.getSession();
    expect(states).toHaveLength(4);
    expect(states[2]).toBeNull();
    expect(second!.revision).toBeGreaterThan(first!.revision);
    expect(JSON.stringify(states)).not.toMatch(/access-a|access-b|private-hint|acr/);
    f.session.dispose();
  });

  it.each([undefined, 0, -1, NaN, Infinity, 1000])('refuses missing, nonfinite and expired expiry %s without renewal', async (expiry) => {
    const f = fixture({ ...user(), expires_at: expiry });
    await expect(f.session.accessToken()).resolves.toBeUndefined();
    expect(f.driver.signinRedirect).not.toHaveBeenCalled(); f.session.dispose();
  });

  it.each([{ ...user(), access_token: undefined }, { ...user(), profile: { iss: 'wrong', sub: 'person' } }, { ...user(), profile: { sub: 'person' } }, { ...user(), profile: { iss: issuer, sub: '' } }])('rejects ID-token-only and mismatched identity', async (invalid) => {
    const f = fixture(invalid); await expect(f.session.getSession()).resolves.toBeNull(); f.session.dispose();
  });

  it('withdraws without another read when clock expires and removes event listeners on dispose', async () => {
    const f = fixture(); const listener = vi.fn(); f.session.subscribe(listener);
    await f.session.getSession(); f.expire(); expect(listener).toHaveBeenLastCalledWith(null);
    expect(f.session.admittedUser()).toBeNull(); f.session.dispose();
    f.emit({ type: 'loaded', user: user() }); expect(f.session.admittedUser()).toBeNull();
  });

  it('shares admitted state across parallel fresh reads, authentication and access', async () => {
    const f = fixture();
    const adapter = new OidcAdapter({ issuer, clientId: 'web', minAssurance: 'L3', browserSession: f.session, subjectRefFactory: () => 'mapped' });
    const [first, second, claim, token] = await Promise.all([
      f.session.getSession(), f.session.getSession(),
      adapter.authenticate({ kind: 'oidc', issuer, displayName: '', minAssurance: 'L3' }),
      f.session.accessToken(),
    ]);
    expect(first).toEqual(second); expect(claim.subjectRef).toBe('mapped');
    expect(token).toBe('access-a'); expect(f.driver.signinRedirect).not.toHaveBeenCalled(); f.session.dispose();
  });

  it.each(['clock', 'sdk'] as const)('lets fresh renewal complete across old credential expiry from %s', async (expirySource) => {
    const f = fixture(); await f.session.getSession();
    let resolve!: (value: OidcUserLike) => void;
    f.driver.signinSilent = () => new Promise((done) => { resolve = done; });
    const renewal = f.session.renew(); await Promise.resolve();
    if (expirySource === 'clock') f.expire();
    else { f.advance(); f.emit({ type: 'expired' }); }
    await expect(f.session.accessToken()).resolves.toBeUndefined();
    const fresh = { ...user('fresh'), expires_at: 3000 }; f.set(fresh);
    f.emit({ type: 'loaded', user: fresh }); resolve(fresh);
    await expect(renewal).resolves.toMatchObject({ subject: 'person' });
    await expect(f.session.accessToken()).resolves.toBe('fresh');
    expect(f.driver.removeUser).not.toHaveBeenCalled(); f.session.dispose();
  });

  it('durably withdraws on SDK sign-out and removes persisted user before a fresh owner', async () => {
    const f = fixture(); await f.session.getSession();
    f.emit({ type: 'signed-out' });
    await expect(f.session.getSession()).resolves.toBeNull();
    await expect(f.session.accessToken()).resolves.toBeUndefined();
    await new Promise((done) => setTimeout(done, 0));
    await expect(f.driver.getUser()).resolves.toBeNull();
    expect(f.driver.signoutRedirect).not.toHaveBeenCalled();
    f.session.dispose();
    const fresh = new OidcBrowserAuthSession({ issuer, clientId: 'web', driver: f.driver, clock: f.clock });
    await expect(fresh.accessToken()).resolves.toBeUndefined(); fresh.dispose();
  });

  it('deduplicates SDK userLoaded plus renewal promise and concurrent renewals', async () => {
    const f = fixture(); await f.session.getSession(); const listener = vi.fn(); f.session.subscribe(listener);
    f.driver.signinSilent = vi.fn(async () => { const next = user('renewed'); f.set(next); f.emit({ type: 'loaded', user: next }); return next; });
    const first = f.session.renew(); const second = f.session.renew(); expect(first).toBe(second);
    await first; expect(f.driver.signinSilent).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(3); // initial, withdrawal, replacement
    await expect(f.session.accessToken()).resolves.toBe('renewed'); expect(listener).toHaveBeenCalledTimes(3); f.session.dispose();
  });

  it('never returns an expired admitted token while renewal is pending', async () => {
    const f = fixture(); await f.session.getSession();
    let resolve!: (value: OidcUserLike) => void;
    f.driver.signinSilent = () => new Promise((done) => { resolve = done; });
    const renewal = f.session.renew(); await Promise.resolve(); f.advance();
    await expect(f.session.accessToken()).resolves.toBeUndefined();
    resolve({ ...user('future'), expires_at: 3000 }); await renewal; f.session.dispose();
  });

  it('drains late SDK store/event before logout cleanup and prevents storage resurrection', async () => {
    const f = fixture(); await f.session.getSession();
    let resolve!: (value: OidcUserLike) => void;
    f.driver.signinSilent = () => new Promise((done) => { resolve = done; });
    const pending = f.session.renew().catch((error: unknown) => error);
    await Promise.resolve(); const logout = f.session.logout();
    await expect(f.session.accessToken()).resolves.toBeUndefined();
    f.set(user('late')); f.emit({ type: 'loaded', user: user('late') }); resolve(user('late'));
    expect(await pending).toMatchObject({ code: 'operation-cancelled' }); await logout;
    expect(f.driver.signoutRedirect).toHaveBeenCalledWith('private-hint');
    await expect(f.driver.getUser()).resolves.toBeNull();
    await expect(f.session.accessToken()).resolves.toBeUndefined();
    f.session.dispose(); await new Promise((done) => setTimeout(done, 0));
    const fresh = new OidcBrowserAuthSession({ issuer, clientId: 'web', driver: f.driver, clock: f.clock });
    await expect(fresh.accessToken()).resolves.toBeUndefined(); fresh.dispose();
  });

  it('does not let an old failed passive read withdraw a newer SDK event', async () => {
    const f = fixture(); let reject!: (reason: Error) => void;
    f.driver.getUser = () => new Promise((_resolve, fail) => { reject = fail; });
    const read = f.session.getSession();
    f.emit({ type: 'loaded', user: user('new') }); reject(new Error('stale failure'));
    await expect(read).resolves.toMatchObject({ subject: 'person' });
    expect(f.session.admittedUser()?.access_token).toBe('new'); f.session.dispose();
  });

  it('authenticates the newer admitted session when its older passive read fails', async () => {
    const f = fixture(); let reject!: (reason: Error) => void;
    f.driver.getUser = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValue(user('new'));
    const adapter = new OidcAdapter({ issuer, clientId: 'web', minAssurance: 'L3', browserSession: f.session, subjectRefFactory: () => 'mapped' });
    const authenticate = adapter.authenticate({ kind: 'oidc', issuer, displayName: '', minAssurance: 'L3' });
    f.emit({ type: 'loaded', user: user('new') }); reject(new Error('stale read failed'));
    await expect(authenticate).resolves.toMatchObject({ provider: issuer, subjectRef: 'mapped', assuranceLevel: 'L3' });
    expect(f.driver.signinRedirect).not.toHaveBeenCalled(); f.session.dispose();
  });

  it('fences disposal until the late SDK operation has removed persisted credentials', async () => {
    const f = fixture(); await f.session.getSession(); let resolve!: (value: OidcUserLike) => void;
    f.driver.signinSilent = () => new Promise((done) => { resolve = done; });
    const renewal = f.session.renew().catch((error: unknown) => error); await Promise.resolve();
    f.session.dispose();
    expect(() => new OidcBrowserAuthSession({ issuer, clientId: 'web', driver: f.driver })).toThrow(/capability-unavailable/);
    f.set(user('late')); resolve(user('late')); expect(await renewal).toMatchObject({ code: 'operation-cancelled' });
    await new Promise((done) => setTimeout(done, 0));
    await expect(f.driver.getUser()).resolves.toBeNull();
    const fresh = new OidcBrowserAuthSession({ issuer, clientId: 'web', driver: f.driver }); fresh.dispose();
  });

  it('rejects an injected session for a different issuer before normalizing a claim', async () => {
    const f = fixture();
    const mapper = vi.fn(() => 'mapped');
    const adapter = new OidcAdapter({ issuer: 'https://different.test', clientId: 'web', minAssurance: 'L3', browserSession: f.session, subjectRefFactory: mapper });
    await expect(adapter.authenticate({ kind: 'oidc', issuer: 'https://different.test', displayName: '', minAssurance: 'L3' })).rejects.toThrow(/issuer/);
    expect(mapper).not.toHaveBeenCalled(); f.session.dispose();
  });

  it('guards async respondent mapping against logout, changed issuer/options and weaker configured minima', async () => {
    const f = fixture(); let finish!: (value: string) => void;
    const adapter = new OidcAdapter({ issuer, clientId: 'web', minAssurance: 'L3', browserSession: f.session, subjectRefFactory: () => new Promise((resolve) => { finish = resolve; }) });
    await expect(adapter.authenticate({ kind: 'oidc', issuer: 'wrong', displayName: '', minAssurance: 'L3' })).rejects.toThrow();
    const mapping = adapter.authenticate({ kind: 'oidc', issuer, displayName: '', minAssurance: 'L1' });
    await new Promise((done) => setTimeout(done, 0)); await f.session.logout(); finish('mapped');
    await expect(mapping).rejects.toThrow(/changed/); f.session.dispose();
    const weak = fixture({ ...user(), profile: { iss: issuer, sub: 'person', acr: 'L1' } });
    const weakAdapter = new OidcAdapter({ issuer, clientId: 'web', minAssurance: 'L3', browserSession: weak.session, subjectRefFactory: () => 'mapped' });
    await expect(weakAdapter.authenticate({ kind: 'oidc', issuer, displayName: '', minAssurance: 'L1' })).rejects.toThrow(/below/); weak.session.dispose();
  });

  it('retires respondent assurance when renewal reduces ACR', async () => {
    const f = fixture(); const adapter = new OidcAdapter({ issuer, clientId: 'web', minAssurance: 'L3', browserSession: f.session, subjectRefFactory: () => 'mapped' });
    const option = { kind: 'oidc' as const, issuer, displayName: '', minAssurance: 'L3' as const };
    const listener = vi.fn(); adapter.subscribe(listener); await adapter.authenticate(option);
    const reduced = { ...user('new'), profile: { iss: issuer, sub: 'person', acr: 'L1' } };
    f.set(reduced); f.emit({ type: 'loaded', user: reduced }); expect(listener).toHaveBeenLastCalledWith(null);
    await expect(adapter.authenticate(option)).rejects.toThrow(/below/); f.session.dispose();
  });
});
