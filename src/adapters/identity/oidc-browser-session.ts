import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts';
import { BrowserAuthSessionError, type BrowserAuthSession, type BrowserAuthSessionState } from '../../ports/browser-auth-session.ts';
import type { Unsubscribe } from '../../ports/identity-provider.ts';

export interface OidcUserLike {
  access_token?: string;
  id_token?: string;
  profile: { sub?: unknown; iss?: unknown; acr?: unknown } & Record<string, unknown>;
  expires_at?: number;
}

export type OidcDriverEvent = { type: 'loaded'; user: OidcUserLike } | { type: 'unloaded' | 'expired' | 'signed-out' };
export interface OidcClientDriver {
  getUser(): Promise<OidcUserLike | null>;
  signinSilent?(): Promise<OidcUserLike | null>;
  signinRedirect?(): Promise<void>;
  signinRedirectCallback?(url: string): Promise<OidcUserLike>;
  signinSilentCallback?(url: string): Promise<void>;
  signoutRedirect?(idTokenHint?: string): Promise<void>;
  signoutRedirectCallback?(url: string): Promise<void>;
  removeUser?(): Promise<void>;
  subscribe?(listener: (event: OidcDriverEvent) => void): Unsubscribe;
}
export interface OidcClock {
  now(): number;
  schedule(callback: () => void, delayMs: number): Unsubscribe;
}
export interface OidcBrowserAuthSessionConfig {
  issuer: string;
  clientId: string;
  redirectUri?: string;
  scope?: string;
  silentRedirectUri?: string;
  postLogoutRedirectUri?: string;
  acrValues?: string;
  resource?: string;
  driver?: OidcClientDriver;
  clock?: OidcClock;
}
const systemClock: OidcClock = {
  now: () => Date.now(),
  schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
};
const owners = new WeakMap<OidcClientDriver, OidcBrowserAuthSession>();
const sdkDrivers = new Map<string, { driver: OidcClientDriver; configuration: string }>();

/** One owner for SDK storage and mutation operations, with passive credential reads. */
export class OidcBrowserAuthSession implements BrowserAuthSession {
  private readonly driver: OidcClientDriver;
  private readonly clock: OidcClock;
  private readonly listeners = new Set<(state: BrowserAuthSessionState | null) => void>();
  private readonly pending = new Set<Promise<unknown>>();
  private state: BrowserAuthSessionState | null = null;
  private user: OidcUserLike | null = null;
  private fingerprint: string | null = null;
  private revision = 0;
  private epoch = 0;
  private disposed = false;
  private blocked = false;
  private cancelTimer?: Unsubscribe;
  private unsubscribeDriver?: Unsubscribe;
  private renewing?: Promise<BrowserAuthSessionState>;
  private cleaning?: Promise<void>;
  private ending?: Promise<void>;

  constructor(private readonly config: OidcBrowserAuthSessionConfig) {
    this.clock = config.clock ?? systemClock;
    this.driver = config.driver ?? createOidcClientTsDriver(config);
    if (owners.has(this.driver)) throw new BrowserAuthSessionError('capability-unavailable');
    owners.set(this.driver, this);
    this.unsubscribeDriver = this.driver.subscribe?.((event) => {
      if (this.disposed || this.blocked) return;
      if (event.type === 'loaded') {
        if (this.pending.size > 0) return;
        try { this.admit(event.user); } catch { this.withdraw(); }
      } else if (event.type === 'expired') {
        // The old credential expires, but an in-flight renewal still owns this lifecycle.
        this.withdraw();
      } else {
        // Remote sign-out must also retire SDK storage, not just the current view.
        void this.cleanup().catch(() => undefined);
      }
    });
  }

  subscribe(listener: (state: BrowserAuthSessionState | null) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async getSession(): Promise<BrowserAuthSessionState | null> {
    if (this.disposed || this.blocked) return null;
    if (this.pending.size > 0) {
      if (!this.valid(this.user)) this.withdraw();
      return this.state;
    }
    const epoch = this.epoch;
    try {
      const user = await this.driver.getUser();
      if (this.disposed || this.blocked) return null;
      // Another concurrent read/event may already have admitted newer credentials.
      if (epoch !== this.epoch) return this.valid(this.user) ? this.state : null;
      if (!user) { this.withdraw(); return null; }
      return this.admit(user);
    } catch {
      if (this.disposed || this.blocked) return null;
      if (epoch !== this.epoch && this.valid(this.user)) return this.state;
      this.withdraw();
      return null;
    }
  }

  async accessToken(): Promise<string | undefined> {
    await this.getSession();
    if (!this.valid(this.user)) this.withdraw();
    return this.state && !this.blocked && !this.disposed ? this.user?.access_token : undefined;
  }

  /** Provider evidence remains confined to OIDC adapters, never the public port. */
  admittedUser(): OidcUserLike | null {
    if (!this.state || this.blocked || this.disposed || !this.valid(this.user)) { this.withdraw(); return null; }
    return this.user ? { ...this.user, profile: structuredClone(this.user.profile) } : null;
  }

  async begin(): Promise<void> {
    if (this.ending) await this.ending;
    if (this.cleaning) await this.cleaning;
    this.assertAlive();
    this.blocked = false;
    if (!this.driver.signinRedirect) throw new BrowserAuthSessionError('capability-unavailable');
    await this.mutate(() => this.driver.signinRedirect!());
  }

  async completeCallback(url: string): Promise<BrowserAuthSessionState> {
    this.assertAvailable();
    if (!this.driver.signinRedirectCallback) throw new BrowserAuthSessionError('capability-unavailable');
    const user = await this.mutate(() => this.driver.signinRedirectCallback!(url));
    return this.admit(user);
  }

  async completeSilentCallback(url: string): Promise<void> {
    this.assertAvailable();
    if (!this.driver.signinSilentCallback) throw new BrowserAuthSessionError('capability-unavailable');
    await this.mutate(() => this.driver.signinSilentCallback!(url));
  }

  renew(): Promise<BrowserAuthSessionState> {
    if (this.renewing) return this.renewing;
    this.assertAvailable();
    if (!this.driver.signinSilent) return Promise.reject(new BrowserAuthSessionError('capability-unavailable'));
    this.renewing = this.mutate(() => this.driver.signinSilent!()).then((user) => this.admit(user)).finally(() => { this.renewing = undefined; });
    return this.renewing;
  }

  logout(): Promise<void> {
    this.assertAlive();
    if (this.ending) return this.ending;
    const hint = this.user?.id_token;
    this.ending = (async () => {
      await this.cleanup();
      if (!this.driver.signoutRedirect) throw new BrowserAuthSessionError('capability-unavailable');
      try { await this.driver.signoutRedirect(hint); } catch { throw new BrowserAuthSessionError('provider-error'); }
    })().finally(() => { this.ending = undefined; });
    return this.ending;
  }

  async completeLogoutCallback(url: string): Promise<void> {
    this.assertAlive();
    await this.cleanup();
    if (!this.driver.signoutRedirectCallback) throw new BrowserAuthSessionError('capability-unavailable');
    try { await this.driver.signoutRedirectCallback(url); } catch { throw new BrowserAuthSessionError('provider-error'); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.blocked = true; this.epoch++;
    this.unsubscribeDriver?.();
    this.withdraw();
    // Disposal preserves accepted persisted sign-in for callback navigation.
    // Invalidated in-flight mutations perform their own late-write cleanup.
    const outstanding = [...this.pending, ...(this.cleaning ? [this.cleaning] : []), ...(this.ending ? [this.ending] : [])];
    if (outstanding.length === 0) owners.delete(this.driver);
    else void Promise.allSettled(outstanding).then(() => owners.delete(this.driver));
    this.listeners.clear();
  }

  private cleanup(): Promise<void> {
    if (this.cleaning) return this.cleaning;
    this.blocked = true;
    this.epoch++;
    this.withdraw();
    this.cleaning = (async () => {
      await Promise.allSettled([...this.pending]);
      if (!this.driver.removeUser) throw new BrowserAuthSessionError('capability-unavailable');
      try { await this.driver.removeUser(); } catch { throw new BrowserAuthSessionError('provider-error'); }
    })().finally(() => { this.cleaning = undefined; });
    return this.cleaning;
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    this.assertAvailable();
    if (this.pending.size > 0) return Promise.reject(new BrowserAuthSessionError('operation-cancelled'));
    const epoch = this.epoch;
    // Register the entire mutation before SDK events, including stale storage cleanup.
    const promise = Promise.resolve().then(operation).then(async (result) => {
      if (epoch !== this.epoch || this.disposed || this.blocked) {
        await this.removeStoredUser();
        throw new BrowserAuthSessionError('operation-cancelled');
      }
      return result;
    }).catch(async (error: unknown) => {
      this.withdraw();
      if (epoch === this.epoch) {
        this.blocked = true;
        this.epoch++;
        await this.removeStoredUser();
      }
      if (error instanceof BrowserAuthSessionError) throw error;
      throw new BrowserAuthSessionError('provider-error');
    }).finally(() => { this.pending.delete(promise); });
    this.pending.add(promise);
    return promise;
  }

  private async removeStoredUser(): Promise<void> {
    if (!this.driver.removeUser) throw new BrowserAuthSessionError('capability-unavailable');
    try { await this.driver.removeUser(); } catch { throw new BrowserAuthSessionError('provider-error'); }
  }

  private valid(user: OidcUserLike | null): user is OidcUserLike {
    return !!user && typeof user.profile.sub === 'string' && user.profile.sub.trim().length > 0
      && user.profile.iss === this.config.issuer
      && typeof user.access_token === 'string' && user.access_token.trim().length > 0
      && typeof user.expires_at === 'number' && Number.isFinite(user.expires_at)
      && Number.isFinite(user.expires_at * 1000) && user.expires_at * 1000 <= 8.64e15
      && user.expires_at * 1000 > this.clock.now();
  }

  private admit(user: OidcUserLike | null): BrowserAuthSessionState {
    this.assertAvailable();
    if (!this.valid(user)) { this.epoch++; this.withdraw(); throw new BrowserAuthSessionError('invalid-session'); }
    const snapshot: OidcUserLike = { access_token: user.access_token, id_token: user.id_token, expires_at: user.expires_at, profile: structuredClone(user.profile) };
    const fingerprint = JSON.stringify(snapshot);
    if (this.state && fingerprint === this.fingerprint) return this.state;
    this.epoch++;
    this.withdraw();
    this.user = snapshot;
    this.fingerprint = fingerprint;
    this.state = Object.freeze({ issuer: this.config.issuer, subject: snapshot.profile.sub as string, expiresAt: new Date(snapshot.expires_at! * 1000).toISOString(), revision: ++this.revision });
    this.scheduleExpiry();
    this.publish();
    return this.state;
  }

  private scheduleExpiry(): void {
    this.cancelTimer?.();
    if (!this.user?.expires_at) return;
    const remaining = this.user.expires_at * 1000 - this.clock.now();
    this.cancelTimer = this.clock.schedule(() => {
      if (this.valid(this.user)) this.scheduleExpiry();
      else { this.withdraw(); }
    }, Math.min(Math.max(remaining, 0), 2_147_483_647));
  }
  private withdraw(): void {
    this.cancelTimer?.(); this.cancelTimer = undefined;
    this.user = null; this.fingerprint = null;
    if (this.state) { this.state = null; this.revision++; this.publish(); }
  }
  private publish(): void { for (const listener of this.listeners) listener(this.state); }
  private assertAlive(): void { if (this.disposed) throw new BrowserAuthSessionError('operation-cancelled'); }
  private assertAvailable(): void { this.assertAlive(); if (this.blocked) throw new BrowserAuthSessionError('operation-cancelled'); }
}

export function createOidcClientTsDriver(config: OidcBrowserAuthSessionConfig): OidcClientDriver {
  if (!config.redirectUri) throw new BrowserAuthSessionError('capability-unavailable');
  const absolute = (uri: string) => new URL(uri, globalThis.location?.origin).href;
  const redirectUri = absolute(config.redirectUri);
  const silentRedirectUri = config.silentRedirectUri ? absolute(config.silentRedirectUri) : undefined;
  const postLogoutRedirectUri = config.postLogoutRedirectUri ? absolute(config.postLogoutRedirectUri) : undefined;
  const routes = [redirectUri, silentRedirectUri, postLogoutRedirectUri].filter((uri): uri is string => !!uri).map((uri) => { const url = new URL(uri); if (url.pathname === '/') throw new BrowserAuthSessionError('invalid-session'); return `${url.origin}${url.pathname}`; });
  if (new Set(routes).size !== routes.length) throw new BrowserAuthSessionError('invalid-session');
  const scope = config.scope ?? 'openid profile email';
  if (!scope.split(/\s+/).includes('openid')) throw new BrowserAuthSessionError('invalid-session');
  const key = `${config.issuer}\0${config.clientId}`;
  const configuration = JSON.stringify({ redirectUri, silentRedirectUri, postLogoutRedirectUri, scope, acrValues: config.acrValues, resource: config.resource });
  const existing = sdkDrivers.get(key);
  if (existing) {
    if (existing.configuration !== configuration) throw new BrowserAuthSessionError('capability-unavailable');
    return existing.driver;
  }
  const settings: UserManagerSettings = {
    authority: config.issuer, client_id: config.clientId, redirect_uri: redirectUri,
    silent_redirect_uri: silentRedirectUri, post_logout_redirect_uri: postLogoutRedirectUri,
    response_type: 'code', scope, acr_values: config.acrValues, resource: config.resource,
    automaticSilentRenew: false, filterProtocolClaims: false, disablePKCE: false,
    stateStore: new WebStorageStateStore({ store: globalThis.sessionStorage, prefix: `oidc-state:${encodeURIComponent(config.issuer)}:${encodeURIComponent(config.clientId)}:` }),
  };
  const manager = new UserManager(settings);
  const nonce = () => { const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); };
  const driver: OidcClientDriver = {
    getUser: () => manager.getUser(),
    signinSilent: async () => {
      const current = await manager.getUser();
      if (!current?.refresh_token && !silentRedirectUri) throw new BrowserAuthSessionError('capability-unavailable');
      return manager.signinSilent({ nonce: nonce() });
    },
    signinRedirect: () => manager.signinRedirect({ nonce: nonce() }),
    signinRedirectCallback: (url) => manager.signinRedirectCallback(url),
    signinSilentCallback: (url) => manager.signinSilentCallback(url),
    signoutRedirect: (hint) => manager.signoutRedirect({ id_token_hint: hint, state: nonce() }),
    signoutRedirectCallback: async (url) => { await manager.signoutRedirectCallback(url); },
    removeUser: () => manager.removeUser(),
    subscribe: (listener) => {
      const loaded = (user: OidcUserLike) => listener({ type: 'loaded', user });
      const unloaded = () => listener({ type: 'unloaded' });
      const expired = () => listener({ type: 'expired' });
      const signedOut = () => listener({ type: 'signed-out' });
      manager.events.addUserLoaded(loaded); manager.events.addUserUnloaded(unloaded);
      manager.events.addAccessTokenExpired(expired); manager.events.addUserSignedOut(signedOut);
      return () => { manager.events.removeUserLoaded(loaded); manager.events.removeUserUnloaded(unloaded); manager.events.removeAccessTokenExpired(expired); manager.events.removeUserSignedOut(signedOut); };
    },
  };
  sdkDrivers.set(key, { driver, configuration });
  return driver;
}
