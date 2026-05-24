# ADR-0011 - Runtime feature resolution and policy gates

**Date:** 2026-05-23
**Status:** accepted
**Subordinate to:** web ADR-0004, web ADR-0008, web ADR-0009, web ADR-0010
**Applies to:** respondent-facing post-MVP features, deployment composition, tenant policy, form policy

## Context

The respondent backlog now includes real product capabilities that not every deployment, issuer, or form should enable: production status, respondent-place obligations, document library, cross-issuer history, signed receipts, erase receipts, lifecycle actions, offline submit, identity continuity, uploads, payments, embeds, multi-party submission, safe-address handling, and reviewer/preparer flows.

A single feature flag cannot model this. A form can request a feature that the instance cannot technically support. An organization can prohibit a feature that the instance supports. An instance can ship an adapter that only some organizations may use. Some features are optional affordances; others are required for the form to be legally or operationally valid.

formspec-web needs one architecture rule for these cases before those features land one by one.

## Decision

formspec-web resolves runtime features through three policy layers and one computed output:

1. **Instance capabilities** - what this deployment can technically do.
2. **Org runtime policy** - what this issuer, tenant, or organization allows, requires, or forbids.
3. **Form runtime policy** - what this specific form requires, allows, or forbids.
4. **Resolved runtime profile** - the read-only result consumed by the React shell.

The React shell MUST render from the resolved runtime profile. It MUST NOT inspect raw instance, org, or form policy independently.

### Instance capabilities

Instance capabilities are deployment-owned and adapter-backed. They answer: "Can this running instance perform the feature at all?"

Examples:

| Capability | Evidence |
|---|---|
| `status` | Production `StatusReader` adapter/proxy; unavailable sentinel records known absence |
| `respondentPlace` | Production `RespondentPlaceSource` wallet/storage adapter; unavailable sentinel records known absence |
| `tokenBag` | Client-side multi-issuer authorization handle storage |
| `documentPresentation` | Encrypted wallet storage plus VC/OpenID4VP adapter stack |
| `receiptPortal` | Receipt storage, bundle export, verifier path |
| `eraseReceipt` | Deletion receipt sidecar and storage erasure hooks |
| `recordLifecycle` | Ledger events for correction, withdrawal, dispute, and revocation |
| `offlineSubmit` | Service worker, IndexedDB queue, idempotent submit transport |
| `identityContinuity` | Identity provider/session adapter with assurance continuity |
| `fileUpload` | Object store, attachment binding, upload policy enforcement |
| `payment` | Payment rail adapter and idempotent submit/payment transaction boundary |
| `embed` | iframe/web component transport and CSP/origin enforcement |
| `multiParty` | Party/session orchestration and per-party visibility support |
| `safeAddress` | Privacy/redaction substrate and verifier-compatible protected fields |
| `reviewerPreparer` | Reviewer/preparer sharing, role, and permission model |

Demo stubs MAY satisfy demo capabilities only when the composition is explicitly in demo mode. Production stubs do not satisfy production capabilities. Production unavailable sentinels satisfy only "known unavailable" checks; they do not enable features.

### Org runtime policy

Org policy is tenant-owned. It answers: "May this issuer or organization use this feature, and under what limits?"

Each feature can be:

- `forbidden` - the org prohibits the feature.
- `allowed` - the org permits the feature when the form asks for it.
- `default-on` - the org enables the feature for forms that do not opt out.
- `required` - the org requires the feature for applicable forms.

Org policy also carries limits: allowed origins, accepted IdPs, assurance floors, retention windows, payment methods, upload size limits, file classes, reviewer roles, safe-address jurisdiction rules, and deletion/legal-hold constraints.

#### Non-form surface synthesis (addendum, FW-0039)

The original §Form runtime policy text frames the form-policy layer as **form-owned only**. FW-0039 slice 1 surfaced a recognized pattern that bends the framing: **non-form surfaces** that consume a feature key (e.g., `/status?case={urn}` rendered by `StatusRuntime`) have no `FormDefinition` and therefore no form-policy layer of their own, but they still need the resolver to evaluate `instance × org` against an actual request. The pattern these surfaces use is to **synthesize a form-policy fragment at the route boundary** — `form: { features: { status: 'optional' } }` for the `/status` route — so the resolver sees a request and the natural `optional-no-instance | org-forbidden | form-forbidden` branches drive the plain-language "Status not shared" copy. The synthesis is strictly OPTIONAL — never `required` — so an unavailable instance falls off as `optional-no-instance` rather than raising a typed `UnsupportedRequiredFeatureError` that abuses the form-load error boundary for a surface that has no form.

This is a recognized synthesis pattern, not a special case: any non-form surface that needs to gate on a feature key follows the same shape. The worked example lives in [`thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md`](../plans/2026-05-23-fw-0039-post-submit-status-surface.md) (`src/app/StatusRuntime.tsx` §runtime-profile resolution).

**Implication for FW-0066** (`FormRuntimePolicyExtractor` port promotion): when the trigger fires, the port must accommodate non-form-surface synthesis as a first-class operation — not a route-side hack. Either (a) the port accepts a second-shape "route-derived" request alongside the "definition-derived" request, or (b) non-form surfaces continue to bypass the port and assert the request literally with the same OPTIONAL-only discipline. FW-0066's row carries the choice; this addendum is the upstream authority the FW-0066 caveat sub-bullet points at.

**FW-0066 closed (2026-05-24) — Option B holds.** The port promoted with the single-method `extract(definition)` shape; narrowed-route compositions wire `EmptyFormRuntimePolicyExtractor` into the slot to satisfy the type contract, and `StatusRuntime` / `ObligationsRuntime` / `DocumentsRuntime` continue to synthesize their request literally at the route boundary per this addendum. The closure-typed slot is gone (no shim) per project no-shims discipline; see [`thoughts/specs/2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md`](../specs/2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md).

### Form runtime policy

Form policy is form-owned. It answers: "What does this form need?"

Each feature can be:

- `forbidden` - this form must not expose the feature.
- `optional` - this form can use the feature when the resolved profile enables it.
- `required` - this form is invalid without the feature.

Examples:

- A fee-bearing form requires `payment`.
- A form with attachment fields requires `fileUpload`.
- A form that promises an applicant status page requires `status`.
- A joint filing form requires `multiParty`.
- A protected-party form requires `safeAddress`.
- A form that must work in a kiosk may forbid `identityContinuity` and require `publicTerminalHygiene` when that feature lands.

### Resolution

Feature resolution is deterministic:

1. Start with instance capabilities.
2. Apply org policy.
3. Apply form policy.
4. Produce a resolved runtime profile with enabled features, disabled optional features, limits, and configuration errors.

The resolved runtime profile is immutable for a loaded form/session. If identity, issuer, locale, or form version changes in a way that affects policy, the shell MUST recompute a new profile and restart the affected flow boundary.

## Failure Semantics

formspec-web MUST throw typed configuration errors when a form is placed on an instance or under an org that cannot support a required feature.

Errors are required in these cases:

| Condition | Error |
|---|---|
| Form requires a feature the instance does not support | `UnsupportedRequiredFeatureError` |
| Form requires a feature the org forbids | `FeaturePolicyConflictError` |
| Org requires a feature the instance does not support | `OrgPolicyUnsatisfiedError` |
| Form forbids a feature the org requires | `FeaturePolicyConflictError` |
| Feature is enabled but its adapter is an unavailable production sentinel | `UnsupportedRequiredFeatureError` when required; disabled when optional |
| Feature's configured limits are incomplete or invalid | `InvalidRuntimePolicyError` |

Optional features behave differently:

- If a form marks a feature `optional` and the instance or org cannot support it, the resolver disables the feature and records why.
- If an org marks a feature `default-on` but the instance cannot support it, the resolver disables it unless org policy also marks it `required`.
- If a feature is disabled, UI for that feature is hidden or replaced by an explicit unavailable state only when the user already has context for it.

The respondent must not see a raw stack trace. The shell catches typed configuration errors at the form-load boundary and renders a plain-language unavailable page with a support reference. Tests and production telemetry preserve the typed error code.

Silent downgrade is forbidden for required features. A payment-required form without a payment rail is not a free form. A multi-party form without party orchestration is not a single-party form. A status-required form without `StatusReader` is not a form with an empty status page.

## Feature Ownership Table

| Feature | Instance capability | Org policy | Form policy |
|---|---|---|---|
| Production status | `StatusReader` adapter/proxy | issuer exposes applicant status | status required/optional |
| Obligations stream | respondent-place storage plus token bag | issuer participates in client aggregation | obligations emitted |
| Document library | encrypted wallet plus document metadata adapter | allowed document classes and retention | document evidence requested |
| Selective presentation | VC/OpenID4VP stack | accepted presentation protocols | presentation required/optional |
| Cross-issuer history | durable respondent-place storage | retention/export rules | submission contributes records |
| Signed receipt | receipt/export/verifier infra | receipt policy | receipt required |
| Deletion receipt | erasure hooks plus deletion receipt sidecar | retention and legal holds | erasure allowed/required |
| Amend/withdraw/dispute | lifecycle ledger events | windows and allowed actions | lifecycle actions allowed |
| Offline submit | browser queue plus idempotent transport | offline allowed for issuer | form marked offline-safe |
| Identity continuity | identity/session adapter | accepted IdPs and assurance floors | assurance required |
| File upload | object store plus attachment binding | file limits and classes | attachment fields |
| Payments | payment rail adapter | merchant account and rail policy | fees required |
| Embed/widget | iframe/web component transport | allowed origins and CSP | form embeddable |
| Multi-party | party/session orchestration | allowed party roles | party model declared |
| Safe address | privacy/redaction substrate | jurisdictional protection policy | protected fields declared |
| Reviewer/preparer | sharing and role model | allowed reviewer/preparer roles | review/preparer allowed |

## DI and Port Rule

A feature cannot become production-enabled unless both conditions are true:

1. The deployment has an adapter-backed instance capability.
2. The resolved policy permits or requires the feature.

This extends web ADR-0009 and ADR-0010:

- Complex integrations enter through DI ports or explicit composition dependencies.
- Demo stubs are allowed only for demo/development.
- Production unavailable sentinels fail closed.
- App code consumes `ResolvedRuntimeProfile`, not service-specific adapters or raw policy documents.
- Conformance suites verify adapter behavior; policy-resolution tests verify feature activation and failure semantics.

## Rationale

1. **Reference deployments must be honest.** A feature cannot appear enabled because a stub returned empty data.
2. **Adopters differ.** Public agencies, nonprofits, healthcare organizations, courts, and private issuers will not choose the same identity, payment, storage, deletion, or sharing posture.
3. **Forms can be legally feature-dependent.** Some features are not conveniences. They determine whether a form is valid to present.
4. **Policy is not UI state.** UI state changes during a session. Runtime policy is a compatibility contract for the form, org, and instance.
5. **Failures should be early and typed.** A missing required capability is a deployment/configuration error, not an edge case for a respondent to discover at submit time.

## Consequences

- Future feature work should add policy-resolution coverage alongside port conformance.
- Planning rows should distinguish optional affordances from required form capabilities.
- Reference compositions must expose their real instance capabilities. Missing production adapters should be explicit unavailable sentinels.
- Forms that require unsupported features fail at load time with typed configuration errors.
- Optional features can resolve off without failing the form.
- Org policy can forbid features even when forms request them.
- Org policy can require features, but the instance must prove support before any affected form loads.

## Non-goals

- This ADR does not define the final JSON schema for instance, org, or form policy documents.
- This ADR does not add every future feature port now.
- This ADR does not force every deployment to enable respondent-place, payments, multi-party flows, safe-address handling, or reviewer/preparer flows.
- This ADR does not make formspec-web the owner of upstream primitives. Per web ADR-0004, upstream specs still own portable primitive shape.

## Follow-on Work

- Add a `RuntimeFeatureResolver` design/implementation when the first configurable post-MVP feature beyond respondent place lands.
- Define typed configuration error classes and plain-language rendering at the form-load boundary.
- Add fixtures for required, optional, forbidden, default-on, and policy-conflict cases.
- Update future feature ADRs to name their instance capability key, org policy controls, form policy controls, and failure semantics.

## Related Decisions

- web ADR-0004 - consume primitives, do not invent them
- web ADR-0008 - reference deployment composition
- web ADR-0009 - hexagonal architecture, ports, adapters, and conformance suites
- web ADR-0010 - respondent place trust model and DI consumption
- stack-root ADR-0068 - tenant and scope composition
- Implementation plan: [`thoughts/plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md`](../plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md) — landed FW-0065 scaffolding
- Implementation plan: [`thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md`](../plans/2026-05-23-fw-0039-post-submit-status-surface.md) — worked example of the `status` capability key driving an OPTIONAL non-form surface (FW-0039 slice 1: `/status?case={WosResourceUrn}` route)
- Implementation plan: [`thoughts/plans/2026-05-23-fw-0055-respondent-obligations-stream.md`](../plans/2026-05-23-fw-0055-respondent-obligations-stream.md) — second non-form surface consuming the `respondentPlace` capability via synthetic optional form policy (FW-0055 slice 1: `/obligations` route)
- Implementation plan: [`thoughts/plans/2026-05-23-fw-0056-document-library.md`](../plans/2026-05-23-fw-0056-document-library.md) — third non-form surface; first feature ADR beyond the seeded pair, introducing `documentPresentation` to the closed `RuntimeFeatureKey` taxonomy (FW-0056 slice 1: `/documents` route; transitional port-slot sharing with `respondentPlace` until SC-4 + EXT-18 land the real VP port)
- Implementation plan: [`thoughts/plans/2026-05-23-fw-0033-file-upload.md`](../plans/2026-05-23-fw-0033-file-upload.md) — first in-form (non-route) consumer of the runtime-feature gate; introduces `fileUpload` to the closed `RuntimeFeatureKey` taxonomy + the first definition-walking form-policy extractor (FW-0066 trigger pulse #2)
- Implementation plan: [`thoughts/plans/2026-05-24-fw-0057-cross-issuer-history.md`](../plans/2026-05-24-fw-0057-cross-issuer-history.md) — fifth non-form surface; introduces `crossIssuerHistory` to the closed `RuntimeFeatureKey` taxonomy + the new `RespondentHistorySource` port (FW-0057 slice 1: `/history` route; production fan-out blocked on XS-2 multi-issuer token bag)
