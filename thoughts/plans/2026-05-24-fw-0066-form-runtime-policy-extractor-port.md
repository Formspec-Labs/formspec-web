# FW-0066 — FormRuntimePolicyExtractor port (plan)

**Design:** [`thoughts/specs/2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md`](../specs/2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md)
**PLANNING row:** FW-0066 (currently open; this plan executes the row's Done criteria)
**Discipline:** TDD red/green/refactor. No shims. Explicit-paths commits.

## Sequencing

Six tasks; each is one commit. The order keeps the build green after every step.

### Task 1 — RED — author the port interface + conformance suite

Write:

- `src/ports/form-runtime-policy-extractor.ts` — `FormRuntimePolicyExtractor` interface + JSDoc citing ADR-0009 + ADR-0011.
- `src/ports/index.ts` — re-export the new type.
- `src/adapter-conformance/conformance.ts` — `defineFormRuntimePolicyExtractorConformance(name, setup)` with the 5+ assertions named in the design.
- `src/adapter-conformance/index.ts` — export the new helper + subject type.
- `tests/adapter-conformance/_framework/conformance.ts` — re-export the new helper.

No adapter exists yet — `tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts` is NOT written in this task because nothing implements the port. The `typecheck` step in CI is green; the conformance harness is callable but unused.

Commit message: `feat(formspec-web): add FormRuntimePolicyExtractor port + conformance harness (FW-0066 task 1)`

### Task 2 — GREEN — reference adapters + adapter conformance test

Write:

- `src/adapters/composing/form-runtime-policy-extractor.ts` — `EmptyFormRuntimePolicyExtractor`, `AttachmentRequirementExtractor` (wraps `extractAttachmentRequirement`), `CompositeFormRuntimePolicyExtractor`.
- `src/adapters/stub/form-runtime-policy-extractor.ts` — `DemoFormPolicyExtractor` marked `DEMO_STUB_ADAPTER`.
- `tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts` — register all four adapters via the framework helper.

Runs:

```
npm run test:conformance -- form-runtime-policy-extractor
```

Expected: 4 adapters × 5 cases = 20+ test pass.

Commit message: `feat(formspec-web): add Empty/Attachment/Demo/Composite FormRuntimePolicyExtractor reference adapters (FW-0066 task 2)`

### Task 3 — REFACTOR — flip the Composition contract, rewrite all call sites

Edits in one commit (composition contract change cascades through the type-checker; partial commits break the build):

- `src/composition/types.ts` — rename `getFormRuntimePolicy` to `formRuntimePolicyExtractor: FormRuntimePolicyExtractor`. Remove the inline promotion-trigger TODO. Update the JSDoc to reference the port.
- `src/composition/default.ts` — wire `new AttachmentRequirementExtractor()`. Drop the closure + `extractAttachmentRequirement` direct import.
- `src/composition/stub.ts` — wire `new CompositeFormRuntimePolicyExtractor([new DemoFormPolicyExtractor(), new AttachmentRequirementExtractor()])`. Drop the closure + URL constant inline + `extractAttachmentRequirement` direct import.
- `src/composition/route-narrowing.ts` — both factories wire `new EmptyFormRuntimePolicyExtractor()`; drop the `emptyFormRuntimePolicy` local helper.
- `src/app/RespondentRuntime.tsx` — `composition.getFormRuntimePolicy(definition)` → `composition.formRuntimePolicyExtractor.extract(definition)`. Update the surrounding error-wrapper message to cite the port (`'FormRuntimePolicyExtractor.extract threw: …'`).
- Tests: bulk-rewrite all 11 test files identified in the design migration table.

Runs:

```
npm run typecheck
npm run test:unit
npm run test:conformance
```

Expected: green.

Commit message: `refactor(formspec-web): replace getFormRuntimePolicy closure with FormRuntimePolicyExtractor port (FW-0066 task 3)`

### Task 4 — docs + conformance-coverage script

Edits:

- `docs/policy/runtime-feature-resolution.md` — replace closure references with the port; rewrite §"Adding a new feature key" step 6 to describe authoring a new extractor adapter and composing it into the composition factory; update the adopter migration example.
- `tests/adapter-conformance/README.md` — add `form-runtime-policy-extractor/` to the directory skeleton.
- `scripts/check-conformance-coverage.mjs` — add `'FormRuntimePolicyExtractor'` to `portSuites`; add the two adapter paths to `stubPortsByPath`; add `'defineFormRuntimePolicyExtractorConformance'` to `requiredHarnessExports`.

Runs:

```
npm run check:conformance-coverage
```

Expected: ≥1 new registration, sentinel count unchanged.

Commit message: `docs(formspec-web): document FormRuntimePolicyExtractor port + extend conformance-coverage check (FW-0066 task 4)`

### Task 5 — PLANNING.md close-out

- Move the FW-0066 row body to `## Closed` (with a `Closed:` bullet citing the commits + the design + plan docs).
- Replace the original FW-0066 entry with the stub form FW-0065 / FW-0068 / FW-0070 use.

Optional touch-ups to keep the read straight:

- ADR-0011 §"Non-form surface synthesis" — append a one-line note that the FW-0066 promotion landed and the addendum's Option B (literal route synthesis) holds verbatim because narrowed-route compositions wire `EmptyFormRuntimePolicyExtractor`.

Commit message: `docs(formspec-web): close FW-0066 — FormRuntimePolicyExtractor port landed (planning)`

### Task 6 — CI gate + verify

Runs:

```
npm run ci
```

Expected: green.

If green, the work is complete. If red, fix-in-place and add a new commit (per project no-amend discipline).

## Risks + mitigations

- **Composition contract rename is a wide blast radius.** Mitigated by doing all rewrites in one commit (task 3) so typecheck never goes red mid-state.
- **`DemoFormPolicyExtractor`'s `DEMO_STUB_ADAPTER` marker.** Marker is hung for symmetry with the other demo adapters; the coherence assertion has no entry for the new port slot in `FEATURE_PORT_MAP`, so the marker is ignored at coherence time. Verified by re-running `tests/policy/composition-coherence` after the rewrite.
- **Conformance-coverage script's regex for `stub*` factories.** Today it only matches `stub<X>` patterns in `src/adapters/stub/*.ts`. The new path lives there for the demo extractor (good); the composing adapters live in `src/adapters/composing/` and use class names that the existing `class … implements` discovery path catches once they `implements FormRuntimePolicyExtractor`. The script update in task 4 adds the new port to its known list; verify by running the script standalone after task 4.
- **Existing `extract-form-policy.test.ts`.** Stays — `extractAttachmentRequirement` is still a public helper; the new `AttachmentRequirementExtractor` wraps it. Two layers, two test surfaces; the unit test stays focused on the walker; conformance covers the port semantics.

## Done

All six tasks committed; SHAs verified via `git log --oneline -n 6`. `npm run ci` green. PLANNING row closed. Stack pointer staged at parent (not pushed).
