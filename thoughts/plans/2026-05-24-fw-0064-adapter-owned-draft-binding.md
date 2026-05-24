# FW-0064 — Adapter-owned draft binding registry (plan)

**Design:** [`thoughts/specs/2026-05-24-fw-0064-adapter-owned-draft-binding-design.md`](../specs/2026-05-24-fw-0064-adapter-owned-draft-binding-design.md)
**PLANNING row:** FW-0064 (open since M8 closeout; this plan executes its Done criteria)
**Discipline:** TDD red/green/refactor. No shims. Explicit-paths commits.

## Sequencing

Four commits. The refactor cascades through the type-checker — splitting the cohort introduction across commits would leave `default.ts` in an unbuildable state — so the cohort write + composition rewrite + test migration land together in commit 3.

### Task 1 — design + plan

Write:
- `thoughts/specs/2026-05-24-fw-0064-adapter-owned-draft-binding-design.md`
- `thoughts/plans/2026-05-24-fw-0064-adapter-owned-draft-binding.md`

Commit message: `design(formspec-web): adapter-owned draft binding registry (FW-0064)`

### Task 2 — RED — author cohort module + new cohort tests

Write:
- `src/adapters/http/cohort.ts` — `DraftBindingRegistry` internal type + `createHttpAdapterCohort` factory + `draftKeyFromHandoff` helper (used internally). Re-uses `HttpDraftStore` + `HttpSubmitTransport` (still defined in their existing files; the cohort just wires them).
- `src/adapters/http/draft-store.ts` — extend constructor to accept optional `bindingRegistry`. Drop `draftIdFor()` method.
- `src/adapters/http/index.ts` — export the cohort surface.

Tests:
- `tests/adapters/http/cohort.test.ts` — new file. Covers:
  - `createHttpAdapterCohort` returns both adapters with shared binding.
  - Calling `draftStore.save(key, response)` then `submitTransport.submit(handoff, idemKey)` with a handoff whose `definitionRef + subjectRef` derive the same key resolves to the bound draft id.
  - Anonymous-subject path (subjectRef starts with `anon:`) still binds and submits correctly.
  - `submitTransport.submit` throws if no binding exists for the derived key (regression — same surface as today's "HTTP SubmitTransport requires a draft id" error).
  - Cohort closure: changing `draftStore` bindings is visible through `submitTransport` (proves shared registry).
- `tests/adapters/http/draft-store.test.ts` — drop the two `expect(adapter.draftIdFor(key))` assertions. Replace with cohort-driven round-trip tests where applicable (or simply assert the load() path round-trip which already covers the binding implicitly).
- `tests/adapter-conformance/draft-store/conformance.test.ts` — unchanged (the standalone construction path still works because `bindingRegistry` is optional).
- `tests/adapter-conformance/submit-transport/conformance.test.ts` — unchanged.

Expected at task 2 alone: `npm run typecheck` fails because `default.ts` still uses `draftIdFor` and the old extensions key. Task 3 closes the loop.

This task is intentionally not commit-able on its own — it would break the build. The split is purely cognitive: cohort + draft-store changes are the new shape; task 3 is the consumer-side migration.

(Task 2 and 3 land in the same commit per the build-green rule.)

### Task 3 — GREEN — migrate composition + handoff producer + remaining tests

Write:
- `src/composition/default.ts` — replace the inline construction with `createHttpAdapterCohort({...})`. Delete `draftIdFromHandoff`, `draftKeyFromHandoff`, `isRecord` helpers. The composition body shrinks.
- `src/app/respondent-flow.ts:buildIntakeHandoff` — drop the `'x-formspec-draft-key': draftKey` entry from extensions. Keep all other extension keys.
- `tests/app/respondent-flow.test.ts` — assert `'x-formspec-draft-key'` is absent from extensions (regression guard). Keep `'x-formspec-response-data'` assertion.
- `tests/app/status-boot-narrowing.test.ts` — the existing `draftIdFor: () => undefined` mock member becomes vestigial; drop it (and arguably mock the cohort module — but if the existing per-adapter mocks still work post-refactor, leave them; the test only cares that constructors are NOT called on narrowed routes, and that property survives the refactor unchanged).

Commit message: `refactor(formspec-web): adapter-owned draft binding registry via HTTP cohort (FW-0064)`

Runs:
```
npm run typecheck
npm run lint
npm run test:conformance
npm run test:unit
```

Expected: green.

### Task 4 — docs

Edits:
- `docs/adapters/submit-transport.md` — add a paragraph pointing composition-style adopters at `createHttpAdapterCohort`; note that the standalone constructor path is still supported.
- Optionally update `docs/adapters/draft-store.md` if such a file exists (check first).

Commit message: `docs(formspec-web): document HTTP adapter cohort wiring (FW-0064)`

### Task 5 — CI + close-out

Runs:
```
npm run ci
```

Expected: green.

Then:
- `PLANNING.md` — move FW-0064 to `## Closed` with the FW-0065/0068/0070 close-out shape: full row body with `What`, `Done`, `User-visible behavior change`, `Consumes ports`, `Closed`, `Note` fields; stub at original location: `### FW-0064 — *(closed; see [## Closed](#closed) — adapter-owned cohort shipped, plan complete)*`.

Commit message: `chore(formspec-web): close FW-0064 — adapter-owned draft binding registry (close-out)`

Then at stack root:
- `git add formspec-web && git commit formspec-web -m "..."` (pointer bump). Do NOT push.

## Done criteria

- All 5 commits SHAs verified by `git log --oneline`.
- `npm run ci` green.
- `grep -rn 'draftIdFor' src/ tests/` empty.
- `grep -rn "'x-formspec-draft-key'\|x-formspec-draft-id" src/ tests/ | grep -v "absent\|NOT contain\|toBeUndefined"` empty (allows the absence-assertion lines).
- Stack pointer staged at parent (not pushed).
