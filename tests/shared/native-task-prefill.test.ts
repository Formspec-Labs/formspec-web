import { describe, expect, it } from 'vitest';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import type { SavedResponseDraft } from '../../src/ports/response-signing.ts';
import { assembleNativeTaskPrefill } from '../../src/shared/native-task-prefill.ts';
import { assertTaskDraftWire } from '../../src/shared/task-draft-wire.ts';

// Local assembly controls. Authentication and native TaskPrefillV1 verification
// belong to Source's owning-read tests; this fixture grants no runtime authority.
function fixture(data: Record<string, unknown> = { protected: 'urn:test:retained', editable: { before: true } }) {
  const definition: FormDefinition = {
    $formspec: '1.0', url: 'urn:test:partition', version: '1', title: 'Partition controls',
    items: [
      { key: 'protected', type: 'field', dataType: 'string', label: 'Protected' },
      { key: 'editable', type: 'field', dataType: 'string', label: 'Editable' },
      { key: 'note', type: 'display', label: 'Instructions' },
    ],
  };
  const response: FormResponse = { $formspecResponse: '1.0', id: 'response-test',
    definitionUrl: definition.url, definitionVersion: definition.version, status: 'in-progress', authored: '2026-10-13T00:00:00Z', data };
  const saved: SavedResponseDraft = {
    draftKey: { formUrl: definition.url, formVersion: definition.version, subjectRef: 'actor-test' },
    response, draft: { id: 'draft-test', version: 1, responseHash: 'a'.repeat(64) }, actor: { id: 'actor-test' },
    evidence: { draft_id: 'draft-test', draft_version: 1, form_version_id: 'version-test', subject_ref: 'actor-test',
      status: 'in_progress', canonical_response: response, draft_state: data,
      taskDraft: { version: 1, associationHash: `sha256:${'b'.repeat(64)}`, taskBindingHash: `sha256:${'c'.repeat(64)}`,
        taskPrefill: { version: 1, editableDataPaths: ['/editable'], readOnlyDataPaths: ['/protected'] } } },
  };
  return { definition, saved, prefill: saved.evidence.taskDraft!.taskPrefill! };
}

describe('native task-prefill assembly', () => {
  it('retains protected data omitted by serialization and replaces an editable subtree wholesale', () => {
    const f = fixture(); const before = structuredClone(f.saved);
    const candidate = { editable: { after: true } };
    expect(assembleNativeTaskPrefill(f.definition, f.saved, candidate)).toEqual({ protected: 'urn:test:retained', editable: { after: true } });
    expect(candidate).toEqual({ editable: { after: true } });
    expect(f.saved).toEqual(before);
  });

  it('deletes an editable root omitted by serialization', () => {
    const f = fixture();
    expect(assembleNativeTaskPrefill(f.definition, f.saved, {})).toEqual({ protected: 'urn:test:retained' });
  });

  it('accepts protected structured values using canonical equality', () => {
    const f = fixture({ protected: { a: 1, b: 2 } });
    expect(assembleNativeTaskPrefill(f.definition, f.saved, { protected: { b: 2, a: 1 } })).toEqual({ protected: { a: 1, b: 2 } });
  });

  it.each([null, 'urn:test:changed', { changed: true }])('refuses a protected replacement %j', value => {
    const f = fixture();
    expect(() => assembleNativeTaskPrefill(f.definition, f.saved, { protected: value })).toThrow('protected value differs');
  });

  it('preserves absent protected roots and present null roots distinctly', () => {
    const absent = fixture({}); const present = fixture({ protected: null });
    const absentResult = assembleNativeTaskPrefill(absent.definition, absent.saved, {});
    const nullResult = assembleNativeTaskPrefill(present.definition, present.saved, {});
    expect(Object.hasOwn(absentResult, 'protected')).toBe(false);
    expect(Object.hasOwn(nullResult, 'protected')).toBe(true);
    expect(nullResult.protected).toBeNull();
    expect(assembleNativeTaskPrefill(present.definition, present.saved, { protected: null })).toEqual({ protected: null });
  });

  it.each([null, 'urn:test:inserted'])('refuses ambiguous or new protected presence %j', value => {
    const f = fixture({});
    expect(() => assembleNativeTaskPrefill(f.definition, f.saved, { protected: value })).toThrow('protected value differs');
  });

  it('decodes escaped flat pointers and preserves literal prototype-named roots', () => {
    const f = fixture(JSON.parse('{"a/b~c":"retained","__proto__":{"safe":true}}'));
    f.definition.items = [
      { key: 'a/b~c', type: 'field', dataType: 'string', label: 'Escaped' },
      { key: '__proto__', type: 'field', dataType: 'string', label: 'Literal' },
    ];
    Object.assign(f.prefill, { editableDataPaths: [], readOnlyDataPaths: ['/a~1b~0c', '/__proto__'] });
    const result = assembleNativeTaskPrefill(f.definition, f.saved, {});
    expect(result).toEqual(f.saved.response.data);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
  });

  it.each(['association', 'partition'])('preserves ordinary behavior without %s metadata', missing => {
    const f = fixture();
    if (missing === 'association') delete (f.saved.evidence as { taskDraft?: unknown }).taskDraft;
    else delete (f.saved.evidence.taskDraft as { taskPrefill?: unknown }).taskPrefill;
    const candidate = { ordinary: true };
    expect(assembleNativeTaskPrefill(f.definition, f.saved, candidate)).toBe(candidate);
  });

  it.each([
    { editableDataPaths: ['/editable'], readOnlyDataPaths: [] },
    { editableDataPaths: ['/editable'], readOnlyDataPaths: ['/protected', '/extra'] },
    { editableDataPaths: ['/editable', '/protected'], readOnlyDataPaths: ['/protected'] },
    { editableDataPaths: ['/editable'], readOnlyDataPaths: ['/protected/nested'] },
    { editableDataPaths: ['/editable'], readOnlyDataPaths: ['/protected~2'] },
    { editableDataPaths: ['/editable'], readOnlyDataPaths: ['/protected'], extra: true },
    { version: 2, editableDataPaths: ['/editable'], readOnlyDataPaths: ['/protected'] },
  ])('refuses malformed or incomplete metadata %j', partition => {
    const f = fixture(); Object.assign(f.prefill, partition);
    expect(() => assembleNativeTaskPrefill(f.definition, f.saved, {})).toThrow();
  });

  it.each(['baseline', 'candidate'])('refuses undeclared %s roots', side => {
    const f = fixture(side === 'baseline' ? { extra: true } : {});
    expect(() => assembleNativeTaskPrefill(f.definition, f.saved, side === 'candidate' ? { extra: true } : {})).toThrow();
  });

  it.each([
    { key: 'protected', type: 'group', children: [] },
    { key: 'protected', type: 'field', dataType: 'string', children: [] },
    { key: 'protected', type: 'field', dataType: 'string', repeatable: true },
  ])('refuses unsupported declarations %j', declaration => {
    const f = fixture(); f.definition.items[0] = declaration as FormDefinition['items'][number];
    expect(() => assembleNativeTaskPrefill(f.definition, f.saved, {})).toThrow();
  });

  it('refuses duplicate Definition roots', () => {
    const f = fixture(); f.definition.items.push(structuredClone(f.definition.items[0]));
    expect(() => assembleNativeTaskPrefill(f.definition, f.saved, {})).toThrow();
  });

  it('refuses an editable field with a constant readonly bind', () => {
    const f = fixture(); f.definition.binds = [{ path: 'editable', readonly: 'true' }];
    expect(() => assembleNativeTaskPrefill(f.definition, f.saved, {})).toThrow();
  });

  it('bounds the complete metadata partition to native V1 capacity', () => {
    const f = fixture();
    Object.assign(f.prefill, {
      editableDataPaths: Array.from({ length: 64 }, (_, index) => `/editable${index}`),
      readOnlyDataPaths: Array.from({ length: 65 }, (_, index) => `/protected${index}`),
    });
    expect(() => assertTaskDraftWire(f.saved.evidence.taskDraft)).toThrow();
  });

  it.each([
    { version: 2 }, { associationHash: 'wrong' }, { taskBindingHash: 'wrong' },
    { taskPrefill: null },
    { taskPrefill: { version: 1, editableDataPaths: [], readOnlyDataPaths: ['/'] } },
    { taskPrefill: { version: 1, editableDataPaths: [], readOnlyDataPaths: [`/${'é'.repeat(512)}`] } },
  ])('refuses invalid task association metadata %j', change => {
    const f = fixture(); Object.assign(f.saved.evidence.taskDraft!, change);
    expect(() => assertTaskDraftWire(f.saved.evidence.taskDraft)).toThrow();
  });
});
