import { beforeAll, describe, expect, it } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import { respondentEngineDataOptions } from '../../src/app/respondent-flow.ts';
const definition: FormDefinition = { $formspec: '1.0', url: 'urn:test:initial-data', version: '1', title: 'Initial data test',
  items: [{ key: 'declared', type: 'field', dataType: 'boolean', label: 'Declaration' },
    { key: 'note', type: 'field', dataType: 'string', label: 'Note', initialValue: 'authored default' }], binds: [{ path: 'declared', required: 'true' }] };
beforeAll(async () => { await initFormspecEngine(); });
describe('Surface-qualified initial data and restored responses', () => {
  it('keeps an absent required boolean distinct from explicit false', () => {
    const engine = createFormEngine(definition, respondentEngineDataOptions());
    try {
      expect(engine.signals.declared.value).toBeNull();
      expect(engine.getValidationReport({ profile: 'on-submit' }).counts.error).toBeGreaterThan(0);
    } finally { engine.dispose(); }
  });
  it('loads an explicit false into the native engine for a fresh draft', () => {
    const engine = createFormEngine(definition, respondentEngineDataOptions(undefined, { declared: false }));
    try { expect(engine.signals.declared.value).toBe(false); expect(engine.getValidationReport({ profile: 'on-submit' }).counts.error).toBe(0); }
    finally { engine.dispose(); }
  });
  it('preserves the actual saved response, including absent fields, over conflicting prefill', () => {
    const saved = { definitionUrl: definition.url, definitionVersion: definition.version, status: 'in-progress', data: { declared: true } } as unknown as FormResponse;
    const engine = createFormEngine(definition, respondentEngineDataOptions(saved, { declared: false, note: 'prefill' }));
    try {
      expect(engine.signals.declared.value).toBe(true); expect(engine.signals.note.value).toBeNull();
      expect(engine.getResponse().data).toEqual({ declared: true });
      expect(saved.data).toEqual({ declared: true });
    } finally { engine.dispose(); }
  });
});
