---
title: Multi-Party Commitment-Protocol Spike — Observation Report
date: 2026-05-25
status: complete
spike: FW-0115
adr: thoughts/adr/0155-multi-party-intake.md (§8)
sources:
  - src/composition/spike/multi-party-commit-A/
  - src/composition/spike/multi-party-commit-B/
  - tests/composition/spike/multi-party-commit-A.test.ts
  - tests/composition/spike/multi-party-commit-B.test.ts
  - scripts/spike-multi-party-commit-measure.mjs
---

# Multi-Party Commitment-Protocol Spike — Observation Report

## 1. What this is

The §8.5 measurements + §8.6 verdict for the FW-0115 spike. Two candidate
port shapes from ADR-0155 §8.3 (Shape A — 2PC explicit states; Shape B —
eventual-consistency with explicit GC contract) were implemented in
`src/composition/spike/multi-party-commit-A/` and
`src/composition/spike/multi-party-commit-B/` against the existing
`DraftStore`, `IdentityProvider`, and `SubmitTransport` ports per
ADR-0155 §5. Each shape carries an in-memory adapter and a scenario
harness exercising the four §8.4 fixtures (F1 happy-path, F2
abandonment, F3 post-prepare amendment, F4 mid-flow party-addition).

## 2. Measurements

### 2.1 Port-method calls per fixture (§8.5 criterion 1 — lower is better)

Produced by `node --experimental-strip-types scripts/spike-multi-party-commit-measure.mjs`.
The harness wraps the commitment port and increments a counter on every
call — the table below is the raw count, not a hand-estimate.

| Fixture | Shape A | Shape B |
|---|---:|---:|
| F1 happy-path | 9 | 9 |
| F2 abandonment | 7 | 9 |
| F3 post-prepare amendment | 10 | 12 |
| F4 mid-flow party-addition | 12 | 10 |
| **TOTAL** | **38** | **40** |

Shape A wins the sum by 2 calls. The per-fixture distribution is mixed:
F1 ties, F2 + F3 favor A, F4 favors B (Shape B does not need an extra
`prepare` step for the late-joining party — the `Drafted | Signed`
action set folds it in).

### 2.2 Consumer LOC per fixture (§8.5 criterion 2 — lower is better)

Non-blank, non-comment lines in each `runXxx` scenario function (the
adapter implementation is excluded — the §8.5 criterion measures the
*consumer* code that goes through the port).

| Fixture | Shape A | Shape B |
|---|---:|---:|
| F1 happy-path | 24 | 38 |
| F2 abandonment | 16 | 28 |
| F3 post-prepare amendment | 30 | 50 |
| F4 mid-flow party-addition | 37 | 49 |
| **TOTAL** | **107** | **165** |

Shape A's consumer is 35% smaller. The difference is structural: Shape
A's `prepare` → `commit` cycle communicates "I have decided what I am
signing" with one named transition, while Shape B requires the consumer
to re-read the convergence state after every action to know whether the
read-model surfaced a cascade. The bookkeeping that Shape A pushes into
the coordinator's FSM is, in Shape B, work the consumer does explicitly.

### 2.3 Edge-case gap count (§8.5 criterion 3 — smaller is better)

Cases the shape cannot represent without escape hatches.

| Edge case | Shape A | Shape B |
|---|---|---|
| Distinguishing window-expiry abort from caller-initiated abort | typed `AbortReason` | NOT REPRESENTED — `Abandoned.reason: string` |
| Surfacing the cascade-invalidated party set on amendment | typed `AmendmentResult.cascadedParties[]` | requires `read()` diff against prior snapshot |
| Late-joining party in `F4` without invalidating prior preparations | natively (party joins at `Drafting`) | natively (party joins as live-but-unsigned; convergence flips to `PendingConvergence`) |
| Bounded preparation window (per-party deadline) | typed `PreparationWindow` + `tickClock` | NOT REPRESENTED at port — caller would have to layer it on |
| Per-party post-sign retraction (§8.1 d) | needs additive `abort` from `Committed`; current port disallows | natively (append `Abandoned` action) |
| Disagreement-as-state composition with §6 | both signatures observably differ at digest; port-orthogonal | both signatures observably differ at digest; port-orthogonal |

Counted gaps (`NOT REPRESENTED` rows): Shape A = 1, Shape B = 2.

Shape A's gap is "post-sign retraction from `Committed`" — solvable by
adding `Aborted` as a valid transition from `Committed`, which is a
straightforward FSM widening.

Shape B's gaps are (a) preparation-window semantics, which the
spec-grade port wants because §8.1(a) names "garbage-collection of
party N of M abandons after parties 1..N-1 prepared" as a port-level
concern — and Shape B's only mechanism is the 90-day tombstone TTL,
which is the wrong primitive for "the live signing session timed out
after 30 minutes" — and (b) the abort-reason taxonomy. Both could be
patched at adapter level, but the spec-grade port-shape decision is
that they are NOT carried at the port surface.

### 2.4 Composition fit with FW-0048 / FW-0049 / FW-0050 (§8.5 criterion 4 — fewer adjustments is better)

| Composition | Shape A fit | Shape B fit |
|---|---|---|
| FW-0048 per-party duress sidecar (`partyRef` on `submission.duress-signaled`) | `Signature.duressOpaque` rides on `commit(partyRef, signature)`; opaque blob is the right shape per §7.1 | `Signature.duressOpaque` rides on the `Signed` action; same opacity guarantee |
| FW-0048 per-party invisibility (status reads, ceremony) | natively — `snapshot()` partitions by party; the consumer scopes results | natively — `read().perParty` is keyed by `partyRef`; consumer scopes results |
| FW-0049 per-party safe-* mask (each party's view differs) | per-party `visibleFields` set on `PartyDeclaration`; `amend` rejects non-visible fields | per-party `visibleFields` on `PartyDeclaration`; `applyPartyAction({kind:'Drafted'})` rejects non-visible fields |
| FW-0050 §3.3 + §5.1 per-party deadline policy (coEqual tier; §4.2 routes asymmetric tier to WOS) | aligns with `prepare(party, window)` bounded-window primitive at the coEqual-tier live-session-abandonment scope; FW-0061's asymmetric build composes the port's window with WOS for flow-level deadlines | does NOT compose — Shape B has no per-party live-session timeout primitive; would need a sibling timer port even for coEqual-tier intake-only |
| Disagreement-as-state (§6) preserves both attested values | port-orthogonal — both shapes record per-party signatures separately | port-orthogonal — `read().perParty` exposes per-party log |

Shape A composes with all five. Shape B does not compose with FW-0050
§3.3 + §5.1's per-party deadline policy (which FW-0050 §4.2 routes to WOS
for the asymmetric tier) without an external timer mechanism. Per §8.6
criterion 3, "shape adjustments to FW-0048 + FW-0049 + FW-0050
primitives" — Shape B does not require adjustments to those rows'
*primitives*, but it forces the consumer to layer per-party deadline
tracking outside the commitment port even for the coEqual-tier intake-only
flow the spike is scoped to. Shape A absorbs that work at the coEqual-tier
live-session-abandonment scope; flow-level asymmetric-tier deadlines still
compose with WOS per FW-0050 §4.2.

### 2.5 Caveat on criteria — reason + user value over authority

Per `DEVELOPMENT-PHILOSOPHY.md` "reason + user value over authority":
the §8.5 criteria are a spec from this ADR, not authority. Two
observations worth naming:

1. **Port-method-call count is a noisy metric for shapes whose
   primitives have different cardinality.** Shape B's `applyPartyAction`
   subsumes Shape A's `amend` + `prepare` + `commit` + `abort` into one
   primitive — counting calls without weighting by what the primitive
   does undersells Shape A's structural advantage. The LOC measure
   (§2.2) is the more honest signal.
2. **Shape B's 90-day GC TTL is the wrong primitive for live-session
   abandonment.** Per §8.1(a), "Party N of M abandons after parties
   1..N-1 prepared" needs the *live session* to time out in minutes,
   not the *tombstone* to expire in days. Shape B's port carries the
   90-day tombstone TTL but has no live-session timeout — adapters
   would have to wrap their own. Shape A's `PreparationWindow` carries
   the live-session timeout natively. This is the load-bearing
   composition asymmetry.

## 3. Verdict

**Winner: Shape A — 2PC explicit states.**

Decision per §8.6 (with primary criteria leading; port-call sum demoted to
tie-detector per the §8.6 reshape):

1. **Consumer-LOC sum** (primary signal) — Shape A 107 vs Shape B 165, a
   **35% margin**. This is the load-bearing measurement; consumer LOC
   directly indicates how much of the multi-party coordination work the
   port pushes into the implementation versus dumping on the consumer. The
   per-call work-weight difference between Shape A's `prepare`/`commit`/
   `abort`/`amend` and Shape B's umbrella `applyPartyAction` is real, and
   LOC is the per-call-weight-honest measure.
2. **Edge-case gap count** (primary signal) — Shape A 1 vs Shape B 2.
   Shape A's gap is additive (post-sign retraction; solvable by allowing
   `Aborted` as a transition from `Committed` — straightforward FSM
   widening). Shape B's gaps are at the wrong tier (preparation-window
   semantics and abort-reason taxonomy that the §8.1(a) commitment names as
   port-level).
3. **Composition fit** (primary signal; tiebreaker per §8.6) — Shape A
   composes with FW-0050 §3.3 + §5.1's per-party deadline policy (which
   FW-0050 §4.2 routes to WOS for the asymmetric tier) through
   `PreparationWindow` + `tickClock` at the coEqual-tier live-session-
   abandonment scope; Shape B does not, and would force the consumer to
   layer a sibling timer port.
4. **Port-method-call sum** (tie-detector) — Shape A wins 38 vs 40, a ~5%
   margin. Per §8.6 small margins on call count are noise — see §2.5(1) on
   per-call work-weight; the LOC measure above is the honest signal of the
   same underlying property and Shape A's 35% margin there is decisive.

All three primary criteria favor Shape A; the tie-detector aligns. Per §8.6
the tiebreaker (criterion 3, composition fit) is the load-bearing one, and
Shape A wins it cleanly.

No third shape emerged during the spike. §8.7's escape hatch does not fire.

## 4. What lands

Per ADR-0155 §8.7:

- The winning shape (Shape A — 2PC explicit states) moves to
  `src/ports/multi-party-commit.ts` as the locked port.
- The losing shape (Shape B — eventual-consistency) is deleted
  (`src/composition/spike/multi-party-commit-B/` and its test).
- **Shape A's spike directory is RETAINED** at
  `src/composition/spike/multi-party-commit-A/` (`in-memory.ts`,
  `scenario.ts`, plus the matching test under `tests/composition/spike/`)
  as the in-memory reference adapter for the locked port — until
  FW-0061 ships the production adapter. The locked port file's
  doc-comment header pins this rationale so future agents don't
  delete it as "spike scaffold."
- The local `port.ts` inside `multi-party-commit-A/` was deleted
  when the locked port shipped at `src/ports/multi-party-commit.ts`;
  the adapter and scenario re-point at the locked port.
- The measurement script
  (`scripts/spike-multi-party-commit-measure.mjs`) was deleted —
  the §8.5 measurement was one-shot and is preserved in this report.

ADR-0155 §8 is updated with §8.10 recording the verdict + this
observation report's path.

## 5. Honest deferrals not in the spike's scope

The spike does NOT resolve (and explicitly punts to FW-0061 build per
§8.9):

1. The exact `partyRef` URN format. The spike used
   `urn:party:<roleId>:<sessionId>` per FW-0048 §7.1 prose; the
   formal property name and URN grammar belong to the formspec schema PR.
2. The real `PreparationWindow.windowMs` value. The spike uses 60_000ms
   (60s) — illustrative; the FW-0061 build picks the production value.
3. The interaction with WOS-orchestrated `asymmetric` tier flows per
   §7. The spike runs against `coEqual` intake-only per §8.9.
4. The Trellis carriage shape per §9. Trellis byte-level contract
   unchanged per §8.9.
