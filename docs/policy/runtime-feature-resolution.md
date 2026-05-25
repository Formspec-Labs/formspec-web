# Runtime feature resolution

Per [web ADR-0011](../../thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md),
formspec-web resolves runtime features from three policy layers into one
read-only `ResolvedRuntimeProfile`. The React shell renders only from the
resolved profile; it never inspects raw instance, org, or form policy.

## The three layers

1. **Instance capabilities** — `InstanceCapabilities` declared by the composition
   root, one of `'available' | 'demo-stub' | 'unavailable'` per feature key.
2. **Org runtime policy** — `OrgRuntimePolicy`, one of
   `'forbidden' | 'allowed' | 'default-on' | 'required'` per feature key.
3. **Form runtime policy** — extracted from the loaded `FormDefinition` via
   `composition.formRuntimePolicyExtractor.extract(definition)` (the
   `FormRuntimePolicyExtractor` port — promoted from a closure-typed slot at
   FW-0066), one of `'forbidden' | 'optional' | 'required'` per feature key.

## Feature keys

The closed taxonomy lives in `src/policy/feature-keys.ts`. Today's keys:

- `respondentPlace` — wallet substrate (web ADR-0010, FW-0065 seed).
- `status` — WOS applicant-API status reader (FW-0039 seed).
- `documentPresentation` — selective-presentation surface (FW-0056 slice 1
  extension, the first feature ADR beyond the seeded pair).
- `fileUpload` — attachment persistence (FW-0033 slice 1 extension; first
  key whose form-policy extractor introspects definition content — walks
  the loaded definition for `dataType === 'attachment'` fields and
  declares `required` when present).
- `crossIssuerHistory` — cross-issuer respondent history (FW-0057 slice 1
  extension; gated against the new `RespondentHistorySource` port, 1:1
  mapping). Production declares `'unavailable'` until XS-2 (multi-issuer
  client-side token bag) lands the production fan-out adapter; demo declares
  `'demo-stub'` with an in-memory fixture aggregating across two fake senders.
- `offlineSubmit` — queued offline-submit substrate (FW-0044 slice 1
  extension; **sixth key** in the closed taxonomy; gated against the new
  `OfflineSubmitQueue` port, 1:1 mapping). IN-FORM consumer — no
  standalone route; the runtime detects offline at submit time and routes
  through the queue when the resolved profile enables the feature.
  Form-policy extractor walks `definition.extensions['x-formspec-offline-submit']`
  and declares `'optional'` (NOT `'required'` — offline is a graceful
  enhancement). Production declares `'unavailable'` until the IndexedDB
  reference adapter (FW-0082) ships; demo declares `'demo-stub'` with an
  in-memory queue paired with the stub transport. The sixth-key landing
  fired FW-0080, which consolidated the `consumes*` boolean ladder on
  `RouteNarrowing` into a single `consumes: ReadonlySet<RuntimeFeatureKey>`.

Future feature ADRs extend the taxonomy; the resolver rejects unknown keys
with `InvalidRuntimePolicyError` so drift is caught at boot.

The tuple is **append-only**: future ADRs add keys at the end. Re-sorting
silently changes the resolver loop's iteration order and the contract of the
`RUNTIME_FEATURE_KEYS.toEqual(...)` tests.

### Transitional port-slot sharing (FW-0056 slice 1)

`feature-port-map.ts` maps `documentPresentation` to the same
`respondentPlaceSource` slot as `respondentPlace`. The two keys share a slot
because slice 1 has no Verifiable Presentation port to gate against — per web
ADR-0009 §"Not in the constitutional inventory," no port is ratified before
a consumer, and slice 1's selection action is local React state only. When
SC-4 (Verifiable Presentation Profile) + EXT-18 (HPKE wrapper) land a real
VP port, the slot mapping splits.

While the slot is shared, the coherence assertion enforces a per-key UNION
contract over the underlying adapter, not paired-declaration symmetry. A
key declaring `'unavailable'` does not consume the adapter, so it may pair
with any slot state without conflict; keys declaring `'demo-stub'` /
`'available'` must each match the slot adapter's provenance. Honest
combinations include `{respondentPlace: 'demo-stub', documentPresentation:
'unavailable'}` (today's demo composition — `documentPresentation` truly
absent), `{both 'unavailable'}` (today's production), and `{respondentPlace:
'available', documentPresentation: 'unavailable'}` (the SC-4 trigger: real
wallet, no VP stack — assertion accepts and the row's clearance mechanism
fires from a different gate). The assertion REJECTS `{respondentPlace:
'demo-stub', documentPresentation: 'available'}` (overclaiming production VP
while substrate is demo-only) and any other declaration that exceeds the
slot's actual provenance.

## Resolver contract

```ts
import { resolveRuntimeFeatures } from 'formspec-web/policy';

const profile = resolveRuntimeFeatures({
  mode: 'production',
  instance: composition.instanceCapabilities,
  org: composition.orgRuntimePolicy,
  form: composition.formRuntimePolicyExtractor.extract(definition),
});
```

Return shape:

```ts
interface ResolvedRuntimeProfile {
  readonly mode: 'demo' | 'production';
  readonly enabled: ReadonlySet<RuntimeFeatureKey>;
  readonly disabled: ReadonlyMap<RuntimeFeatureKey, DisabledReason>;
  readonly limits: Readonly<Partial<Record<RuntimeFeatureKey, unknown>>>;
}
```

The shell consumes the profile via `useResolvedRuntimeProfile()`.

## Typed configuration errors

`resolveRuntimeFeatures` throws on configuration that ADR-0011 §Failure
Semantics declares illegal:

| Condition | Error |
|---|---|
| Form requires a feature the instance cannot support | `UnsupportedRequiredFeatureError` |
| Form requires a feature the org forbids | `FeaturePolicyConflictError` |
| Org requires a feature the instance cannot support | `OrgPolicyUnsatisfiedError` |
| Form forbids a feature the org requires | `FeaturePolicyConflictError` |
| Required production capability backed by a demo stub | `UnsupportedRequiredFeatureError` |
| Configured limits or modes are invalid | `InvalidRuntimePolicyError` |

The form-load boundary in `RespondentRuntime` catches every
`RuntimePolicyError`, renders a plain-language unavailable page, and
preserves the typed `code` as the support reference. Telemetry asserts on
the code; never on the rendered string.

## Composition coherence

`assertCompositionCoherence` runs at composition construction
(`createStubComposition` and `createDefaultComposition`) and rejects
adapter↔declaration drift. Seven rules:

| Rule | Trigger |
|---|---|
| `sentinel-without-unavailable-declaration` | Adapter marked unavailable + declaration ≠ `'unavailable'` |
| `unavailable-declaration-without-sentinel` | Declaration = `'unavailable'` + adapter unmarked |
| `demo-stub-adapter-in-production-composition` | Adapter marked demo-stub + composition `mode = 'production'` |
| `demo-stub-adapter-without-demo-stub-declaration` | Adapter marked demo-stub + declaration ≠ `'demo-stub'` |
| `demo-stub-declaration-without-demo-stub-adapter` | Declaration = `'demo-stub'` + adapter not marked demo-stub |
| `available-declaration-paired-with-marked-adapter` | Declaration = `'available'` + adapter carries a marker |
| `shared-slot-declaration-conflict` | Two keys sharing a port slot declare incompatible provenance requirements (e.g., one `'demo-stub'` + one `'available'` against the same adapter). The `'unavailable'` declaration is the no-consumer escape — it doesn't conflict with any sibling declaration on the shared slot |

The assertion enforces ADR-0011 §Rationale #1 ("reference deployments must
be honest") — drift is caught at boot, not at feature use.

## Unavailable adapters

Production deployments that cannot satisfy a capability wire an unavailable
adapter (`src/adapters/unavailable/*`) AND set the matching
`instanceCapabilities[key] = 'unavailable'`. The unavailable adapter is
tagged with the `UNAVAILABLE_ADAPTER` symbol; the parallel `DEMO_STUB_ADAPTER`
symbol marks demo-only stubs (e.g., `src/adapters/stub/respondent-place-source.ts`).

Demo-stub capabilities satisfy `demo`-mode resolutions only — never
production. This is the enforcement teeth behind ADR-0011 §Rationale #1.

## Locale recompute

ADR-0011 §Resolution requires the shell to recompute the profile on
locale change "in a way that affects policy." Feature keys whose policy
depends on locale (e.g., a future jurisdictional safe-address handling)
register themselves in `LOCALE_CONDITIONAL_FEATURE_KEYS`.

Today the set is empty. The shell's `handleLocaleChange` checks
`anyEnabledFeatureIsLocaleConditional(profile.enabled)` and, when true,
restarts `createReadyState` via the `applyReadyStateRef` escape hatch so
the resolver sees the new locale.

A tripwire test at `tests/app/runtime-feature-locale-recompute.test.tsx`
fails the moment the set becomes non-empty, forcing the implementer to
verify the recompute path before shipping the new key.

## Adding a new feature key

0. **Coordinate the key spelling with every upstream document producer.**
   The same string flows through three places: (a) `RUNTIME_FEATURE_KEYS`
   in formspec-web, (b) the org/tenant policy document the composition
   root loads, (c) the form-definition extension field (e.g.,
   `x-formspec-runtime-policy`) the form author writes. All three MUST
   use the identical spelling. If the feature ADR lives in another repo
   (formspec-cloud, work-spec, PKAF), name the canonical spelling in the
   feature ADR and cite this doc.
1. Author the feature ADR. Name the capability key, the org-policy
   controls, the form-policy controls, and the failure semantics.
2. Add the key to `RUNTIME_FEATURE_KEYS` in
   `src/policy/feature-keys.ts` (append; do not re-sort).
3. Add the matching port entry to `FEATURE_PORT_MAP` in
   `src/policy/feature-port-map.ts` so the composition coherence
   assertion picks up the new key automatically.
4. Update every `InstanceCapabilities` declaration in composition roots
   (`src/composition/stub.ts`, `src/composition/default.ts`, adopter
   forks). Wire the matching adapter (real or unavailable sentinel) on
   the matching port slot. The composition coherence assertion runs at
   construction — declaration and sentinel MUST agree.
5. If the feature's resolved policy depends on the active locale (e.g.,
   jurisdictional safe-address handling), add the key to
   `LOCALE_CONDITIONAL_FEATURE_KEYS` in the same file. The shell's
   locale-change handler will restart the form-load boundary; the
   tripwire test at
   `tests/app/runtime-feature-locale-recompute.test.tsx` will start
   failing and must be updated with a real recompute assertion.
6. If the feature reads from the form definition, author a
   `FormRuntimePolicyExtractor` adapter (likely in
   `src/adapters/composing/form-runtime-policy-extractor.ts`) that maps the
   form's runtime-policy field to the resolver shape, and add it to the
   composition root's `formRuntimePolicyExtractor` slot — typically by
   appending it to the existing `CompositeFormRuntimePolicyExtractor` array
   so the new extractor composes with the attachment-field walker + any
   prior key's extractor. Register the adapter in the conformance suite at
   `tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts`
   with a fixture definition that exercises its happy path.
7. Add fixture cases under `tests/policy-resolution/cases/` covering
   required / optional / forbidden / default-on / policy-conflict for
   the new key.

## Adopter migration notes

The `Composition` interface gained three required fields in Task 10 of
the FW-0065 implementation:

- `instanceCapabilities: InstanceCapabilities`
- `orgRuntimePolicy: OrgRuntimePolicy`
- `formRuntimePolicyExtractor: FormRuntimePolicyExtractor` (promoted from
  a closure-typed slot at FW-0066; the closure form is gone, not aliased)

An adopter forking the composition root **will** see `tsc --noEmit`
errors until they declare all three. The minimum migration that
preserves current behavior:

```ts
import type {
  InstanceCapabilities,
  OrgRuntimePolicy,
} from 'formspec-web/policy';
import type { FormRuntimePolicyExtractor } from 'formspec-web/ports';

const composition: Composition = {
  // ...existing fields...
  instanceCapabilities: {
    respondentPlace: 'unavailable', // or 'available' if your adapter is real
    status: 'unavailable',           // or 'available' if your adapter is real
  } satisfies InstanceCapabilities,
  orgRuntimePolicy: {
    features: { respondentPlace: 'allowed', status: 'allowed' },
  } satisfies OrgRuntimePolicy,
  // Default form-policy extractor returns no requirements — features
  // resolve to `not-requested` unless the form opts in. To preserve
  // pre-FW-0065 behavior (panel always rendered), opt the form into
  // both seeded features via a small extractor instance:
  formRuntimePolicyExtractor: {
    extract: () => ({
      features: { respondentPlace: 'optional', status: 'optional' },
    }),
  } satisfies FormRuntimePolicyExtractor,
};
```

The shipped reference adapters live in
`src/adapters/composing/form-runtime-policy-extractor.ts`
(`EmptyFormRuntimePolicyExtractor`, `AttachmentRequirementExtractor`,
`CompositeFormRuntimePolicyExtractor`) and
`src/adapters/stub/form-runtime-policy-extractor.ts`
(`stubFormRuntimePolicyExtractor` — the demo-form URL-keyed opt-in,
marked `DEMO_STUB_ADAPTER`). Compose them with
`CompositeFormRuntimePolicyExtractor` instead of authoring inline
closures.

If you wire the unavailable* sentinel adapters, set the declarations to
`'unavailable'` and the assertion will pass. If you wire real production
adapters, set the declarations to `'available'`.

## Worked example: the /status route as an optional non-form surface (FW-0039 slice 1)

The `/status?case={WosResourceUrn}` route (FW-0039 slice 1) is a non-form
surface that consumes the `status` capability key. The user clicking the
"Track this application" link IS their opt-in to view status, so
`StatusRuntime` synthesizes `form: { features: { status: 'optional' } }`
at the route boundary — never `required`, so the form-load error
boundary semantics never apply (arch-review F-4 of FW-0039).

The instance × org pair drives the rendered verdict:

| Mode | Instance | Org | Page renders |
|---|---|---|---|
| any | `available` | `allowed` / `default-on` / `required` | Full status page (WOS-shaped timeline + tasks + AI disclosure + per-case timing strip). |
| any | `available` | `forbidden` | "Status not shared. This issuer does not share application status here." |
| any | `unavailable` | any | "Status not shared. This site does not provide application status." |
| `demo` | `demo-stub` | `allowed` | Full status page (demo data). |
| `production` | `demo-stub` | any | `assertCompositionCoherence` throws at composition boot — production rejects demo stubs. |

The page never raises a typed `UnsupportedRequiredFeatureError` on this
route because it never forces `status: required`. The disabled-cause
branches drive the rendered copy:

- `org-forbidden` / `form-forbidden` → "This issuer does not share application status here."
- `optional-no-instance` / `default-on-no-instance` / `production-rejects-demo-stub` → "This site does not provide application status."

When the resolver itself throws (e.g., malformed `OrgRuntimePolicy` triggers
`InvalidRuntimePolicyError`), `StatusRuntime` catches and renders a small
"not configured correctly" page with the typed error code as the support
reference — separate from the "Status not shared" copy because the failure
shape is genuinely different (deployment misconfiguration, not policy).

This pattern generalizes: any future post-MVP surface that consumes a
feature key as an OPTIONAL capability uses the same shape.
`StatusRuntime` is the worked example; the form-load boundary in
`RespondentRuntime` remains the only place `required`-policy semantics
apply.

## Worked example: the /obligations route as an optional non-form surface (FW-0055 slice 1)

The `/obligations` route (FW-0055 slice 1) is the second non-form surface
to consume the same pattern. It reads the `respondentPlace` capability
key — already seeded per web ADR-0011 §"Feature Ownership Table"
(which lists "Obligations stream" as a consumer of the respondent-place
instance capability + token bag, not a new key). `ObligationsRuntime`
synthesizes `form: { features: { respondentPlace: 'optional' } }` at the
route boundary — never `required`. The route IS the user's opt-in.

The instance × org pair drives the rendered verdict:

| Mode | Instance | Org | Page renders |
|---|---|---|---|
| any | `available` | `allowed` / `default-on` / `required` | "What you owe" dashboard with sort + section grouping + cross-sender header. |
| any | `available` | `forbidden` | "Obligations are not shared. This sender does not share an obligations view here." |
| any | `unavailable` | any | "Obligations are not shared. This site does not provide an obligations view." |
| `demo` | `demo-stub` | `allowed` | Dashboard with demo data. |
| `production` | `demo-stub` | any | `assertCompositionCoherence` throws at composition boot — production rejects demo stubs. |

The page reuses the same disabled-cause taxonomy and the same FW-0065 M-3
plumbing pattern `StatusRuntime` ratified. Unlike `/status`, the
`/obligations` route is **identity-bound** (per FW-0055 design §"Why
identity-required, not URN-keyed"): the page boots `IdentityProvider`
discovery + authenticate before reading `RespondentPlaceSource`. The
runtime-feature gate runs FIRST so a disabled `respondentPlace` short-
circuits before identity is required — there is no point asking the
respondent to sign in to see "Obligations are not shared." copy.

## Worked example: the /documents route as an optional non-form surface (FW-0056 slice 1)

The `/documents` route (FW-0056 slice 1) is the third non-form surface to
consume the synthesis pattern. It reads BOTH `respondentPlace` (the wallet
substrate) AND the new `documentPresentation` key (the selective-presentation
gate). `DocumentsRuntime` synthesizes `form: { features: { respondentPlace:
'optional', documentPresentation: 'optional' } }` at the route boundary —
never `required`. The route IS the user's opt-in.

The instance × org pair drives the rendered verdict. Document **listing** is
gated on `respondentPlace`; the selection action **always** renders the
deferred-presentation copy in slice 1 because no real VP ceremony exists in
any composition yet (the action's copy is gated by the consumer, not by the
`documentPresentation` declaration).

| Mode | `respondentPlace` instance | `respondentPlace` org | Page renders |
|---|---|---|---|
| any | `available` / `demo-stub` (demo) | `allowed` / `default-on` / `required` | "Your documents" library with per-kind sections + selection disclosure. |
| any | `available` | `forbidden` | "Your documents are not available. This sender does not provide a document library here." |
| any | `unavailable` | any | "Your documents are not available. This site does not provide a document library." |
| `demo` | `demo-stub` | `allowed` | Library with demo data. |
| `production` | `demo-stub` | any | `assertCompositionCoherence` throws at composition boot. |

Like `/obligations`, the `/documents` route is **identity-bound**: the page
boots `IdentityProvider` discovery + authenticate before reading
`RespondentPlaceSource`. The runtime-feature gate runs FIRST so a disabled
`respondentPlace` short-circuits before identity is required — there is no
point asking the respondent to sign in to see "Your documents are not
available." copy.

## Worked example: the in-form upload affordance as a required capability (FW-0033 slice 1)

`fileUpload` is the first feature key driven by **definition introspection**
rather than literal route synthesis. The composition's
`formRuntimePolicyExtractor` (specifically the
`AttachmentRequirementExtractor` reference adapter at
`src/adapters/composing/form-runtime-policy-extractor.ts`, promoted to the
`FormRuntimePolicyExtractor` port at FW-0066) walks the loaded
`FormDefinition` for any field with `dataType === 'attachment'`. If at
least one is present, the form's policy declares `fileUpload: 'required'`;
otherwise the key is absent from the form policy.

The instance × org pair drives the form-load outcome:

| Mode | Instance | Org | Form has attachment field | Page renders |
|---|---|---|---|---|
| any | `available` | `allowed` / `default-on` / `required` | yes | Form renders; field-component override uploads bytes through `AttachmentStore`; engine value becomes `AttachmentRef`. |
| any | `available` | `forbidden` | yes | `FeaturePolicyConflictError` at form load (form requires what org forbids). |
| any | `unavailable` | any | yes | `UnsupportedRequiredFeatureError` → policy-error page: "This form needs file uploads, but this site is not set up to receive files." |
| `demo` | `demo-stub` | `allowed` | yes | Form renders against the in-memory stub adapter. |
| `production` | `demo-stub` | any | yes | `assertCompositionCoherence` throws at composition boot — production rejects demo stubs. |
| any | any | any | no | `fileUpload` resolves to `not-requested`; form renders without the capability. |

The override (`FormspecWebAttachmentControl`, registered on the
`FormspecProvider` `components.fields.FileUpload` slot) wraps the existing
`formspec-react` file-picker UX so the bytes flow through the
`AttachmentStore` port instead of staying in-process as raw `File` objects.
The engine value at the attachment path becomes a serializable
`AttachmentRef` (or `AttachmentRef[]` in `multiple` mode); the submit
handoff carries the ref through `response.data` unchanged. No
`IntakeHandoff` shape change. Adopters wire whatever object store they
operate (S3, R2, Azure Blob, server-bundled, IPFS) — the conformance suite
under `tests/adapter-conformance/attachment-store/` enforces the contract.

This pattern generalizes for any future feature key whose form policy is
derived from definition content (e.g., a `payment` key derived from the
presence of fee-bearing fields). New extractors land as
`FormRuntimePolicyExtractor` adapters and compose into the composition's
`CompositeFormRuntimePolicyExtractor` array.

## Worked example: the /history route as an optional non-form surface (FW-0057 slice 1)

The `/history` route (FW-0057 slice 1) is the fourth non-form surface to
consume the synthesis pattern. It reads the new `crossIssuerHistory` capability
key — the fifth key in the closed `RuntimeFeatureKey` taxonomy. `HistoryRuntime`
synthesizes `form: { features: { crossIssuerHistory: 'optional' } }` at the
route boundary — never `required`. The route IS the user's opt-in.

The instance × org pair drives the rendered verdict:

| Mode | `crossIssuerHistory` instance | `crossIssuerHistory` org | Page renders |
|---|---|---|---|
| any | `available` / `demo-stub` (demo) | `allowed` / `default-on` / `required` | "Your history" timeline with per-kind sections + cross-route hyperlinks. |
| any | `available` | `forbidden` | "Your history is not available. This sender does not provide a history view here." |
| any | `unavailable` | any | "Your history is not available. This site does not provide a history view." |
| `demo` | `demo-stub` | `allowed` | Timeline with the cross-sender demo fixture (4 entries across 2 senders, 3 kinds). |
| `production` | `demo-stub` | any | `assertCompositionCoherence` throws at composition boot — production rejects demo stubs. |

Like `/obligations` and `/documents`, the `/history` route is **identity-
bound**: the page boots `IdentityProvider` discovery + authenticate before
reading `RespondentHistorySource`. The runtime-feature gate runs FIRST so a
disabled `crossIssuerHistory` short-circuits before identity is required —
there is no point asking the respondent to sign in to see "Your history is
not available." copy.

The cross-issuer aggregation that makes the surface load-bearing in production
is blocked on XS-2 (multi-issuer client-side token bag per stack-root ADR-0068
D-1 + D-3). The slice-1 `RespondentHistorySource` port models the SHAPE of
cross-issuer history; the SUBSTRATE (per-issuer auth handles, fan-out
strategy) is the adapter's concern and ships post-XS-2.

## Worked example: the in-form offline-aware submit (FW-0044 slice 1)

`offlineSubmit` is the second feature key driven by **definition
introspection** (after `fileUpload`) and the first IN-FORM key whose
runtime branch is **network-state-conditional**. The composition's
`formRuntimePolicyExtractor` (specifically the
`OfflineSubmitRequirementExtractor` reference adapter at
`src/adapters/composing/form-runtime-policy-extractor.ts`) walks the
loaded `FormDefinition` for `extensions['x-formspec-offline-submit'] === true`.
When present, the form's policy declares `offlineSubmit: 'optional'`.

The optional declaration is load-bearing: forms that opt into offline
support work fine ONLINE without a queue. The resolver enables the
feature when the instance can satisfy it; when it cannot, the resolver
records `optional-no-instance` and the form loads normally — `required`
would dishonestly fail-load every offline-marked form on every instance
that cannot do offline.

At submit time, `RespondentRuntime`'s `submitOrQueue` helper reads
`navigator.onLine` and `runtimeProfile.enabled.has('offlineSubmit')`:

| `navigator.onLine` | `offlineSubmit` enabled | Route |
|---|---|---|
| `true` | any | Synchronous `SubmitTransport.submit` (the existing happy path). |
| `false` | `true` | `OfflineSubmitQueue.enqueue(handoff, key)` + `'queued'` SubmitState + window `'online'` listener that drains via `replay()`. |
| `false` | `false` | Synchronous `SubmitTransport.submit` (falls through to the existing inline error path; the runtime never reaches the queue). |

The queue preserves the original UUIDv7 idempotency key through replay
(port-level conformance invariant), so the server's same-key contract
suppresses any duplicates if the user manually retries the submit after
reconnecting.

The respondent-facing UI renders "Saved for later. We'll send it when
you reconnect." plus a fixture-pinned deferred-capability sub-line
("Offline submit support is experimental. Production deployments do not
currently keep your draft across browser restarts or across other
devices.") on the `'queued'` state. Forbidden in the rendered DOM:
`enqueue`, `replay`, `idempotency`, `IndexedDB`, `service worker`,
`OfflineSubmitQueue`, `offlineSubmit`, `QueuedSubmit`.

The narrowed-route compositions (`/status`, `/obligations`, `/documents`,
`/history`) declare `offlineSubmit: 'unavailable'` and wire
`unavailableOfflineSubmitQueue()` because no narrowed surface submits a
form. Uniform across descriptors — no descriptor adds `'offlineSubmit'`
to its `consumes` set today (FW-0080 closed the boolean-ladder shape;
the closed-taxonomy `consumes: ReadonlySet<RuntimeFeatureKey>` makes
this a one-line addition the day a narrowed surface needs the queue).

Production posture: `'unavailable'` until FW-0082 lands the production
IndexedDB queue (with EXT-18 HPKE at-rest encryption). Demo posture:
`'demo-stub'` with the in-memory queue paired with the stub transport.
Slice 1's stub loses queued submissions on page reload — that is the
honest cost of the `'demo-stub'` posture; the bundled `sample-form.json`
does NOT declare `x-formspec-offline-submit: true` today to avoid leaking
that imperfection into the "what `npm run dev` shows" surface (FW-0087
flips the demo declaration once FW-0082 ships).
