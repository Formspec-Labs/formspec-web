import type { AssuranceLevel, IdentityClaim, Unsubscribe } from '../../ports/identity-provider.ts';

export function assuranceRank(level: AssuranceLevel): number {
  return Number(level.slice(1));
}

export function meetsAssurance(actual: AssuranceLevel, required?: AssuranceLevel): boolean {
  return required === undefined || assuranceRank(actual) >= assuranceRank(required);
}

export class IdentitySession {
  private readonly listeners = new Set<(claim: IdentityClaim | null) => void>();
  private current: IdentityClaim | null = null;

  set(claim: IdentityClaim | null): void {
    this.current = claim;
    for (const listener of this.listeners) {
      listener(claim);
    }
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}

export function randomUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? fallbackRandomUuid();
}

function fallbackRandomUuid(): string {
  return '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}
