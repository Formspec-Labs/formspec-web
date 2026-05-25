/**
 * Composing `IdentityProvider` adapter — FW-0028 slice 1.
 *
 * Mirrors the `CompositeFormRuntimePolicyExtractor` pattern: wraps an ordered
 * `IdentityProvider[]` behind one port instance so a deployment can expose
 * multiple IdPs (login.gov + ID.me + anonymous + ...) through the single
 * `Composition.identityProvider` slot.
 *
 * Design lineage: thoughts/specs/2026-05-24-fw-0028-multi-idp-picker-design.md.
 *
 * Routing rule for `authenticate(option)`: the composite finds the wrapped
 * provider whose `discover()` would have returned that exact option (matched
 * by option-key — kind + the kind-specific identity field) and delegates.
 * Duplicate offers across wrapped providers: first-wins (call-site ordering).
 *
 * `subscribe` collapses the initial-`null` fan-out (one per wrapped provider)
 * into a single synchronous `listener(null)` so the existing
 * `defineIdentityProviderConformance` `[null, claim, null]` expectation
 * still holds for the composite.
 */
import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';

export class CompositeIdentityProvider implements IdentityProvider {
  constructor(private readonly providers: readonly IdentityProvider[]) {}

  async discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]> {
    const perProvider = await Promise.all(
      this.providers.map((provider) => provider.discover(formAssuranceRequirements)),
    );
    return dedupeByKey(perProvider.flat());
  }

  async authenticate(option: IdpOption): Promise<IdentityClaim> {
    const owner = await this.ownerFor(option);
    if (!owner) {
      throw new Error('No identity provider can authenticate this option');
    }
    return owner.authenticate(option);
  }

  async revoke(claim: IdentityClaim): Promise<void> {
    await Promise.all(this.providers.map((provider) => provider.revoke(claim)));
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    // Each wrapped provider delivers the current value on subscribe and
    // emits on authenticate / revoke. With N providers we would see N
    // initial `null` events at subscribe time, and a `revoke()` fan-out
    // produces N redundant `null` emissions because revoke is broadcast
    // across all wrapped providers. Collapse equal consecutive emissions
    // so the conformance contract — `[null, claim, null]` for a single
    // authenticate→revoke cycle — holds for the composite.
    let lastEmitted: IdentityClaim | null | undefined = undefined; // sentinel
    const dedupedListener = (claim: IdentityClaim | null): void => {
      if (claimEquivalent(lastEmitted, claim)) return;
      lastEmitted = claim;
      listener(claim);
    };
    const unsubscribes = this.providers.map((provider) => provider.subscribe(dedupedListener));
    if (lastEmitted === undefined) {
      // No wrapped provider delivered a synchronous initial value; honor
      // the port contract and deliver a null ourselves.
      lastEmitted = null;
      listener(null);
    }
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }

  private async ownerFor(option: IdpOption): Promise<IdentityProvider | undefined> {
    const target = optionKey(option);
    for (const provider of this.providers) {
      const offered = await provider.discover();
      if (offered.some((candidate) => optionKey(candidate) === target)) {
        return provider;
      }
    }
    return undefined;
  }
}

export function createCompositeIdentityProvider(
  providers: readonly IdentityProvider[],
): CompositeIdentityProvider {
  return new CompositeIdentityProvider(providers);
}

function claimEquivalent(
  a: IdentityClaim | null | undefined,
  b: IdentityClaim | null,
): boolean {
  if (a === undefined) return false;
  if (a === null || b === null) return a === b;
  return a.subjectRef === b.subjectRef && a.provider === b.provider && a.adapter === b.adapter;
}

function optionKey(option: IdpOption): string {
  if (option.kind === 'oidc') return `oidc:${option.issuer}`;
  if (option.kind === 'magic-link') return `magic-link:${option.channel}`;
  return 'anonymous';
}

function dedupeByKey(options: readonly IdpOption[]): IdpOption[] {
  const seen = new Set<string>();
  const result: IdpOption[] = [];
  for (const option of options) {
    const key = optionKey(option);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }
  return result;
}
