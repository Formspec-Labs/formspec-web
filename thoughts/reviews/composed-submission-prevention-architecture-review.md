# Composed submission prevention architecture review

## Verdict

APPROVE the test-only regression. The fixture joins maintained signed-task restoration, task transport, controller state, and actual signing-widget feedback in one applicant path. No production gap was established and no production change is included.

## Artifact, lineage, and relationships

Candidate: `/private/tmp/formspec-web-unknown-signing-widget-normal-20261014`, based on `192c3fd`. The only implementation change is `tests/shared/native-package-signing-host.test.ts`.

The test extends the existing fresh signed-task fixture with a delayed-unknown mode rather than introducing another harness. It covers the boundaries corrected by signed-task resume `2b0ed3a`, timeout uncertainty `07c33cf`, and maintained widget adoption `192c3fd`.

| Stage | Exercised component | Evidence in the changed test |
| --- | --- | --- |
| Reopen | Actual `createTaskComposition`, authenticated Source cohort read, native host controller restoration | lines 175–197, 236–243 |
| Render and Submit | `NativePackageRespondentHost`, real `SurfaceApp` and maintained `SigningCeremony`, selected host widget executor | lines 247–256; admitted neutral surface at 215–230 |
| Delayed outcome | Actual `HttpTaskCompletion` with a neutral unresolved fetch and fake ten-second timer | lines 175–185, 254–258 |
| Refresh and presentation | Actual host/controller application refresh plus mounted renderer rerender | lines 262–270 |
| Prevention and conservation | Forced DOM enabling cannot emit another action; one task POST, exact response/selectors, signature preservation and no Source writes | lines 272–288 |

Source service responses, bearer values, task publication, signing authority/provider behavior, and lifecycle return data are neutral fixtures. The test exercises the client checks around those inputs; it does not establish real authentication, cryptographic proof validity, server processing, or actual-case acceptance.

## Invariants

- Reopening adopts the existing signature without Save, Prepare, or Sign.
- The dispatched timeout becomes `outcome-unknown`, not a successful completion or proof of refusal.
- The maintained widget displays uncertainty and disables Submit across ordinary rerender. Forced DOM enabling produces no additional request in the test; the widget's explicit handler fence was separately traced in the adopted implementation. React's disabled-prop behavior means the forced-click assertion alone does not prove that the handler executed.
- Refreshing an original application to `submitted` does not resolve the correction submission or clear the controller's uncertain state.
- Exactly one task completion request carries the expected response and signed-draft selectors. The signed payload and authored signature values remain equal to the retained fixture.
- No navigation occurs from the uncertain action and no extra Source request is issued beyond launch/read.

## User value and conceptual debt

This supplies a causal regression for the previously missing end-to-end client relationship. It reuses the existing fixture and maintained components, paying down the gap between separate controller tests and separate renderer tests. It adds no production abstraction, wrapper, reader, operation taxonomy, or new execution authority.

The fixture's explicit neutral surface and signing publication are necessary to admit the real widget. They are test inputs, not alternate platform execution logic. The status refresh is invoked through the actual host API; clicking a status-navigation button is outside this test's claim.

## Counterfactual and limits

The strongest concern is that a large fixture could pass by manually manufacturing the state it claims to verify. Here the restored state comes from the maintained cohort, uncertainty comes from the real adapter timer, and the displayed feedback comes through the actual Surface action path. The assertions therefore target the relevant causal seam.

The worker reports historical RED using only the exact pre-`192c3fd` signing-widget blob from `07c33cf`, followed by byte-exact restoration and GREEN. This is a targeted falsification of the widget adoption regression, not proof that every earlier integration defect is reproduced. It must remain described that way.

Mounted rerender is covered. Full remount, another tab, browser persistence, delayed real server processing, native acceptance, and durable recovery remain unproved. The ten-second test timer is deterministic fixture policy; it does not amend the local demo's explicit 120-second wait or establish a server execution bound.

## Evidence and confidence

The reviewer inspected the complete one-file diff and retained logs: `/private/tmp/composed-signing-historical-red.log` fails on the missing truthful uncertainty message; `/private/tmp/composed-signing-green.log` reports 236 passing tests across three related suites. The final patch SHA-256 independently matches `8783ef5fe519348e1ff4876039acda81cdddbb6ad20b0bfe001b3f3a4f0e2805`. The implementation owner also reports clean typecheck, scoped lint, and diff check. These checks support the neutral regression; this review performed no actual HTTP request, browser operation, native build, or business-state mutation.

No material architecture blocker. Confidence is high in the scoped regression's causal chain and bounded claims. Actual application behavior and authoritative acceptance remain separate evidence requirements.
