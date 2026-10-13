# Submit failure diagnostics — independent architecture review

**Verdict: APPROVE.** No blocker or concern requires reshaping this fixed-metadata diagnostic patch. Keep the bounded reporter and the existing execution owners. This is static approval of diagnostic placement and preservation of boundaries; it establishes neither the cause of the observed Submit refusal nor browser/runtime success.

## 1. Artifact summary

Reviewed the working patch in `/private/tmp/formspec-web-submit-diagnostics-20261013` against base `0fe66162a4d415a72cda75a59643e78de0c2c87b`, including the new untracked `src/shared/submit-diagnostic.ts` and its test. The stated problem is a real Submit refusal with generic UI and no useful failure log. The decision is to emit only fixed stage/kind metadata and optional validated numeric HTTP status at the maintained host, controller, and task transport boundaries. Category: operational diagnostics, connected to the product outcome of locating a refusal before choosing a behavior change.

The patch touches `src/shared/native-package-signing-host.ts:859-899`, `src/shared/response-action-controller.ts:389-451`, and `src/adapters/http/task-completion.ts:47-76`. It adds no route, native artifact field, authority selector, transport, capture store, error vocabulary for public consumers, or business disposition.

The observed incident and prior neutral expiry checks were supplied in the review request; this review did not repeat them or independently establish their results. No implementation edits, tests, browser operation, runtime mutation, or business action were performed.

## 2. Lineage and relationships

| Prior artifact | Type | Relation | Citation |
| --- | --- | --- | --- |
| Web ADR-0004 | Accepted architecture | Keep shared semantics upstream; web consumes them and owns respondent implementation | `thoughts/adr/0004-cross-repo-placement-consume-not-invent.md:Decision` |
| Web ADR-0009 | Accepted architecture | Typed ports, composition-selected adapters, no cross-port authority invention | `thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md:Decision` |
| Response Actions specification | Draft normative companion | Engine owns validation and blocking/effect sequencing; host retains effect authority | `/Users/mikewolfd/Work/formspec-stack/formspec/specs/response-actions/response-actions-spec.md:438-448,501-510` |
| Task API specification | Normative owner text | Signed draft selectors convey no authority; WOS host derives identity and performs current admission/read checks | `/Users/mikewolfd/Work/formspec-stack/work-spec/specs/api/task.md:135,149-151` |
| Stack ADR-0106 | Accepted historical architecture | WOS owns governance/admission; diagnostic console is not a rival evidence ledger | `/Users/mikewolfd/Work/formspec-stack/thoughts/archive/adr/0106-wos-server-governance-overlay.md:Decision,Invariants` |
| Existing Save diagnostics | Sibling | Existing bounded local console failure pattern; does not cover Submit | `src/shared/response-action-controller.ts:119-126` |
| Existing qualification diagnostics | Sibling | Source readiness/proof diagnostics; unchanged and not imported into new reporter | `src/composition/native-package-action-diagnostic.ts:159-175`; `src/shared/native-package-signing-host.ts:392-406` |

| Component/seam | Owner | Depends on | Consumed by | Named? |
| --- | --- | --- | --- | --- |
| Surface widget action executor | Native signing host | Admitted scope and current visit; response controller | Maintained Surface runtime | Yes, `src/shared/native-package-signing-host.ts:859-875` |
| Response Action invocation | Formspec engine; host supplies qualified effects | Frozen response, validation tuple, reviewed signed state | Controller/widget caller | Yes, `src/shared/response-action-controller.ts:405-451`; Response Actions spec §runtime execution |
| ResponseCompletion | Trusted selected strategy | Captured signed candidate and owner lifetime | Controller | Yes, `src/ports/response-completion.ts:6-28` |
| TaskResponseCompletion | Web strategy | Exact signed Source draft selectors and admitted task request | Selected task composition | Yes, `src/shared/task-response-completion.ts:17-46`; `src/composition/task.ts:69-70` |
| TaskCompletion HTTP | WOS reference adapter | Exact selected task/publication, WOS session, current guards | TaskResponseCompletion | Yes, `src/ports/task-completion.ts:24-34`; `src/adapters/http/task-completion.ts:29-76` |
| Fixed Submit failure reporter | Local web diagnostic helper | Fixed literals and optional integer HTTP status | Host/controller/adapter only | Internal helper, `src/shared/submit-diagnostic.ts:1-18`; no new application port |

The upward lineage is consumer architecture and engine/native owner semantics. The outward trace reaches the selected Source signing and WOS task completion composition (`src/composition/task.ts:54-70,94-110`). Source custody and WOS authority remain independently selected. The new reporter introduces no edge into either owner and has no receipt or accepted-artifact consumer.

## 3. Invariants and commitments

**Invariant 1 — diagnostic observation cannot authorize or change execution. PRESERVED.** `src/ports/response-completion.ts:23-28` declares trusted strategy selection. The reporter accepts no request, response, Error, identifier, or credential (`src/shared/submit-diagnostic.ts:1-18`). Calls observe existing catches; host and task adapter rethrow the same caught value (`src/shared/native-package-signing-host.ts:869-873,891-899`; `src/adapters/http/task-completion.ts:68-75`). Reporter exceptions are swallowed. Failure mode if violated: a log sink could convert refusal into success, retry an effect, or replace the original refusal.

**Invariant 2 — native validation, review and current authority still gate effects. PRESERVED.** Response Actions spec `438-448,501-510` retains the engine/host split. The patch still calls `invokeResponseActionAsync`, preserves its validation/blocked result, and calls the same `perform` path (`src/shared/response-action-controller.ts:420-451`). The host still checks current visit and signing scope (`src/shared/native-package-signing-host.ts:862-872`). The native facts refresh, current-owner check and review readiness remain unchanged (`src/shared/native-package-signing-host.ts:575-601`). Failure mode: bypassed review or stale authority could submit a candidate that should refuse.

**Invariant 3 — task selectors are not authority; WOS remains authoritative. PRESERVED.** Task API `135,151` states current host admission and signed Source record checks. The adapter still uses selected task/publication, exact response identity/status, authored signature presence, current WOS auth and bounded request/outcome validation (`src/adapters/http/task-completion.ts:29-66`). The console does not derive actor, case, task authority or acceptance from a failure stage. Failure mode: a browser/schema check could be mistaken for server task admission.

**Invariant 4 — durable effect identity, replay and original failures remain unchanged. PRESERVED.** Response Actions spec `314,481` and Task API `135,149` establish replay semantics. The patch does not change delivery maps, operation identity, prepared completion retention, request body, idempotency key, or success interpretation. The task adapter still sends the original operationId and rethrows errors (`src/adapters/http/task-completion.ts:60-75`); strategy preparation still binds that operation ID (`src/shared/task-response-completion.ts:37-46`). Controller catch still uses the existing `fail` mapping (`src/shared/response-action-controller.ts:435-451`). Failure mode: changing identity or retry policy could duplicate writes or conceal ambiguous dispatch.

**Invariant 5 — transport and output limits remain fixed. PRESERVED; diagnostic cap NEWLY INTRODUCED for Submit.** Base comparison shows unchanged 2 MiB request cap, 10 second timeout, 64 KiB response cap, JSON requirement, and success status 200 (`src/adapters/http/task-completion.ts:58-66`). Reporter allows at most 32 attempts per reporter instance and emits only fixed fields with optional status 100–599 (`src/shared/submit-diagnostic.ts:8-17`). Host, controller, and adapter each own an instance; this is not a global 32-event cap. Failure mode: unbounded output or raw payload logging could disclose business/private content or flood the console.

**Invariant 6 — diagnostics are not retained acceptance/audit evidence. PRESERVED.** Stack ADR-0106 `Decision,Invariants` and the owning completion result types (`src/ports/response-completion.ts:19-21`) separate governance/evidence from browser observation. Console output neither populates completionResult nor changes evidence returned by the selected strategy. No conformance/schema or ratification change is required for this internal observation helper; the application seams are unchanged.

## 4. User-value analysis

The direct beneficiary is the maintainer diagnosing the current refusal. Applicant-visible Submit behavior and wording remain unchanged. A later observed failure can distinguish host admission, controller frozen validation/review/completion preflight/effect, task preflight/transport/outcome validation, and a known HTTP status/timeout without exposing candidate content. That supports choosing the owning-layer correction, rather than inferring a timer or authority fault from generic UI.

Conceptual debt is small: one fixed stage/kind union and bounded helper, used by three existing owners. It removes duplicated reporter mechanics across these new sites. It does not provide request correlation or a complete root-cause taxonomy, and should not acquire those responsibilities through private Error/message inspection. The existing Source qualification diagnostic helper is not an appropriate subsuming helper: it accepts errors and carries private metadata outside this patch (`src/composition/native-package-action-diagnostic.ts:162-173`). Keeping the new reporter smaller avoids coupling Submit observation to that candidate framework.

Falsifiability: if an authorized reproduction fails within these inspected boundaries before the cap and still produces no stage record, this diagnostic slice failed its purpose. A stage record by itself never proves cause, effect dispatch, backend receipt, or recovery.

## 5. Counterfactual analysis

- **Kill criterion:** any emitted private value, change to original refusal/state/retry identity, or bypass of current authority invalidates this design. Existing fixture additions statically target observer failure, metadata-only records, refusal preservation and silent success (`tests/shared/submit-diagnostic.test.ts`; diagnostic additions in `tests/shared/response-action-controller.test.ts` and `tests/adapters/http/task-completion.test.ts`). This reviewer inspected but did not execute those tests.
- **Counter-decision:** omit the reporter and retain existing refusal semantics with the same diagnostic blind spot. Adding a new log/capture service would add configuration and retention responsibility for no demonstrated need in this slice.
- **Removal probe:** removing the helper and its calls first loses developer console visibility; no native consumer or business artifact depends on the output.
- **Sibling subsumption:** partial pattern overlap with Save diagnostics; no existing sibling already supplies these Submit stages. Source qualification diagnostics cover another phase and are unchanged.
- **Six-month critic:** check whether stage labels are being overinterpreted as causes or receipts, whether recreated owner instances are mistaken for a global cap, and whether the helper has accumulated business IDs or raw errors.

## 6. Findings

**FINDING 1 — OBSERVATION; category intent-vs-shape; KEEP.** Final reread confirms that `src/shared/response-action-controller.ts:316-321` reports `controller-completion-preflight` for the selected completion capture, while `src/adapters/http/task-completion.ts:48` retains the specific `task-preflight` stage. This removes the initially observed intake/task label ambiguity without changing completion selection or behavior. A preflight record still does not prove dispatch.

**FINDING 2 — OBSERVATION; category scope; KEEP.** The diagnostics identify a bounded location, not the live refusal cause. Static review cannot conclude the incident is fixed or that a browser will capture console output. Preserve the incident and selected business state; use the next separately authorized runtime observation to choose any behavior correction. The architecture deliberately retains all native refusal and authority checks.

No blocker or concern identified in the reviewed patch. The existing private qualification diagnostic candidate is pre-existing scope and was not expanded by this change.

## 7. Verdict

**APPROVE** the diagnostics architecture.

- Intent versus shape: **MATCHES** — fixed metadata at existing refusal boundaries.
- User-value claim: **SUPPORTED** for bounded stage localization; no recovery claim.
- Commitment status: **HONORED** — native execution, Source signing/custody and WOS authority retain ownership.
- Conceptual debt delta: **NEUTRAL** — one small helper and finite vocabulary, no new service or artifact seam.
- Sibling subsumption: **PARTIAL** pattern overlap only.
- Confidence: **HIGH** for static boundary preservation; live effectiveness remains unverified.

## Reasoning record

H1: This is observation-only, not a second completion mechanism. Confirmed by base diff, unchanged result types, catches and same-owner effect calls.

H2: It preserves Source/WOS separation and repeated current-authority guards. Confirmed by task composition, capture strategy, adapter guards and normative Task API ownership text.

H3: It avoids private diagnostic-framework capture and arbitrary Error metadata. Confirmed by reporter signature and literal callers; the existing private sibling remains unchanged.

H4: Fixed stages fully identify the underlying cause. Refuted: stages intentionally locate a boundary, can cover several refusal causes, and completion preflight does not prove dispatch. The initial shared label ambiguity was corrected to `controller-completion-preflight` and independently reread before this final certificate. This narrows the approved value claim without changing the verdict.
