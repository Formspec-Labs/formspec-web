#!/usr/bin/env node
/* global console */
/**
 * Spike measurement runner for FW-0115 / ADR-0155 §8.5.
 *
 * Executes each scenario once per shape, records the port-method-call
 * count, and pretty-prints the observation-report table. Run with:
 *
 *   node --experimental-strip-types scripts/spike-multi-party-commit-measure.mjs
 *
 * The observation report at thoughts/spikes/2026-05-25-multi-party-commit-spike-observation.md
 * is built from this output.
 */

import { stubDraftStore } from '../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../src/adapters/stub/identity-provider.ts';
import { stubSubmitTransport } from '../src/adapters/stub/submit-transport.ts';
import { createInMemoryCommitA } from '../src/composition/spike/multi-party-commit-A/in-memory.ts';
import * as scenarioA from '../src/composition/spike/multi-party-commit-A/scenario.ts';
import { createInMemoryCommitB } from '../src/composition/spike/multi-party-commit-B/in-memory.ts';
import * as scenarioB from '../src/composition/spike/multi-party-commit-B/scenario.ts';

function makePortsA() {
  return {
    commit: createInMemoryCommitA(),
    draftStore: stubDraftStore(),
    identityProvider: stubIdentityProvider(),
    submitTransport: stubSubmitTransport(),
  };
}

function makePortsB() {
  return {
    commit: createInMemoryCommitB(),
    draftStore: stubDraftStore(),
    identityProvider: stubIdentityProvider(),
    submitTransport: stubSubmitTransport(),
  };
}

const fixtures = [
  ['F1 happy-path', 'runHappyPath'],
  ['F2 abandonment', 'runAbandonment'],
  ['F3 post-prepare amendment', 'runPostPrepareAmendment'],
  ['F4 mid-flow party-addition', 'runMidFlowPartyAddition'],
];

const rows = [];
for (const [name, fn] of fixtures) {
  const a = await scenarioA[fn](makePortsA());
  const b = await scenarioB[fn](makePortsB());
  rows.push({
    fixture: name,
    shapeA: a.callLog.commitMethodCalls,
    shapeB: b.callLog.commitMethodCalls,
  });
}

const totalA = rows.reduce((sum, r) => sum + r.shapeA, 0);
const totalB = rows.reduce((sum, r) => sum + r.shapeB, 0);

console.log('| Fixture | Shape A calls | Shape B calls |');
console.log('|---|---:|---:|');
for (const row of rows) {
  console.log(`| ${row.fixture} | ${row.shapeA} | ${row.shapeB} |`);
}
console.log(`| **TOTAL** | **${totalA}** | **${totalB}** |`);
