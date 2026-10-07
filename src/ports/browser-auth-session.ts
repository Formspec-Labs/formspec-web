import type { Unsubscribe } from './identity-provider.ts';

/** Sign-in identity only. Applications obtain permissions from their own server. */
export interface BrowserAuthSessionState {
  readonly issuer: string;
  readonly subject: string;
  readonly expiresAt: string;
  readonly revision: number;
}

export type BrowserAuthSessionErrorCode =
  | 'capability-unavailable' | 'invalid-session' | 'operation-cancelled' | 'provider-error';

export class BrowserAuthSessionError extends Error {
  constructor(readonly code: BrowserAuthSessionErrorCode) {
    super(`Browser authentication failed: ${code}`);
    this.name = 'BrowserAuthSessionError';
  }
}

export interface BrowserAuthSession {
  begin(): Promise<void>;
  completeCallback(url: string): Promise<BrowserAuthSessionState>;
  completeSilentCallback(url: string): Promise<void>;
  getSession(): Promise<BrowserAuthSessionState | null>;
  renew(): Promise<BrowserAuthSessionState>;
  logout(): Promise<void>;
  completeLogoutCallback(url: string): Promise<void>;
  accessToken(): Promise<string | undefined>;
  subscribe(listener: (state: BrowserAuthSessionState | null) => void): Unsubscribe;
  dispose(): void;
}
