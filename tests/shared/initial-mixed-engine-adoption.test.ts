import { decodeInitialMixedHydration } from '../../src/adapters/http/initial-mixed-proof-wire.ts';
import { beforeAll, describe, expect, it } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { createFormEngine } from '@formspec-org/engine/render';
import type { FormDefinition } from '@formspec-org/types';
import { replaceNativeFormEngine } from '../../src/shared/native-engine-replacement.ts';
import { createEvaluationInstanceResolver } from '../../src/shared/evaluation-instance-resolver.ts';
import { mockFixture } from '../adapters/source-worker/mock-fixture.ts';

beforeAll(() => initFormspecEngine());
// Tests maintained V2 resolver/replacement custody with mocked facts, not owning proof semantics.
describe('initial mixed facts at maintained engine adoption', () => {
  function fixture() {
    const mock = mockFixture();
    const view = decodeInitialMixedHydration(JSON.parse(new TextDecoder().decode(mock.bundle.hydrationBytes)));
    const definition: FormDefinition = { $formspec: '1.0', url: view.selection.definitionUrl, version: view.selection.definitionVersion,
      title: 'Neutral', items: [{ type: 'field', key: 'answer', dataType: 'boolean', label: 'Answer' }],
      instances: { facts: { source: 'screening', readonly: true, schema: { value: 'boolean' } } } };
    let current = true;
    const assertCurrent = () => { if (!current) throw new Error('candidate retired'); };
    const old = createFormEngine(definition, { instanceSourceResolver: () => ({ status: 'loaded', value: { value: true } }) });
    old.loadResponseData({ answer: false });
    return { old, facts: { view, assertCurrent, assertReady: assertCurrent }, retire: () => { current = false; } };
  }
  it('preserves saved false data and transfers a V2 replacement once', async () => {
    const f = fixture(); await f.old.waitForInstanceSources();
    const result = await replaceNativeFormEngine({ currentEngine: f.old,
      engineOptions: { instanceSourceResolver: createEvaluationInstanceResolver(f.facts) }, localeDocuments: [],
      signal: new AbortController().signal, assertCurrent: f.facts.assertCurrent });
    try {
      expect(result.status).toBe('replaced'); if (result.status !== 'replaced') throw new Error('replacement unavailable');
      expect(result.engine.signals.answer.value).toBe(false); expect(f.old.signals.answer.value).toBe(false);
      expect(result.sourceOutcomes.facts.status).toBe('loaded'); result.adopt();
      expect(() => result.adopt()).toThrow('already adopted'); result.engine.dispose();
    } finally { if (result.status === 'replaced') result.dispose(); f.old.dispose(); }
  });
  it('refuses adoption after candidate retirement and keeps the original answers', async () => {
    const f = fixture(); await f.old.waitForInstanceSources();
    const result = await replaceNativeFormEngine({ currentEngine: f.old,
      engineOptions: { instanceSourceResolver: createEvaluationInstanceResolver(f.facts) }, localeDocuments: [],
      signal: new AbortController().signal, assertCurrent: f.facts.assertCurrent });
    try {
      if (result.status !== 'replaced') throw new Error('replacement unavailable');
      f.retire(); expect(() => result.adopt()).toThrow('candidate retired');
      expect(f.old.signals.answer.value).toBe(false);
    } finally { if (result.status === 'replaced') result.dispose(); f.old.dispose(); }
  });
});
