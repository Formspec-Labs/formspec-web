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

## Current Gate

Full OIDC production close is blocked by EXT-23 in `formspec-server`: per-tenant
trusted issuer config, JWKS client, and RS256 verifier. The web-side bridge now
passes the current OIDC access token into `HttpClient.accessToken` without
leaking raw tokens into `IdentityClaim`, and production `oidc-required` profiles
render an explicit sign-in surface. End-to-end sign-off still waits for the
server verifier.
