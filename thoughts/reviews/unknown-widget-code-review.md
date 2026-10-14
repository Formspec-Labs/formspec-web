# Signing ceremony unknown-outcome code review

VERDICT: APPROVE

No blocking findings. Static review completed on October 14, 2026. The reviewer read all five maintained source/test paths and all three generated Web vendor paths, including callers, completion types and regression assertions. No tests, service requests, browser actions, runtime adoption, or case writes were performed by the reviewer.

## 1. Patch summary and exact scope

The existing bridge converted a task controller's unknown completion outcome into generic failed widget feedback. The signing widget then displayed authored retry copy and enabled Submit, although the controller still fenced the operation. This patch preserves one closed uncertainty classification through the bridge and gives the signing widget a local unknown state that disables Submit and displays truthful status copy.

Maintained source candidate: `/private/tmp/formspec-unknown-signing-widget-20261014`, base `bb562a836bd1ae95a03e8f265592533e2096c8b7`. Its five-path source/test binary diff SHA-256 is `1b4d5239446dbef97f9748794baa24a52b65081b096d375210acd026d811ac1f`.

Normal Web candidate: `/private/tmp/formspec-web-unknown-signing-widget-normal-20261014`, base `07c33cfeeaf45476c69e1ef0cb2b0b70be025b95`. Its three-path vendor binary diff SHA-256 is `b14991969ca5f63ae75f14306660def32958f301d63bcf3f3a659db5120c9567`. Review documents are outside these digests.

Affected functions are `SurfaceWidgetSlot` completion mapping and `unknownCompletion` (`packages/formspec-surface-react/src/SurfaceSlot.tsx:1539,1768`) and `SigningCeremonyAct` (`src/widgets/signing-ceremony.tsx:111`). The public feedback union adds `outcome-unknown` (`src/widget-api.ts:97`). The maintained widget registry remains the caller (`src/widgets/index.ts:90,96`). All source paths in the following sections are relative to `packages/formspec-surface-react`.

## 2. Function trace

| Function / boundary | File:line | Input | Output and verified behavior |
| --- | --- | --- | --- |
| Action coordinator and delivery | `src/widget-action-runtime.ts:302,394` | Admitted executor invocation | Retains actual result and shares in-flight logical emissions; unchanged. |
| `normalizeWidgetActionResult` | `src/widget-action-runtime.ts:193` | Direct or wrapped invocation | Selects actual invocation; unchanged helper reused. |
| `completedWidgetAction` | `src/SurfaceSlot.tsx:346` | Invocation and loaded action document | Existing completion admission; failed invocation cannot select completed navigation. |
| `unknownCompletion` | `src/SurfaceSlot.tsx:1768` | Actual invocation | True only for status `failed` and exact reason `completion-outcome-unknown`; exposes no arbitrary failure text. |
| Joined completion mapping | `src/SurfaceSlot.tsx:1539` | Existing coordinated promise | Obsolete generation first, admitted completion second, closed uncertainty third, generic failure otherwise. |
| Fresh completion mapping | `src/SurfaceSlot.tsx:1554` | New coordinated promise | Keeps obsolete priority and reporting; uncertainty returns before transition/navigation logic. |
| `SigningCeremony` | `src/widgets/signing-ceremony.tsx:101` | Admitted content/data/route | Existing snapshot identity controls local-state lifetime; unchanged. |
| `SigningCeremonyAct.emit` | `src/widgets/signing-ceremony.tsx:140` | Mapped Sign/Submit/Paper | Preserves existing exact data, signed and review checks; only Submit uncertainty sets the latch. |
| Signing controls/status | `src/widgets/signing-ceremony.tsx:184,187` | Latch and existing state | Disables Submit and prioritizes unknown copy over failed/signed/pending copy; signed data remains untouched. |

## 3. Data flow and invariants

The host's actual failed invocation reason enters a closed boolean check, then becomes the public status `outcome-unknown`. No request body, signature, error object, identifier, or arbitrary reason enters widget feedback (`SurfaceSlot.tsx:1549,1576,1768–1771`). A completed result with a matching reason string remains completed; an unrelated failed reason remains failed. Obsolete generation remains obsolete in both fresh and joined paths.

The widget creates `outcomeUnknown=false` at `signing-ceremony.tsx:123`, sets it only after Submit returns the new status at 160–161, and reads it in the handler fence at 141, disabled control at 184 and live status at 187. It never rewrites response, signer, actor, revision, review, or assent. Paper remains available, and subsequent Paper completion cannot clear the uncertainty latch. Sign returning the same feedback remains an ordinary Sign failure, avoiding a claim that an unsigned response was saved.

The schema and authored copy remain unchanged. This is generic presentation of the maintained controller classification, not an authored-copy substitution or a new acceptance decision. The original controller fence remains authoritative.

## 4. Tests, edge cases and build correspondence

Read test assertions:

- `tests/signing-ceremony.test.tsx:37` checks exact unknown copy, absence of retry/signed-success copy, disabled Submit, forced-click rejection after same-generation rerender, exact unchanged signed data, and persistent uncertainty after Paper.
- Same file:49 checks ordinary Submit failure remains ordinary/retryable; :55 checks Sign does not acquire the Submit uncertainty latch.
- `tests/widget-runtime.test.tsx:278` checks completed-plus-matching-reason remains completed and private/unrecognized failed reason remains failed.
- Same file:289 exercises fresh/joined × current/obsolete completion through actual `SurfaceApp`, requires one executor call, and requires zero navigation on uncertainty/obsolescence.
- Existing coordinator, signing, and runtime tests cover retained ordinary delivery and completion behavior. Assertions were read; execution is worker-supplied evidence.

Worker reports maintained source **88/88** across signing ceremony, widget runtime and coordinator; Web **188 passed / one existing skip** across native controller, runtime and composition; package schema check/type compilation/CSS build, Web typecheck and both diff checks passed. Worker separately reports baseline generated files equal existing vendor and total candidate generated diff contains exactly three files.

Reviewer independently checked each vendored file equals the maintained candidate's built output byte-for-byte and read all generated deltas:

| Generated file | SHA-256 |
| --- | --- |
| `SurfaceSlot.js` | `8dbfd9f657ef242671647292158316c9b68d6e38a5e6c531813a6cf610134425` |
| `widget-api.d.ts` | `f9ffd137ed22cb944f17655da91d52aec0712ea0dcf156c64abee6790aeffadf` |
| `widgets/signing-ceremony.js` | `4449865c3216549a8b823cb95b21f1aa775177846ec58598a1bfb02318dd2693` |

The declaration's added union member matches emitted runtime feedback. Generated imports reuse an existing exported helper; no hand-written distribution-only behavior or extra vendor files are required.

## 5. Findings

**Observation — local presentation lifetime.** The widget latch is in-memory and keyed by the existing snapshot generation (`signing-ceremony.tsx:107,123`). A changed identity or remount resets local presentation. This patch does not make uncertainty durable across reload or provide exact server-outcome reconciliation. The existing mounted controller fence remains the protection against repeat submission; broader recovery is outside this scoped fix.

**Observation — generic English safety copy.** The uncertainty message is a fixed generic status at `signing-ceremony.tsx:187`, matching host chrome. The patch introduces no locale/schema migration. Further localization can be handled through the maintained widget copy system separately; it does not affect the current scoped correctness conclusion.

## 6. Conclusion

VERDICT: APPROVE

The patch fixes the contradictory retry presentation, preserves closed feedback and existing navigation/authority boundaries, and keeps signed data intact. Coverage of changed paths is **ADEQUATE**. Confidence is **HIGH** for static behavior and byte-identical source-build vendoring. This certificate does not establish actual task acceptance, reviewer decision, deployment, or cross-reload recovery.
