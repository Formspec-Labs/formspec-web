# Unknown signing-widget outcome architecture review

## Verdict

APPROVE. The patch preserves the controller's existing uncertain outcome through the maintained widget feedback seam and disables mounted Submit without changing signed data, authored content, authority, navigation, or completion outputs. This approval covers the source patch and exact generated Web adoption; it does not qualify actual WOS acceptance.

## Artifact and lineage

Source candidate: `/private/tmp/formspec-unknown-signing-widget-20261014`, based on maintained Formspec `bb562a8`. Five changed paths: three production files and two tests. Web adoption candidate: `/private/tmp/formspec-web-unknown-signing-widget-normal-20261014`, based on the normal timeout-recovery lineage. Three generated vendor files change: `SurfaceSlot.js`, `widget-api.d.ts`, and `widgets/signing-ceremony.js`.

The prior timeout work already preserves a signed response, reports `completion-outcome-unknown`, and fences another mounted controller Submit. Its top-level alert was accurate, but `SigningCeremonyAct` received only generic failed feedback and therefore showed authored retry copy with an enabled Submit button. This patch corrects that presentation mismatch in the maintained renderer.

## Relationships

| Seam | Responsibility | Evidence |
| --- | --- | --- |
| Controller result → widget feedback | Translate exactly one closed failed-invocation reason; preserve obsolete-generation priority | `packages/formspec-surface-react/src/SurfaceSlot.tsx:1542–1549,1555–1576,1768–1770` |
| Feedback type | Declare the additional closed `outcome-unknown` status | `packages/formspec-surface-react/src/widget-api.ts:97–104` |
| Signing ceremony | Retain Submit-specific uncertainty, disable the button and handler, show safe platform copy | `packages/formspec-surface-react/src/widgets/signing-ceremony.tsx:123,141,159–163,184–187` |
| Maintained source → Web vendor | Adopt generated renderer output exactly; no independent vendor implementation | The reviewer compared all three candidate generated files byte-for-byte against the Web files: all exact |

No new runtime state source, datasource, reader, authored schema, Registry publication, host callback, or browser route is introduced.

## Invariants

- **Unknown is distinct from refusal and completion.** Only a normalized invocation with `status === 'failed'` and the exact reason `completion-outcome-unknown` receives the new feedback. A completed invocation containing that text stays completed; other failed reasons remain failed. No arbitrary failure text is exposed.
- **Obsolete results cannot update the current generation.** Both fresh and joined delivery paths check the active generation before uncertainty classification.
- **Unknown never produces successful navigation or outputs.** Classification occurs on the existing unsuccessful-action branch; reports retain `navigation: 'none'`.
- **The signature remains unchanged.** The widget adds local presentation state only. It neither edits admitted data nor emits Save, Prepare, or Sign.
- **Mounted repeat Submit is blocked twice.** The visible button is disabled and the handler checks the sticky unknown flag. The controller remains the authoritative protection against another POST.
- **Uncertainty survives ordinary rerenders and later widget feedback.** The local flag is set only by Submit's unknown outcome and never reset by pending, failure, or another output completion.

## User value and debt

The applicant sees one consistent outcome and loses the misleading retry affordance while the signed response remains available. One closed feedback status and one local widget flag repair an existing seam. Passing raw controller state into widgets or adding retained feedback APIs would expand scope without improving this mounted case.

The maintained platform supplies neutral uncertainty copy. Authored failure text, tenant presentation, signing language, proof interpretation, and task admission remain unchanged.

## Counterfactual and material limits

The strongest argument against the patch is that local widget state cannot survive remount. That is correct and explicitly bounded: a newly mounted widget has no retained uncertainty feedback before an action, so initial-remount Submit disabling is not guaranteed. The existing controller still fences a guarded invocation and returns unknown without another POST. This patch must not be described as durable submission recovery.

Leaving the current implementation would retain contradictory retry text despite the controller fence. Adding a new state API would incur another maintained seam and would still require durable operation recovery to solve reload uncertainty.

Other limits remain from the prior work: application status may describe the original intake, timeout does not prove acceptance or refusal, and the configured local browser wait is not a server execution bound. None is widened by this patch.

## Evidence and confidence

The implementation owner reports the reproduced renderer failure and fresh/joined feedback failures turned green; 88 source tests passed, 188 Web tests passed with one existing skip, package schema/type/CSS build passed, Web typecheck passed, and both diff checks passed. The reviewer read the neutral tests for forced clicks, signed-data preservation, rerender persistence, fresh/joined delivery, obsolete generations, and exact-reason negative controls. The reviewer independently confirmed all three generated Web files equal the candidate package output.

Confidence: high for the scoped source/adoption design; actual runtime behavior and WOS acceptance remain unverified by this review. No material architectural blocker was found after considering raw-state coupling, generation races, duplicate delivery, false completion, authored-copy drift, and remount limitations.
