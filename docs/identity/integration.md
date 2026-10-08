# Identity Integration

`formspec-web` keeps provider-native credentials out of `IdentityClaim`. The
claim carries the normalized §6.6 identity attestation fields; raw OIDC bearer
tokens must travel through a bounded access-token provider in the HTTP adapter
composition, not through the respondent form state.

## Boot Behavior

The respondent runtime discovers available identity options at boot. It only
auto-authenticates the anonymous option because that path has no external side
effects. OIDC redirect and magic-link delivery are side-effectful and start only
from an explicit user action.

`IdentityProvider.subscribe()` is the lifecycle signal. When a later login,
logout, revoke, or subject switch changes the active `subjectRef`, the runtime
invalidates drafts for the prior subject with `DraftStore.invalidateSubject()`
and reloads the form against the new subject key.

## OIDC Configuration

Reference OIDC configuration lives on the active profile:

- `identity.oidc.issuer`.
- `identity.oidc.clientId`.
- `identity.oidc.redirectUri`.
- `identity.oidc.minAssurance`.

The `OidcAdapter` maps provider ACR values to Formspec `L1` through `L4`
assurance levels. Unknown ACR values fail. A token whose mapped assurance is
below the selected option's `minAssurance` also fails.

A deployment can override the minimum with `oidcMinAssurance` and supply an
exact JSON mapping through `oidcAcrAssuranceMapJson` in runtime configuration.
The environment equivalents are `FORMSPEC_WEB_OIDC_MIN_ASSURANCE` and
`FORMSPEC_WEB_OIDC_ACR_ASSURANCE_MAP_JSON` (also `VITE_FORMSPEC_WEB_` prefixes).
For a provider whose verified ACR `"1"` represents self-asserted identity,
explicit configuration is `oidcMinAssurance: "L1"` and
`oidcAcrAssuranceMapJson: '{"1":"L1"}'`. This mapping replaces the default
mapping for that deployment. It does not lower an authored form's minimum or
change other profiles. Missing or unmapped ACR still fails. Formspec levels
express the framework's identity assurance semantics; they do not establish
NIST authentication assurance levels. Verify the provider's actual claims
before choosing a mapping.

## Current Gate

Full OIDC production close is blocked by EXT-23 in `formspec-server`: per-tenant
trusted issuer config, JWKS client, and RS256 verifier. The web-side bridge now
passes the current OIDC access token into `HttpClient.accessToken` without
leaking raw tokens into `IdentityClaim`, and production `oidc-required` profiles
render an explicit sign-in surface. End-to-end sign-off still waits for the
server verifier.
