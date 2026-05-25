# FW-0028 slice 1 — Multi-IdP picker implementation plan

**Date:** 2026-05-24
**Status:** in build
**Design:** [`thoughts/specs/2026-05-24-fw-0028-multi-idp-picker-design.md`](../specs/2026-05-24-fw-0028-multi-idp-picker-design.md)

## Scope

Slice 1 ships:

1. `CompositeIdentityProvider` composing adapter implementing the existing
   `IdentityProvider` port.
2. Picker-aware `signInOptionsForIdentityPolicy` helper change — surface the
   full discovered set (with anonymous as "Continue without an account")
   when `options.length > 1`.
3. `AuthRequiredSurface` copy updates — heading becomes "Choose how to
   sign in" when picker shows >1 option; anonymous label becomes
   "Continue without an account".
4. `bootIdentity` accepts and passes `formAssuranceFloor: AssuranceLevel`
   to `discover()` (default `'L1'`).
5. Conformance suite covers the composite.
6. Per-composite + per-helper + per-UI tests.
7. Adopter doc extends `docs/ports/identity-provider.md` with the composite
   example.

Slice 2 (separate row) defers: re-discover-on-form-load + assurance
step-up + per-IdP scope narrowing + duress-aware filtering + cross-IdP
continuity.

## Tasks (TDD: each task ships red → green → refactor in one commit)

### Task 1 — `CompositeIdentityProvider` adapter (composing)

**Red:** Add `tests/adapters/composing/identity-provider.test.ts`:

- `discover()` unions wrapped providers' options.
- `discover('L3')` filters out wrapped providers' sub-L3 options.
- `authenticate(option)` routes to the owning provider (matched by option
  shape).
- `authenticate(option)` with no owner throws.
- `revoke(claim)` fans out across wrapped providers.
- `subscribe(listener)` delivers the initial `null` exactly once
  (collapsed across wrapped providers).
- `subscribe(listener)` fires when any wrapped provider's session changes.
- Dedup: two anonymous providers in the composite yield one anonymous
  option in `discover()` output (first-wins by ordering).

**Green:** Create `src/adapters/composing/identity-provider.ts` with
`CompositeIdentityProvider` + `createCompositeIdentityProvider`. Implement
per the design doc.

**Refactor:** Extract option-key helper if useful.

### Task 2 — Conformance suite extension

**Red:** Add a `defineIdentityProviderConformance('composite IdentityProvider
conformance', ...)` block in
`tests/adapter-conformance/identity-provider/conformance.test.ts` wrapping
an anonymous + a magic-link adapter.

**Green:** The composite must already pass; the test confirms the
conformance suite holds.

**Refactor:** None expected; if the suite's `subscribe` expectation
(`[null, claim, null]`) trips, fix the composite's initial-null collapse.

### Task 3 — `signInOptionsForIdentityPolicy` picker policy

**Red:** Extend `tests/app/respondent-flow.test.ts` with:

- `anonymous-allowed` + production + `options.length === 1` (only anonymous)
  → returns `[]` (boot auto-selects, no picker).
- `anonymous-allowed` + production + `options.length === 2` (anonymous +
  oidc) → returns `[oidc, anonymous]` in that order.
- `anonymous-allowed` + production + `options.length === 3` (anonymous +
  two oidc) → returns all three.
- `anonymous-allowed` + demo → returns `[]` (demo never shows picker).
- `oidc-required` + production + multi-OIDC → returns the OIDC options
  (existing behavior preserved); anonymous filtered out.

**Green:** Update `signInOptionsForIdentityPolicy` to:

```ts
export function signInOptionsForIdentityPolicy({...}): IdpOption[] {
  if (runtimeMode !== 'production') return [];
  if (identityMode === 'oidc-required') {
    return options.filter((option) => option.kind === 'oidc');
  }
  // anonymous-allowed: show picker when there's a real choice.
  if (options.length <= 1) return [];
  return [...options];
}
```

**Refactor:** None expected.

### Task 4 — `bootIdentity` accepts assurance floor

**Red:** Extend `bootIdentity` signature with
`formAssuranceFloor: AssuranceLevel = 'L1'` and pass it through.
`tests/app/respondent-runtime.test.tsx` continues to pass with default
floor.

**Green:** Update `RespondentRuntime.tsx:522` `bootIdentity`. Call
`identityProvider.discover(formAssuranceFloor)`.

**Refactor:** None expected.

### Task 5 — `AuthRequiredSurface` heading + anonymous copy

**Red:** Add tests to `tests/app/respondent-runtime.test.tsx`:

- Heading reads `Choose how to sign in` when `options.length > 1`.
- Anonymous button label reads `Continue without an account`.
- Heading stays `Sign in to continue` when `options.length === 1`.

(Vocabulary firewall is enforced by the rendering check itself — the
component never emits OIDC / ACR / IdP / IdpOption strings.)

**Green:** Update `AuthRequiredSurface` (`RespondentRuntime.tsx:883`):

- Heading conditional on `options.length > 1`.
- `idpOptionLabel` anonymous branch returns `Continue without an account`.
- Per-option button label: `${option.kind === 'anonymous' ? label : 'Sign in with ' + label}` — anonymous gets its own copy that doesn't say "Sign in with".

**Refactor:** None expected.

### Task 6 — Adopter doc

Update `docs/ports/identity-provider.md`:

- Add a "Composing multiple providers" section with the
  `createCompositeIdentityProvider([...])` example.
- Document the routing rule (option-shape match; first-wins on duplicate
  options).
- Cross-reference web ADR-0007 and the design doc.

No new file. No new ADR. The web ADR-0011 capability key
(`identityContinuity`) is unchanged.

### Task 7 — PLANNING row update

Update `PLANNING.md` FW-0028:

- Status: `open` → `live (slice 1)`.
- Add `Canonical shape:` line pointing at the design doc.
- Add `Progress (2026-05-24):` line listing what slice 1 delivered.
- Name the slice-2 release gaps explicitly.
- File any follow-on rows (per design §"Release gaps").

### Task 8 — Validators + commit + parent submodule pointer

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm run test:unit` — pass.
- `npm run test:conformance` — pass (composite picks up the
  `defineIdentityProviderConformance` block).
- Commit per-task with explicit paths (parallel-craftsman safety).
- Stage the parent submodule pointer bump (do NOT push).

## Non-goals (filed in design doc §"Release gaps")

- Form-driven OIDC scope narrowing (slice-2 follow-on).
- Per-form assurance step-up (slice 2; needs EXT-8).
- Cross-IdP identity continuity (FW-0020).
- Federated handoff (FW-0030).
- Passkey-first adapter (FW-0031; needs SC-4).
- Coercion-aware filter (FW-0048 / FW-0059 build).
- Long-list picker affordance.
