import { beforeAll, describe, expect, it } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import { hydrateEngineFromResponse } from '../../src/app/respondent-flow.ts';
const definition: FormDefinition = { $formspec: '1.0', url: 'urn:test:initial-data', version: '1', title: 'Initial data test',
  items: [{ key: 'declared', type: 'field', dataType: 'boolean', label: 'Declaration' },
    { key: 'note', type: 'field', dataType: 'string', label: 'Note' }], binds: [{ path: 'declared', required: 'true' }] };
beforeAll(async () => { await initFormspecEngine(); });
describe('Surface-qualified initial data and restored responses', () => {
  it('keeps an absent required boolean distinct from explicit false', () => {
    const engine = createFormEngine(definition);
    try {
      hydrateEngineFromResponse(engine, undefined);
      expect(engine.signals.declared.value).toBeNull();
      expect(engine.getValidationReport({ profile: 'on-submit' }).counts.error).toBeGreaterThan(0);
    } finally { engine.dispose(); }
  });
  it('loads an explicit false into the native engine for a fresh draft', () => {
    const engine = createFormEngine(definition);
    try { hydrateEngineFromResponse(engine, undefined, { declared: false }); expect(engine.signals.declared.value).toBe(false); expect(engine.getValidationReport({ profile: 'on-submit' }).counts.error).toBe(0); }
    finally { engine.dispose(); }
  });
  it('preserves the actual saved response, including absent fields, over conflicting prefill', () => {
    const engine = createFormEngine(definition);
    const saved = { definitionUrl: definition.url, definitionVersion: definition.version, status: 'in-progress', data: { declared: true } } as unknown as FormResponse;
    try {
      hydrateEngineFromResponse(engine, saved, { declared: false, note: 'prefill' });
      expect(engine.signals.declared.value).toBe(true); expect(engine.signals.note.value).not.toBe('prefill');
      expect(saved.data).toEqual({ declared: true });
    } finally { engine.dispose(); }
  });
});
