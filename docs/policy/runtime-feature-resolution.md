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
   `composition.getFormRuntimePolicy(definition)`, one of
   `'forbidden' | 'optional' | 'required'` per feature key.

## Feature keys

The closed taxonomy lives in `src/policy/feature-keys.ts`. Today's keys:

- `respondentPlace` — wallet substrate (web ADR-0010, FW-0065 seed).
- `status` — WOS applicant-API status reader (FW-0039 seed).
- `documentPresentation` — selective-presentation surface (FW-0056 slice 1
  extension, the first feature ADR beyond the seeded pair).

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
  form: composition.getFormRuntimePolicy(definition),
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
6. If the feature reads from the form definition, supply a
   `getFormRuntimePolicy` extractor that maps the form's runtime-policy
   field to the resolver shape. (When the first non-trivial extractor
   lands, promote the closure to a full `FormRuntimePolicyExtractor` port
   with conformance fixtures — flagged HIGH-1 in the 2026-05-23 scout
   architecture review.)
7. Add fixture cases under `tests/policy-resolution/cases/` covering
   required / optional / forbidden / default-on / policy-conflict for
   the new key.

## Adopter migration notes

The `Composition` interface gained three required fields in Task 10 of
the FW-0065 implementation:

- `instanceCapabilities: InstanceCapabilities`
- `orgRuntimePolicy: OrgRuntimePolicy`
- `getFormRuntimePolicy: (definition) => FormRuntimePolicy`

An adopter forking the composition root **will** see `tsc --noEmit`
errors until they declare all three. The minimum migration that
preserves current behavior:

```ts
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from 'formspec-web/policy';

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
  // both seeded features:
  getFormRuntimePolicy: (): FormRuntimePolicy => ({
    features: { respondentPlace: 'optional', status: 'optional' },
  }),
};
```

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
