import { beforeAll, describe, expect, it } from 'vitest';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import type { SavedResponseDraft } from '../../src/ports/response-signing.ts';
import { assembleTaskResponseData, assertTaskResponseCustody } from '../../src/shared/task-response-custody.ts';

beforeAll(() => initFormspecEngine());
const definition: FormDefinition = { $formspec: '1.0', url: 'urn:test:task-custody', version: '1', title: 'Task custody',
  items: [{ type: 'field', key: 'answer', label: 'answer', dataType: 'string' },
    { type: 'field', key: 'photo', label: 'photo', dataType: 'attachment' },
    { type: 'display', key: 'notice', label: 'notice' },
    { type: 'group', key: 'details', label: 'details', children: [{ type: 'field', key: 'name', label: 'name', dataType: 'string' }] },
    { type: 'group', key: 'rows', label: 'rows', repeatable: true, children: [{ type: 'field', key: 'name', label: 'name', dataType: 'string' }] }] };
function checkpoint(data: Record<string, unknown>): SavedResponseDraft {
  const response: FormResponse = { $formspecResponse: '1.0', definitionUrl: definition.url, definitionVersion: definition.version,
    id: 'neutral-response', authored: '2026-10-13T00:00:00Z', status: 'in-progress', data: structuredClone(data) };
  return { draftKey: { formUrl: definition.url, formVersion: definition.version, subjectRef: 'oidc:neutral' }, response,
    draft: { id: 'neutral-owned-task', version: 1, responseHash: `sha256:${'a'.repeat(64)}` }, actor: { id: 'oidc:neutral' },
    evidence: { draft_id: 'neutral-owned-task', form_version_id: 'neutral-publication', subject_ref: 'oidc:neutral', draft_version: 1,
      draft_state: response.data, canonical_response: response, status: 'in_progress', taskDraft: { version: 1,
        associationHash: `sha256:${'b'.repeat(64)}`, taskBindingHash: `sha256:${'c'.repeat(64)}` } } };
}

describe('owned task root custody', () => {
  it('retains opaque scalar, object and array roots without sharing mutable values', () => {
    const saved = checkpoint({ answer: 'before', opaqueScalar: false, opaqueObject: { nested: ['retained'] }, opaqueArray: [null, 3] });
    const current = { answer: 'after' };
    const assembled = assembleTaskResponseData(definition, current, saved);
    expect(assembled).toEqual({ ...saved.response.data, answer: 'after' });
    (assembled.opaqueObject as { nested: string[] }).nested.push('changed');
    expect(saved.response.data.opaqueObject).toEqual({ nested: ['retained'] });
    expect(current).toEqual({ answer: 'after' });
  });
  it('preserves deliberate authored clears and removed roots without restoring baseline values', () => {
    const saved = checkpoint({ answer: 'before', details: { name: 'before' }, opaque: 'retained' });
    expect(assembleTaskResponseData(definition, { answer: null }, saved)).toEqual({ answer: null, opaque: 'retained' });
    expect(assembleTaskResponseData(definition, {}, saved)).toEqual({ opaque: 'retained' });
  });
  it('keeps declared attachment objects wholly engine-owned', () => {
    const saved = checkpoint({ photo: { uri: 'urn:test:old', extra: 'old descriptor' }, opaque: 'retained' });
    expect(assembleTaskResponseData(definition, { photo: { uri: 'urn:test:new' } }, saved))
      .toEqual({ photo: { uri: 'urn:test:new' }, opaque: 'retained' });
  });
  it('honors actual engine repeat deletion without restoring a removed row', () => {
    const saved = checkpoint({ rows: [{ name: 'first' }, { name: 'second' }], opaque: 'retained' });
    const engine = createFormEngine(definition);
    try {
      engine.loadResponseData(saved.response.data as Parameters<typeof engine.loadResponseData>[0]); engine.removeRepeatInstance('rows', 0);
      const current = engine.getResponse({ profile: 'off' }).data;
      expect(assembleTaskResponseData(definition, current, saved).rows).toEqual([{ name: 'second' }]);
    } finally { engine.dispose(); }
  });
  it.each(['remove', 'empty', 'keep'] as const)('preserves actual engine non-relevance behavior %s', behavior => {
    const selected = { ...definition, nonRelevantBehavior: behavior, binds: [{ path: 'answer', relevant: 'false' }] };
    const saved = checkpoint({ answer: 'retained answer', opaque: 'retained metadata' });
    const engine = createFormEngine(selected);
    try {
      engine.loadResponseData(saved.response.data as Parameters<typeof engine.loadResponseData>[0]);
      const current = engine.getResponse({ profile: 'off' }).data;
      const assembled = assembleTaskResponseData(selected, current, saved);
      expect(Object.hasOwn(assembled, 'answer')).toBe(Object.hasOwn(current, 'answer'));
      expect(assembled.answer).toEqual(behavior === 'empty' ? null : behavior === 'keep' ? 'retained answer' : undefined); expect(assembled.opaque).toBe('retained metadata');
    } finally { engine.dispose(); }
  });
  it.each([{ opaque: 'changed' }, { inserted: 'unauthorized' }])('refuses conflicting or newly injected unmodeled roots', current => {
    expect(() => assembleTaskResponseData(definition, current, checkpoint({ opaque: 'retained' })))
      .toThrow('native-task-custody-conflict');
  });
  it.each([{ details: { name: 'known', unknown: 'protected' } }, { rows: [{ name: 'known', unknown: 'protected' }] }])
    ('refuses unknown descendants in modeled groups or repeat rows', data => {
      expect(() => assertTaskResponseCustody(definition, checkpoint(data))).toThrow('native-task-custody-nested-unsupported');
    });
  it('does not preserve a root colliding with a declared display item', () => {
    expect(assembleTaskResponseData(definition, {}, checkpoint({ notice: 'not answer data', opaque: 'retained' })))
      .toEqual({ opaque: 'retained' });
  });
  it('requires task evidence without modifying the saved response', () => {
    const saved = checkpoint({ opaque: 'retained' });
    const withoutTask = { ...saved, evidence: { ...saved.evidence, taskDraft: undefined } };
    expect(() => assembleTaskResponseData(definition, {}, withoutTask)).toThrow('native-task-custody-evidence-unavailable');
    expect(saved.response.data).toEqual({ opaque: 'retained' });
  });
  it('preserves own prototype-shaped JSON keys without changing object prototypes', () => {
    const saved = checkpoint(JSON.parse('{"__proto__":{"retained":true},"constructor":"opaque"}'));
    const assembled = assembleTaskResponseData(definition, {}, saved);
    expect(Object.hasOwn(assembled, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(assembled)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('retained');
  });
});
