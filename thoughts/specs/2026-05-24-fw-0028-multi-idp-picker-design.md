# FW-0028 — Multi-IdP picker: composition + per-assurance filtering (design)

**Date:** 2026-05-24
**Status:** proposed
**Subordinate to:** web ADR-0007 (`IdentityProvider` port), web ADR-0009 (hexagonal architecture), web ADR-0011 (runtime feature resolution)
**Pulls forward:** PLANNING FW-0028 row body (open since 2026-05-22 reshape)

## Trigger

FW-0063 shipped the `IdentityProvider` port + four reference adapters + the
conformance suite. The port's `discover(formAssuranceRequirements?)` returns
an `IdpOption[]`, but every concrete adapter instance today represents **one
IdP**: `OidcAdapter` = one issuer, `MagicLinkAdapter` = one channel,
`HttpAnonymousIdentityProvider` / `AnonymousAdapter` = anonymous. The
`signInOptionsForIdentityPolicy` helper hard-filters the picker to `oidc`
options in the `oidc-required` production mode — anonymous-allowed deployments
that also list one or more OIDC IdPs render the auth-required surface at all
only when the form rejects anonymous boot, which never happens because the
boot path auto-selects anonymous when present.

Three things need to land for FW-0028 slice 1:

1. **A way to compose multiple `IdentityProvider` instances** behind one
   `Composition.identityProvider` slot, so a deployment can list `login.gov`,
   `ID.me`, magic-link, and anonymous side by side.
2. **The picker UI** that shows the full set when more than one is on offer,
   including a first-class "Continue without an account" affordance when the
   composition includes an anonymous option AND the deployment allows it.
3. **Form-side assurance flow into `discover()`**, so the picker omits IdPs
   below the form's required assurance bar instead of letting the user pick
   one and bounce on the post-authenticate guard. (The port's
   `formAssuranceRequirements` parameter already exists; it just has no
   call-site that supplies a non-`undefined` value today, because EXT-8 has
   not landed. This slice wires the call shape using a synthesized
   `'L1'` floor for now; the EXT-8 ratification reuses the same parameter.)

The picker design also pressure-tests the "no oversharing" half of the row
title (see §6).

## Decision

### Port shape — keep the existing `IdentityProvider` port

**Decision: no new port. Add a `CompositeIdentityProvider` composing adapter
that fans `discover` / `authenticate` / `revoke` / `subscribe` across an
ordered `IdentityProvider[]`.**

**Rejected alternative (a): new `IdentityProviderPicker` composition port
with `listAvailable()` + `select(idpId)`.** Two reasons to reject:

1. **The existing `discover() → authenticate(option)` shape is already a
   "list then select" port.** `discover(formAssuranceRequirements?)` returns
   the list; `authenticate(option)` is the select call. The
   `formAssuranceRequirements` parameter was added at FW-0063 specifically
   to support per-assurance filtering. Coining a second port duplicates the
   shape and would force the conformance suite + every adopter doc to fork.
2. **Multi-IdP composition is structurally identical to other composing
   adapters in the codebase.** `CompositeFormRuntimePolicyExtractor`
   composes `FormRuntimePolicyExtractor[]`; `CompositeIdentityProvider`
   composes `IdentityProvider[]` the same way. The composing pattern is the
   substrate primitive; new ports cost more.

**Rejected alternative (b): extend `IdentityProvider` with a separate
`select()` method distinct from `authenticate()`.** The current port already
splits enumerate vs authenticate; adding a third operation creates a
two-step authenticate-after-select flow with no semantic difference from
`authenticate(option)` and breaks every existing adapter.

### `CompositeIdentityProvider` contract

Single composing adapter, lives at
`src/adapters/composing/identity-provider.ts`. Mirrors the
`CompositeFormRuntimePolicyExtractor` shape:

```ts
export class CompositeIdentityProvider implements IdentityProvider {
  constructor(private readonly providers: readonly IdentityProvider[]) {}

  async discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]> {
    const results = await Promise.all(
      this.providers.map((p) => p.discover(formAssuranceRequirements)),
    );
    return dedupeOptions(results.flat());
  }

  async authenticate(option: IdpOption): Promise<IdentityClaim> {
    const owner = await this.ownerFor(option);
    return owner.authenticate(option);
  }

  async revoke(claim: IdentityClaim): Promise<void> {
    // Fan-out — revoke on every wrapped provider whose adapter id matches the
    // claim's `adapter` field. Adapters that don't recognize the claim are
    // no-ops by their own contract.
    await Promise.all(this.providers.map((p) => p.revoke(claim)));
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    const unsubs = this.providers.map((p) => p.subscribe(listener));
    return () => unsubs.forEach((u) => u());
  }
}
```

#### Routing rule (`authenticate`)

The composite routes an authenticate call to the wrapped provider whose
`discover()` would have returned that exact option. The implementation does
this by re-discovering on the spot and matching by `IdpOption` shape (kind +
the kind-specific identity fields: `oidc.issuer` / `magic-link.channel` /
`anonymous`). If two wrapped providers offer the same option (e.g., two
anonymous adapters), the **first** wins — call-site ordering is the
precedence signal, mirroring the `CompositeFormRuntimePolicyExtractor`
last-wins-on-collision discipline inverted for identity (first-wins because
the user pick is ambiguous otherwise; the picker dedup at the surface keeps
the displayed list clean).

Routing failure (no owner matches) throws `Error('No identity provider can
authenticate this option')` — typed as a generic Error today; the FW-0028
build can promote to a typed `UnrecognizedIdpOptionError` if a follow-on
surface needs to distinguish it.

#### Dedup rule (`discover`)

Same key as the picker UI `idpOptionKey`: `${kind}:${issuer | channel | ''}`.
First-occurrence wins.

#### Subscribe fan-out

The composite subscribes to every wrapped provider's session lifecycle.
Listeners see the same `IdentityClaim | null` events the underlying provider
emits. The initial-value contract (every `subscribe` listener sees the
current value synchronously) is preserved per wrapped provider — the
listener fires N times at subscribe, once per provider, each delivering that
provider's current claim. The shell's reducer must tolerate this (it already
does — `subscribe` invocations are session-lifecycle events, not assertions
of singularity).

The composite does NOT itself maintain a current-claim state. The shell's
existing `subscribe → setRespondentState` loop is the source of truth for
"which claim is active now"; the composite's only job is to wire the
underlying providers to that loop.

### Per-assurance filtering — wire `formAssuranceRequirements`

The port parameter exists. The shell does not pass it today
(`identityProvider.discover()` at `RespondentRuntime.tsx:525`). Slice 1
wires a synthesized `'L1'` floor through the call site and an explicit
`formAssuranceRequirements` parameter on the helper, so the shape lands.
When EXT-8 ratifies, the form-runtime-policy extractor reads the
form-declared assurance level out of the loaded `FormDefinition` and the
shell passes it here. Until then the picker shows everything ≥ L1 (which is
everything).

The wiring point is `bootIdentity`:

```ts
async function bootIdentity(
  identityProvider: IdentityProvider,
  formAssuranceFloor: AssuranceLevel = 'L1',
): Promise<{ claim: IdentityClaim | null; options: IdpOption[] }> {
  const options = await identityProvider.discover(formAssuranceFloor);
  // ... unchanged ...
}
```

The shell does not yet have the form's assurance requirement at boot time —
the form definition is loaded AFTER identity is established. Two paths:

- **Slice 1 (this row).** Pass `'L1'` as the synthesized floor; the picker
  filters out nothing today. The full integration with form-side assurance
  needs EXT-8 + a re-discover step after the form loads, which is slice 2.
- **Slice 2 (FW-0028 follow-on).** After the form loads, re-discover with
  the form's actual `requiredAssurance`; if the active claim's assurance is
  below the bar, surface a step-up prompt offering only the IdPs that meet
  the bar. This is the FW-0030 (federated identity claim handoff) flow.

Slice 1 ships the call shape + the composite; slice 2 ships the re-discover
+ step-up.

### Picker UI — multi-mode `AuthRequiredSurface`

Today's `AuthRequiredSurface` (in `RespondentRuntime.tsx`) already renders
N buttons from `IdpOption[]`. Three holes to plug:

1. **The `signInOptionsForIdentityPolicy` helper hard-filters to `oidc`
   only in `oidc-required` mode** and returns `[]` everywhere else. Result:
   `anonymous-allowed` deployments NEVER render the picker — boot auto-
   selects anonymous and the user never sees alternatives. **Replace** with
   a policy that returns the full discovered set (minus anonymous) when in
   `oidc-required` mode AND the full set (including anonymous as
   "Continue without an account") when in `anonymous-allowed` mode AND
   `options.length > 1`. When `options.length <= 1`, the boot auto-select
   logic stays — single-option deployments do not need a picker.
2. **Anonymous label.** `idpOptionLabel` returns `'anonymous access'`
   today. **Replace** with `'Continue without an account'` (vocabulary
   firewall: user-visible copy never says "anonymous").
3. **Heading copy.** Today's heading is `Sign in to continue`. When the
   picker shows >1 option, change to `Choose how to sign in`. When the
   picker shows the anonymous "continue without" option alongside sign-in
   options, the heading stays `Choose how to sign in` (the anonymous option
   is a sign-in alternative, semantically).

The picker UI lives in the same `AuthRequiredSurface` component. No new
component file — FW-0028 is a behavior change to an existing surface, not a
new surface. (If the picker grows beyond a button list — e.g., grouped by
assurance level, search affordance for long IdP lists — a `IdpPicker`
component file extracts then. Not slice 1.)

### Composition wiring

The `default.ts` composition factory's `identityProviderFor` currently
picks ONE of `oidc` / `magic-link` / `anonymous` per `config.ports.identityProvider`.

For slice 1, **leave the existing factory untouched** — single-IdP
deployments are still the default. The composite is opt-in via a new
composition entry point:

```ts
export function createCompositeIdentityProvider(
  providers: readonly IdentityProvider[],
): CompositeIdentityProvider {
  return new CompositeIdentityProvider(providers);
}
```

Adopters who want multi-IdP wire the composite explicitly in their fork of
`default.ts`:

```ts
const oidc = new OidcAdapter({ /* login.gov config */ });
const idme = new OidcAdapter({ /* ID.me config */ });
const anon = new AnonymousAdapter();
return {
  // ...
  identityProvider: createCompositeIdentityProvider([oidc, idme, anon]),
};
```

The `config.ports.identityProvider` enum stays at `'anonymous' | 'oidc' |
'magic-link'` for slice 1. A `'composite'` variant lands when the
config-driven path needs it (the OSS reference composition has no real
multi-IdP requirement today — login.gov + ID.me are deployment-specific
choices that adopters wire in their own fork per web ADR-0008).

The `config.identity.oidc` / `config.identity.magicLink` shape stays a
single object today; a future `config.identity.oidcs: OidcClientConfig[]`
plus the `'composite'` ports variant lands when an adopter needs the
config-driven multi-OIDC path. **No shim** — the `oidc` single-object path
is honest about its single-IdP scope; the composite is the multi-IdP
substrate, opt-in by code-level composition.

## No-oversharing constraints (slice 1 invariants)

The row title says "with no oversharing." The picker design must preserve
three invariants:

1. **The picker MUST NOT enumerate IdPs the deployment did not configure.**
   The composite returns the union of its wrapped providers' `discover()`
   output and nothing else. There is no auto-discovery of IdPs from the
   user's browser, the network, or any other source. Adopters list IdPs by
   instantiating adapters; that is the entire surface for "what IdPs does
   this deployment offer?"
2. **The picker MUST NOT request more scopes than the form needs.** Per
   per-adapter contract. `OidcAdapter` requests `'openid profile email'`
   today (`oidc.ts:191`); follow-on FW-0028 work narrows this to
   `'openid'` for forms that only need a subject ref and gates the
   `profile email` scopes behind a form-policy declaration. **Slice 1 does
   not narrow the existing scope set** — that is a behavior change to the
   already-shipped `OidcAdapter` and would risk regressing FW-0063's
   conformance assertions. Filed as FW-0028 slice 2 follow-on.
3. **The picker MUST NOT leak which IdPs the user has previously used to
   other parties.** The picker rendering is a stateless snapshot of
   `composite.discover()`. There is no "recently used" sort, no telemetry
   beacon, no per-IdP cookie set at picker render. The session-lifecycle
   `subscribe` events are intra-shell only — they never cross a network
   boundary. (Adapters individually MAY persist their own session — that
   is the adapter's contract — but the picker layer does not.)

Tests assert all three (see §Conformance below).

## Conformance + tests

The composing adapter satisfies the existing `defineIdentityProviderConformance`
suite with one wrinkle: the suite asserts `subscribe` delivers
`[null, claim, null]` for authenticate → revoke. With N wrapped providers,
the composite's `subscribe` fires N times at subscribe (one per provider),
each delivering that provider's initial `null`. The suite needs to relax to
"the first event after authenticate is `claim`; the first event after
revoke is `null`" — OR the composite collapses redundant initial-null
emissions. **Choose the latter**: the composite tracks whether it has
emitted any value yet and squashes the initial-null fan-out into a single
synchronous `listener(null)` at subscribe. This preserves the conformance
contract exactly.

New tests:

- `tests/adapters/composing/identity-provider.test.ts` — composite-specific:
  - `discover()` returns the union of wrapped providers' options.
  - `discover('L3')` filters out wrapped providers that return only sub-L3
    options.
  - `authenticate(option)` routes to the owning provider.
  - `authenticate(option)` with no owner throws.
  - `revoke(claim)` fans out across wrapped providers.
  - `subscribe` delivers the initial `null` exactly once.
  - Dedup: two anonymous providers in the composite yield one anonymous
    option in `discover()` output.
- `tests/adapter-conformance/identity-provider/conformance.test.ts` — add a
  `defineIdentityProviderConformance('composite IdentityProvider conformance', ...)`
  block that wraps two providers and runs the suite.
- `tests/app/respondent-flow.test.ts` — `signInOptionsForIdentityPolicy`
  behavior change: includes anonymous "Continue without an account" option
  in `anonymous-allowed` mode when `options.length > 1`.
- `tests/app/respondent-runtime.test.tsx` — picker UI:
  - Heading reads `Choose how to sign in` when `options.length > 1`.
  - Anonymous option button label reads `Continue without an account`.
  - Vocabulary firewall: rendered HTML does NOT contain `OIDC`, `ACR`,
    `IdentityProvider`, `IdpOption`, `acr` (case-insensitive), `IdP` as
    bare token.
  - Oversharing: composite with two `OidcAdapter` instances + one
    `AnonymousAdapter` renders exactly three buttons; no extra IdPs
    appear.

## Vocabulary firewall

User-visible copy:

- `Sign in` (existing; unchanged).
- `Choose how to sign in` (new; picker heading when >1 option).
- `Continue without an account` (new; anonymous option label).
- Existing per-IdP labels remain: `Sign in with <displayName>` for OIDC,
  `Sign in with email link` / `Sign in with SMS link` for magic-link.

Internal-only (never user-visible): `IdentityProvider`,
`CompositeIdentityProvider`, `IdpOption`, `ACR`, `OIDC`, `IdP`, `subjectRef`,
`assuranceLevel`, `L1`/`L2`/`L3`/`L4` (the L-codes are internal taxonomy;
the form's user-visible "stronger verification" copy is FW-0030's
substrate and does not ship in this slice).

## Cross-row composition

- **FW-0049 (safe-address handling)** — no direct composition. Safe-address
  is a form-data class concern; the picker layer has no protected-field
  surface.
- **FW-0048 (coercion-aware signing)** — slice 2: when FW-0048 ships
  `duressAware: required` on a form, the picker filters out IdPs whose
  adapters cannot route a coerced authenticate (duress-credential
  detection). Per-adapter capability declaration — the
  `IdentityProvider` port would extend with an optional
  `supports?: { duressCredentials?: boolean }` discovery hint. Deferred
  to FW-0028 slice 2 / FW-0059 build.
- **FW-0051 (BYO assistant)** — no composition. The assistant runs in
  respondent tools; the picker layer is the respondent's own sign-in
  surface. The assistant has no role here.
- **FW-0058 (AI-agent filer chain)** — distinct flow. Agent-filed
  submissions ride a different identity-binding path (`AgentInvoker` per
  WOS ADR-0064). The respondent picker is the human-respondent surface
  only.
- **FW-0020 (identity continuity within an issuer)** — slice 2: re-discover
  on form load + step-up affordance for under-assurance claims. The composite
  is the substrate this builds on.
- **FW-0030 (federated identity claim handoff)** — out of scope for
  slice 1. Cross-deployment identity handoff is a substrate problem; the
  picker is one surface above it.
- **FW-0031 (passkey-first sign-in)** — passkey adapter is one wrapped
  provider in the composite. The picker shows it as one option among
  others. Mature integration ships when the `PasskeyAdapter` (SC-4 + WebAuthn)
  lands; slice 1 supports a passkey IdP if an adopter wires one — the
  composite is shape-neutral about adapter type.
- **FW-0080 (consumes-Set refactor)** — parallel work; touches
  `route-narrowing.ts` + descriptors + tests. No collision: this row
  changes `default.ts` (only adds `createCompositeIdentityProvider`
  export) + adds new files under `src/adapters/composing/` and
  `tests/adapters/composing/`. Route-narrowing wires `noopIdentityProvider`
  for narrowed routes; the picker is not relevant there.

## Cross-stack dependencies (none required for slice 1)

- **EXT-8 (form-side assurance annotation).** Slice 2 unlocks the
  re-discover-on-form-load flow. Slice 1 wires the parameter shape; the
  EXT-8 ratification supplies the form-side data.
- **No new XS-N cross-stack ADR.** No upstream schema changes. No Trellis
  byte change. No WOS workflow change. The composite + picker is
  entirely formspec-web's concern.

## Release gaps (honestly named)

- **Per-IdP scope narrowing.** `OidcAdapter` still requests
  `'openid profile email'` blanket. Filing as FW-0028 follow-on
  ("Form-driven OIDC scope narrowing").
- **Per-form assurance step-up.** Re-discover on form load + step-up
  affordance for under-assurance claims. FW-0028 slice 2; depends on
  EXT-8.
- **Cross-IdP identity continuity.** Slot the same user across different
  IdPs (FW-0020); slice 2 / separate row.
- **Federated handoff.** Cross-deployment identity claim handoff
  (FW-0030); separate row, depends on SC-4 + EXT-8a.
- **Passkey-first integration.** `PasskeyAdapter` adapter (FW-0031);
  separate row, depends on SC-4 + WebAuthn substrate.
- **Coercion-aware filter.** Filter IdPs by `duressAware: required` form
  policy (FW-0048 / FW-0059 build); separate composition.
- **Long-list affordance.** Picker today is a button list; deployments
  with >10 IdPs may need search / grouping. Defer until a real adopter
  trips the threshold.

## Authority chain

- web ADR-0007 — `IdentityProvider` port spec (the port the composite
  implements).
- web ADR-0009 §Composition root pattern — substrate primitive for
  composing adapters.
- web ADR-0011 §Feature Ownership Table — `identityContinuity` is the
  capability key; multi-IdP picker rides under the same key (no new key
  needed; see §Capability key below).
- FW-0063 — `IdentityProvider` port + conformance suite (the substrate
  this slice consumes).
- `formspec/specs/audit/respondent-ledger-spec.md` §6.6 — canonical
  `IdentityClaim` shape the composite preserves (no normalization
  responsibility at the composite layer; each wrapped provider
  normalizes per FW-0063 / web ADR-0007).

## Capability key (web ADR-0011)

**No new capability key.** The existing `identityContinuity` capability
covers multi-IdP picker. Verification:

- ADR-0011 §"Feature Ownership Table" row for Identity continuity:
  *"identity/session adapter | accepted IdPs and assurance floors |
  assurance required"*. The "accepted IdPs" and "assurance floors"
  axes are exactly the picker + per-assurance filter surface.
- ADR-0011 §"Closed taxonomy" `identityContinuity` description:
  *"Identity provider/session adapter with assurance continuity"*.
  Multi-IdP composition is a strict subset of identity-provider/session
  adapter coverage.

No `multiIdP` row in the Feature Ownership Table. No ADR-0011 amendment
required for this slice. The PLANNING row already states this:
"FW-0028 (multi-IdP picker with assurance filtering) is post-MVP and
consumes the same port" (FW-0063 row body, PLANNING.md:168).

The `docs/policy/runtime-feature-resolution.md` doc has no change
required — `identityContinuity` is already documented; multi-IdP is one
implementation path under it, not a separate feature key.
