# Task completion timeout and uncertain outcome architecture review

## Verdict

APPROVE for the scoped browser behavior. This makes a dispatched timeout explicit and blocks repeated Submit within the mounted controller. It does not establish correction acceptance or provide durable outcome reconciliation.

Reviewed candidate: `/private/tmp/formspec-web-task-timeout-recovery-20261013`, based on normal signed-task resume `2b0ed3a`. Static review covers the eight production paths and four test paths in the final candidate diff. No production code was changed by this reviewer.

## Decision, lineage, and relationships

The applicant must preserve the existing signed response when the browser stops waiting before WOS returns. The reported actual request continued after the former ten-second browser wait and returned a server refusal after approximately 25.2 seconds; that observation supplies no upper bound and proves no acceptance.

| Component | Responsibility and relationship | Evidence |
| --- | --- | --- |
| `HttpTaskCompletion` | Validate the selected task, dispatch one authenticated request, validate an actual completion event | `src/adapters/http/task-completion.ts:29–82` |
| Task composition | Pass a deployment-selected browser wait to the existing adapter | `src/composition/task.ts:21–22,71–73`; `src/composition/native-package-loader.ts:206`; `src/composition/native-package.ts:55` |
| Response controller | Preserve signed state and captured operation; fence repeated Submit after uncertainty | `src/shared/response-action-controller.ts:107,352–353,368,411` |
| Native package frame | Present uncertainty, preserve signed review, reuse existing application refresh | `src/app/NativePackageRuntime.tsx:308–328` |

The local demo owner explicitly selected `120000` milliseconds as its maximum browser wait. Other configurations retain `10000` milliseconds. This is a browser policy, not a server execution bound. The code validates a finite positive timer value without changing proof expiry, business deadlines, or WOS admission.

The current repository documents progression discovery, but the coordinator established that its route and schema are outside the served WOS baseline. This design therefore adds no progression request and makes no deployment-availability claim from that repository text.

## Invariants and commitments

- **Actual dispatch precedes uncertain classification.** The HTTP client checks current authority and resolves credentials before the synchronous dispatch hook (`src/adapters/http/http-client.ts:138–145`). Only a subsequent `TimeoutError` becomes `TaskCompletionOutcomeUnknown` (`src/adapters/http/task-completion.ts:65–82`). A credential timeout retains the original error.
- **A timeout does not prove refusal or completion.** The dedicated error carries no fabricated outcome or retained request data (`src/ports/response-completion.ts:36–39`). Successful events still require the original schema/task/process/status checks.
- **No automatic write replay.** The controller retains the signed response and original operation and refuses both same-key and newly keyed mounted Submit attempts. It does not publish submitted outputs (`src/shared/response-action-controller.ts:352–353,368,411`).
- **Application refresh does not resolve task uncertainty.** The existing association read republishes the same phase/reason (`src/shared/response-action-controller.ts:475–487`). An original intake can already be submitted; that status cannot prove correction acceptance. The uncertainty alert remains visible.
- **Existing signing and authority checks remain authoritative.** The patch introduces no Save, Prepare, Sign, credential bridge, private reader, proof replay, or permission change.

## User value and debt

The applicant receives an accurate explanation and retains access to the signed response while repeated mounted submissions are blocked. The change adds one closed error and one controller phase/reason, reusing the existing transport, configuration, snapshot, and application refresh. A new accepted-receipt framework or progression reader would add unsupported scope.

The value claim is falsified if a timeout causes another POST, alters the signature, yields completion outputs, or disappears after refreshing the original application's submitted status. The candidate tests cover these principal behaviors using neutral fixtures; they do not qualify the actual case or server budget.

## Counterfactual and failure inventory

The strongest case against this change is that a mounted-only fence can look like recovery while navigation or reload creates another controller with a fresh operation key. That remains a real limitation. The claim must stay limited to explicit uncertainty and mounted retry prevention.

Keeping the prior behavior would continue to present a dispatched timeout as an ordinary failure and permit another logical Submit. Merely increasing the timeout would reduce occurrences while leaving that failure mode intact.

Remaining limits:

1. Reload or a different tab loses the mounted fence. Durable operation recovery is not implemented.
2. Ordinary transport disconnection or owner cancellation may also leave an uncertain server outcome; this patch classifies the requested timeout case only.
3. Application status refresh is informational and cannot reconcile the exact correction submission.
4. No supported whole-server-operation upper bound has been established. The local demo's 120-second policy must not be described as one.

## Findings

No material architectural blocker in the scoped patch. Keep the explicit uncertainty state and existing status capability; keep the default unchanged outside explicitly configured deployments. Do not infer acceptance, clear the fence from application status, or introduce a retry from this error.

The implementation owner reports 242 focused tests passed, one existing skip, clean typecheck, exact-path ESLint, and diff check. The reviewed tests cover the default and selected wait, a delayed normal event, predispatch credential timeout, HTTP 409 preservation, unchanged signature and operation, repeated Submit fencing, direct controller refresh of the original submitted intake, and the maintained user interface. These neutral checks support the scoped design and make no actual-case or server-budget qualification claim.

## Confidence

Plausible-but-unverified for actual execution; high confidence in the scoped state and dependency design. Independent implementation review and focused checks must confirm the code preserves these invariants. Actual WOS acceptance and downstream work require authoritative readback.
