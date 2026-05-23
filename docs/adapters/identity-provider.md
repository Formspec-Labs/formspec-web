# IdentityProvider Adapters

The reference identity set contains three adapters:

- `AnonymousAdapter` mints an L1 anonymous claim with `provider: "anonymous"` and
  a `crypto.randomUUID()`-keyed `subjectRef`.
- `OidcAdapter` wraps an `oidc-client-ts` driver and normalizes OIDC users into
  the §6.6 `IdentityClaim` shape. ACR values must map to Formspec L1-L4
  assurance levels; unknown ACR values fail instead of silently downgrading.
- `MagicLinkAdapter` consumes `NotificationDelivery` to send a link, then calls
  an injected exchange callback that mints the canonical claim.

All adapters use `subscribe()` to emit authenticate and revoke transitions. OIDC
bearer tokens for HTTP adapters are passed by the composition through
`HttpClient.accessToken`; invalid upstream tokens surface as Problem JSON.

The respondent runtime only auto-authenticates anonymous identity at boot. OIDC
redirects and magic-link sends are side-effectful and are reserved for an
explicit sign-in surface.

Run:

```bash
npm test -- tests/adapter-conformance/identity-provider
npm test -- tests/adapters/identity
```
