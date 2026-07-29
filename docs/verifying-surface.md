# Verifying Surface host

`VerifyingSurfaceHost` opens a signed Surface bundle only after the same
immutable snapshot passes every required check. It is a separate host
component; it does not change the existing Definition respondent runtime.

## Admission sequence

What goes in: a host-selected bundle location, `SurfaceBundleSource`,
`SurfaceBundleVerifier`, AppGraph schema validators, and the normal
`SurfaceApp` route props.

What happens:

1. Acquire the exact candidate bytes and bind them to a SHA-256 snapshot.
2. Verify the signature, signing method, publisher authority, expected app,
   and release policy.
3. Validate the signed manifest and inline documents with
   `produceBundleExportAppGraphValidationReport`, then validate the respondent
   actor and select the exact entry Surface.
4. Dereference the validated inline export with `dereferenceBundleExport` and
   prove that the selected Surface can be rendered.
5. Commit the release policy against the same snapshot.
6. Mount `SurfaceApp`.

What comes out: before step 6, the host shows only fixed local copy for
`checking`, `failure`, `unsupported`, or `adapter-error`. These states contain
host codes, not bundle content or raw adapter messages. An admitted app shows
the Surface routes plus a persistent authenticated-status header.

How to check it: run
`npx vitest run tests/app/verifying-surface-host.test.tsx`,
`npm run test:unit`, and `npm run build`. The focused tests hold acquisition
and release commit open to prove that bundle text, trust details, and
`document.title` do not change early. They also prove that changing candidates
withdraws the previous app immediately and that route changes keep the status
header without reacquiring.

## Authenticated status

The header uses `SurfaceApp.header`, so it stays above route navigation and
route content. Its labels keep three sources of information distinct:

- **Signed claims:** publisher ID, app ID, release ID, and release sequence.
- **Deployment trust:** publisher display name and authorized signing key from
  the host trust store.
- **Host observations:** signature method receipt, release policy, check time,
  resolved source location, and candidate snapshot identity.

The header does not render while a candidate is unverified or merely
validated. A source hostname or unsigned sidecar therefore cannot appear as
the authenticated publisher.

## Host integration

Import `VerifyingSurfaceHost` from `formspec-web/verifying-surface`. Supply a
stable validation configuration. Replacing the source, verifier, location,
cancellation signal, or validation configuration starts a new admission and
withdraws the previously admitted app. The host checks both cancellation and
the current admission generation after every asynchronous phase. Retired work
cannot publish its AppGraph report or start a release commit.

`onValidationReport` receives the full AppGraph result for host records.
`onAdmissionState` receives the fixed public state. Neither callback changes
the person-facing failure copy.

## Production respondent composition

The production root is loaded lazily above the existing app. A configured
signed-bundle location selects the verifying respondent root; without that
location, the existing app remains unchanged. The signed root removes the
static app shell before admission starts, so bundle text and tenant styling
cannot appear during checking or failure states.

The respondent actor check admits one selected Surface with one intake route,
one proof route, one Definition form, one canonical submit action, one
host-authorized receipt source, and one respondent widget module. It rejects
staff, ceremony, embed, extra-module, extra-action, and extra-data-source
capabilities. It also rejects submit preconditions and transition `when`
expressions because this host does not inject evaluators for them.

The admitted form uses the Definition, Response Actions, Theme, Registry, and
Locale documents from the authenticated payload. It does not refetch the
Definition or substitute demo actions. Submission navigation waits for the
real transport confirmation and uses its `caseRef`. The receipt source reads
the release-qualified browser-session confirmation copy. That `sessionStorage`
record is schema-checked and useful for refresh, but it is browser-mutable and
is not independently authenticated proof. A missing or malformed record
blocks the receipt widget instead of inventing data.

App-target Locale 2.0 documents supply the closed Surface shell string set and
same-target fallback. Tenant Theme tokens apply only to the intake route. Proof
routes and host verification states retain platform styling.

## Current boundaries

- App Locale strings cover authored Surface shell controls. Verification,
  configuration, admission, and other host/controller copy remain
  deployment-owned English.
- The signed root activates only for the anonymous `publicPortal` profile.
  Receipt records are qualified by app, signed release, and `caseRef` within
  that browser session; they do not include an authenticated subject
  identifier. OIDC and department profiles cannot activate this root. This is
  an accepted limitation of the current anonymous host. Enabling a
  subject-aware signed root requires a new tracker item, an accepted design
  that binds receipt records to the active subject, and new release evidence.
- Acquisition has a deployment-owned millisecond deadline. Exceeding it
  aborts the HTTP request and returns the fixed source-unavailable state.
- Authority validity is checked against the browser device clock. A clock
  rollback can make an expired authority appear current. Required release
  digest pins still prevent different bytes from being admitted, but time
  validity is not adversary-resistant. This is an accepted limitation of the
  current digest-pinned host. Deployments must remove expired or revoked keys
  and their pins from runtime configuration rather than relying on browser
  time alone. Adding trusted time or claiming adversary-resistant expiry
  requires a new tracker item, an accepted design, and new release evidence.
- The vendored upstream package still exports staff and ceremony components.
  The respondent runtime module does not register them, and the actor check
  rejects bundles that request their routes, widgets, modules, actions, or
  data. This is a runtime authority boundary, not a claim that the package
  contains only respondent code.
