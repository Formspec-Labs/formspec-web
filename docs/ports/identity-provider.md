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
