# ADR-0008 — Reference deployment composition: formspec-stack adapter set

**Date:** 2026-05-22
**Status:** accepted (renamed 2026-05-22 from `0008-upstream-services-map.md`; reframed under web ADR-0009)
**Subordinate to:** web ADR-0009

## Context

Per web ADR-0009, formspec-web's architecture is the **ports**; specific backend services are reference adapters. This ADR documents the composition the **formspec-stack reference deployment** uses — one worked example of how the ports wire up against the formspec-stack's own backend services (formspec-server, workspec-server, the Trellis substrate). It is illustrative for adopters running the same stack and pedagogical for adopters running their own.

**This composition is NOT formspec-web's architecture.** It is one composition. Adopters running Firebase + Resend + Cloudflare Workers compose differently; adopters running on AWS GovCloud with login.gov compose differently again. The OSS charter (web ADR-0001) commits to making all such compositions equally viable; this ADR documents one.

## Decision: per-port wiring in the formspec-stack composition

### `DefinitionSource`

- **Reference adapter:** `HttpDefinitionAdapter` fronted by a CDN (Cache-Control + ETag for content-addressed URL+version pairs).
- **Talks to:** formspec-server's definition endpoint.
- **Alternate compositions:** static bundle (forms shipped in build), headless CMS (Contentful, Sanity), Firestore document, GraphQL endpoint.

### Issuer resolution (engine-owned; not a formspec-web port)

Per web ADR-0009 §"Not in the constitutional inventory" (a), issuer resolution lives upstream in `formspec/packages/formspec-engine/src/issuer/IssuerStore.ts`. The composition root wires a `FetchIssuerFetcher` strategy into `IssuerStore` at boot — there is no formspec-web port to re-implement.

- **formspec-stack composition's fetcher:** routes issuer-document fetches through formspec-server's caching proxy (avoids browser-side CORS issues with arbitrary issuer URLs).
- **Alternate composition fetchers:** direct browser fetch (when CORS is configured at the issuer); inline issuer (declared in Definition); host-injected (white-label per [web ADR-0006](0006-issuer-sidecar-spec-request.md)).

### `DraftStore`

- **Reference adapter:** `HttpDraftAdapter` against formspec-server's draft endpoint.
- **Talks to:** formspec-server's draft persistence (backed by `stack-common-postgres`).
- **Alternate compositions:** Firestore, Supabase, IndexedDB-only (offline single-device), session-only (no cross-session resume).

### `SubmitTransport`

- **Reference adapter:** `HttpSubmitAdapter` POSTing an `IntakeHandoff` per `formspec/schemas/intake-handoff.schema.json` (`initiationMode: "publicIntake"`).
- **Talks to:** formspec-server's submit endpoint (which lands the response in the Respondent Ledger and may emit downstream events).
- **Alternate compositions:** Firebase Functions / AWS Lambda / Cloudflare Workers, custom webhook, queued-replay (offline submit per FW-0044).

### `IdentityProvider`

- **Reference adapters in the formspec-stack composition** (illustrative — not architectural):
  - `OidcAdapter` against an OIDC issuer configured per-deployment (login.gov, ID.me, Auth0, Okta, Entra, etc.).
  - `MagicLinkAdapter` for deployments that want passwordless email without a third-party IdP — uses the `NotificationDelivery` port. The MVP formspec-stack composition wires the stub notification adapter because `formspec-server` does not yet expose the notification endpoint tracked as EXT-19.
  - `AnonymousAdapter` for forms not requiring auth.
- **Alternate compositions:** `FirebaseAuthAdapter`, `SupabaseAuthAdapter`, `ClerkAdapter`, custom adopter adapter against Cognito / Keycloak / Azure AD / etc.
- See web ADR-0007 for the port contract and §6.6 normalization invariant.

### `NotificationDelivery` (transport-only)

Per web ADR-0009, `NotificationDelivery` is a transport port — it sends a message via a channel and is opaque to formspec-web. Template authoring (audience, copy, scheduling) lives upstream; the formspec-stack composition consumes `work-spec/schemas/sidecars/wos-delivery.schema.json#/$defs/NotificationsBlock` for that.

- **MVP reference adapter:** stub notification delivery for local magic-link development; the generated link is observable locally and no external message is sent.
- **Intended reference adapter after EXT-19:** `HttpNotificationAdapter` against a formspec-server notification endpoint backed by `formspec-server-email` or another adopter-pluggable provider (host SMTP, SES, SendGrid, Twilio, etc.).
- **Alternate compositions:** Resend, SendGrid, SES, Twilio (SMS), Postmark, Mailgun direct from the browser (with API key proxying), Firebase Cloud Messaging.

When wired into the formspec-stack composition, `MagicLinkAdapter` (an `IdentityProvider` adapter — see web ADR-0008's `IdentityProvider` section) consumes this port via constructor injection per web ADR-0009 §"Composition lifecycle." The cross-port composition is explicit; the shell does not orchestrate it. Until EXT-19 lands, do not claim production magic-link email delivery from the reference composition.

### `StatusReader` (post-MVP — port shape pending per-port ratification)

Per web ADR-0009 §"Not in the constitutional inventory" (b), the `StatusReader` port shape will be ratified as its own ADR when consumer code (FW-0039) lands. This section documents the formspec-stack composition's intended adapter when that happens.

- **Intended reference adapter:** `ProxiedApplicantStatusAdapter` that reads from WOS's `applicant.schema.json` surface (per `work-spec/specs/api/applicant.md`) via a formspec-server proxy.
- **Why proxy:** keeps formspec-web's auth methods from leaking into WOS's `LoginKind` contract (per web ADR-0007); cross-tenant boundary enforced server-side per stack-root [ADR-0068](../../../thoughts/adr/0068-stack-tenant-and-scope-composition.md) D-1 + D-3.
- **Alternate compositions:** direct adopter case-management API, polling endpoint, webhook subscription, no-op.

### `BundleSource` (post-MVP — port shape pending per-port ratification)

Per web ADR-0009 §"Not in the constitutional inventory" (b), the `BundleSource` port shape will be ratified as its own ADR when consumer code (FW-0003 / FW-0052) lands. This section documents the formspec-stack composition's intended adapters when that happens.

- **Intended reference adapters:** `HttpBundleAdapter` for fetching from any Trellis store URL; `FileDropAdapter` for drag-drop (primary verifier path — preserves J-007's "verify without contacting us" promise per web `CLAUDE.md`).
- **Why direct:** the verifier MUST NOT depend on a single service for bundle access — the bundle is content-addressed and self-verifying.
- **Alternate compositions:** IPFS, S3 with signed URLs, peer-to-peer.

### `Verifier` (post-MVP — port shape pending per-port ratification)

Per web ADR-0009 §"Not in the constitutional inventory" (b), the `Verifier` port shape will be ratified as its own ADR when consumer code (FW-0003) lands. Output is expected to conform to `stack-common-proof::ProofReportVerdict` — the TS mirror of this Rust type is tracked in the upstream extension queue (EXT-11).

- **Intended reference adapter:** `WebCryptoVerifierAdapter` wrapping `@formspec/signature-adapter-webcrypto` + `@integrity-stack/cose`. Pure-TS, no WASM, COSE_Sign1 + ed25519 / P-256 / RSA-PSS.
- **Talks to:** browser's native Web Crypto API. No service.
- **Alternate compositions:** WASM-bundled `trellis-verify-wos` (post-Phase-2, when BBS+ / SD-JWT selective-disclosure ships); `ServerProjectedAdapter` against `formspec-server-verifier-integrity` for heavy bundles.

## Authorization at upstream services

Per stack-root [ADR-0117](../../../thoughts/adr/0117-authorization-engine-selection.md), OpenFGA is the seed adapter for the auth-engine port. The formspec-stack composition's upstream services (formspec-server's auth port) dispatch to whatever auth engine the deployment configures. formspec-web does NOT implement Zanzibar checks directly — that lives in the upstream service.

## Frontend surface architecture (cross-stack consistency)

Per stack-root [ADR-0128](../../../thoughts/adr/0128-frontend-surface-architecture.md), formspec-web is one of multiple frontend surfaces (Studio / Caseworker / Admin live elsewhere). This composition does not consolidate roles into formspec-web.

## Verifier distribution

Per stack-root [ADR-0131](../../../thoughts/adr/0131-verifier-distribution.md), the browser verifier in formspec-web is one of four distribution modes. The other three (CLI `integrity-verify-cli`, embedded-library `@integrity-stack/signature-*`, reproducible bundle) are sibling deliverables; formspec-web does not own the verifier exclusively.

## Consequences

- **The formspec-stack reference deployment has two HTTP base URLs at deploy time:** `FORMSPEC_SERVER_URL` (primary), `WORKSPEC_SERVER_URL` (secondary, post-MVP).
- **No HTTP base URL is hardcoded into the composition** — environment variables drive the wiring; the composition root reads them.
- **PDF rendering** for trail-sign cover (FW-0006), signed receipt paper (FW-0009), deletion receipt (FW-0043) — in this composition — routes through `formspec-server-pdf` per stack-root [ADR-0141](../../../thoughts/adr/0141-rendering-service-architecture.md) (rendering service).
- **The four-dimensional verifier verdict** from `stack-common-proof::ProofReportVerdict` is rendered for FW-0003 (post-MVP).
- **Adopters running a different stack** swap any port's adapter without forking formspec-web. The composition root is the only file they touch.

## Related decisions

- web ADR-0009 — hexagonal architecture (constitutional)
- web ADR-0004 — consume the SPEC, not specific services
- web ADR-0007 — `IdentityProvider` port contract
- stack-root [ADR-0117](../../../thoughts/adr/0117-authorization-engine-selection.md), [ADR-0128](../../../thoughts/adr/0128-frontend-surface-architecture.md), [ADR-0131](../../../thoughts/adr/0131-verifier-distribution.md), [ADR-0141](../../../thoughts/adr/0141-rendering-service-architecture.md) — cross-stack architectural constraints this composition honors
