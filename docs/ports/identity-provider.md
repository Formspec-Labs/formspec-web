# IdentityProvider

`IdentityProvider` normalizes provider-specific identity flows into a canonical
`IdentityClaim` consumed by the shell and downstream ports.

Adapter contract:

- Do not expose provider-native keys (`acr`, `amr`, `aud`, `iss`, `sub`, `iat`,
  `exp`, `nbf`, `vc`, `vp`, `proofType`, `issuanceDate`) at the top level of
  `IdentityClaim`.
- If the adapter receives L3-equivalent evidence, surface
  `assuranceLevel: "L3"`; do not silently downgrade.
- Represent `privacyTier` independently from `assuranceLevel`; high-assurance
  pseudonymous identity is valid.
- Notify subscribers when claims are authenticated or revoked.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/identity-provider
```

## Composing multiple providers (FW-0028)

A deployment that offers more than one IdP (login.gov + ID.me + anonymous,
say) wires the `CompositeIdentityProvider` composing adapter behind the
single `Composition.identityProvider` slot:

```ts
import { createCompositeIdentityProvider } from 'formspec-web/src/adapters/composing/identity-provider.ts';
import { OidcAdapter } from 'formspec-web/src/adapters/identity/oidc.ts';
import { AnonymousAdapter } from 'formspec-web/src/adapters/identity/anonymous.ts';

const loginGov = new OidcAdapter({
  issuer: 'https://idp.int.login.gov',
  clientId: 'urn:gov:gsa:openidconnect:dev:formspec',
  minAssurance: 'L2',
  displayName: 'Login.gov',
});
const idMe = new OidcAdapter({
  issuer: 'https://api.idmelabs.com/oidc',
  clientId: 'idme-formspec',
  minAssurance: 'L3',
  displayName: 'ID.me',
});
const anon = new AnonymousAdapter();

const identityProvider = createCompositeIdentityProvider([loginGov, idMe, anon]);
```

The composite returns the union of its wrapped providers' `discover()` output
(deduped by option-key — `oidc:<issuer>` / `magic-link:<channel>` /
`anonymous`; first-wins on collision) and routes `authenticate(option)` to
the wrapped provider whose `discover()` would have offered that exact option.

The respondent picker (`AuthRequiredSurface` in `RespondentRuntime`) renders
"Choose how to sign in" with one button per option when more than one is on
offer. Anonymous renders as "Continue without an account" — the vocabulary
firewall keeps "anonymous" out of user-visible copy. In `oidc-required`
deployments, the picker filters to OIDC options only (anonymous is hidden).
In `anonymous-allowed` deployments with a single option, the boot path
auto-selects anonymous and the picker is suppressed.

### No-oversharing invariants

- The composite enumerates only IdPs the deployment instantiated as adapters.
  There is no auto-discovery from the user's browser, network, or any other
  source.
- Per-IdP scopes are the wrapped adapter's contract. `OidcAdapter` today
  requests `'openid profile email'`; form-driven scope narrowing is a
  slice-2 follow-on (FW-0028) that gates `profile email` behind a
  form-policy declaration.
- The picker rendering is a stateless snapshot of `composite.discover()`.
  No "recently used" sort, no telemetry beacon, no per-IdP cookie set at
  picker render. Adapters MAY persist their own session; the picker layer
  does not.

### Per-assurance filtering (slice 1)

`discover(formAssuranceRequirements?)` filters out wrapped providers whose
`minAssurance` falls below the floor. The `RespondentRuntime` shell passes
`'L1'` today; when EXT-8 (form-side assurance annotation) ratifies, the
form-runtime-policy extractor reads the form's required assurance and the
shell re-discovers with the form's actual floor after form load (slice 2;
the step-up surface ships with FW-0020).

### Cross-references

- web ADR-0007 — `IdentityProvider` port spec.
- web ADR-0009 — hexagonal architecture; composing-adapter primitive.
- web ADR-0011 — `identityContinuity` capability key (covers multi-IdP).
- Design lineage: [`thoughts/specs/2026-05-24-fw-0028-multi-idp-picker-design.md`](../../thoughts/specs/2026-05-24-fw-0028-multi-idp-picker-design.md).
