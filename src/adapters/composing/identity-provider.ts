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
 * Owner cache: the first `discover(floor)` populates a `optionKey → provider`
 * map keyed by floor; subsequent `authenticate(option)` calls read the cache
 * instead of re-running every wrapped provider's `discover()`. Closes the
 * `ownerFor` O(N×D) scan AND the per-authenticate `discover()` network
 * amplification (code review H-2 + arch H-1). `revoke(claim)` routes through
 * the same cache via the claim's `provider`+`adapter` fields — the owning
 * provider gets the revoke; siblings do not (code review M-2).
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
  // Populated by `discover()` — `optionKey → owning provider`. Captures the
  // floor-filtered set so a follow-on `authenticate(option)` finds the same
  // provider that offered the option (arch H-1: floor consistency).
  private optionOwnerCache: Map<string, IdentityProvider> | null = null;
  // Populated by subscribe fan-out — `subjectRef → owning provider`. Lets
  // `revoke(claim)` route to the provider that issued the claim instead of
  // broadcasting (code review M-2). Subject-ref provenance is the only
  // routing signal that survives the magic-link `optionKey` vs claim shape
  // mismatch (claim carries `provider`/`adapter` but not `channel`).
  private claimOwnerCache: Map<string, IdentityProvider> = new Map();

  constructor(private readonly providers: readonly IdentityProvider[]) {}

  async discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]> {
    // `Promise.allSettled` (not `Promise.all`) so one wrapped provider's
    // discover failure does not collapse the picker. Partial discovery is
    // better UX than a blank picker — adopters with three IdPs configured
    // and one IdP whose `.well-known/openid-configuration` is briefly
    // unreachable still see the other two (code review L-3).
    const settled = await Promise.allSettled(
      this.providers.map(async (provider) => {
        const offered = await provider.discover(formAssuranceRequirements);
        return { provider, offered };
      }),
    );
    const cache = new Map<string, IdentityProvider>();
    const result: IdpOption[] = [];
    for (const entry of settled) {
      if (entry.status === 'rejected') {
        console.warn('CompositeIdentityProvider.discover: wrapped provider failed', entry.reason);
        continue;
      }
      const { provider, offered } = entry.value;
      for (const option of offered) {
        const key = optionKey(option);
        if (cache.has(key)) continue; // first-wins dedup
        cache.set(key, provider);
        result.push(option);
      }
    }
    this.optionOwnerCache = cache;
    return result;
  }

  async authenticate(option: IdpOption): Promise<IdentityClaim> {
    const owner = await this.ownerFor(option);
    if (!owner) {
      throw new Error('No identity provider can authenticate this option');
    }
    const claim = await owner.authenticate(option);
    this.claimOwnerCache.set(claim.subjectRef, owner);
    return claim;
  }

  async revoke(claim: IdentityClaim): Promise<void> {
    const owner = this.claimOwnerCache.get(claim.subjectRef);
    if (owner) {
      this.claimOwnerCache.delete(claim.subjectRef);
      await owner.revoke(claim);
      return;
    }
    // Claim wasn't issued through this composite (e.g., the host code
    // synthesized one for testing, or a prior session was restored via a
    // different code path). Fall back to broadcast — adapters that don't
    // recognize the claim no-op per their own contract.
    await Promise.allSettled(
      this.providers.map((provider) => provider.revoke(claim)),
    );
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    // Each wrapped provider delivers the current value on subscribe and
    // emits on authenticate / revoke. With N providers we would see N
    // initial `null` events at subscribe time, and a `revoke()` fan-out
    // produces N redundant `null` emissions when one happens. Collapse
    // equal consecutive emissions so the conformance contract —
    // `[null, claim, null]` for a single authenticate→revoke cycle —
    // holds for the composite. claimEquivalent is provider+adapter+subject
    // emission dedup, NOT same-subject-across-providers dedup (arch L-3).
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
    let cache = this.optionOwnerCache;
    if (!cache) {
      // `authenticate` called before `discover` — populate the cache by
      // running discover at no floor and routing through the populated map.
      await this.discover();
      cache = this.optionOwnerCache;
    }
    return cache?.get(target);
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

// Identity-key derived from the user-facing IdP shape (kind + the
// kind-specific identity field). Intentionally excludes `displayName` and
// `minAssurance` — a deployment with two same-issuer OIDC entries that
// differ only in display label SHOULD dedupe to one. If two adapters offer
// the same option with different assurance floors, first-wins is correct
// per the design's call-site ordering rule (code review L-2).
function optionKey(option: IdpOption): string {
  if (option.kind === 'oidc') return `oidc:${option.issuer}`;
  if (option.kind === 'magic-link') return `magic-link:${option.channel}`;
  return 'anonymous';
}
