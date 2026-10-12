import { describe, expect, it } from 'vitest';
import { createBrowserDraftResumeMetadataStore } from '../../../src/adapters/browser/draft-resume-metadata.ts';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const base = { baseUrl: 'https://source.example/runtime', identityContext: { issuer: 'https://issuer.example', clientId: 'applicant' } };
const first = { taskId: 'urn:work-spec:task:opaque/one', expectedTaskRevision: 'revision-one' };

describe('task draft resume context', () => {
  it('preserves ordinary draft handles and unresolved signing markers across task writes and clears', () => {
    const backing = storage();
    const ordinary = createBrowserDraftResumeMetadataStore(base, backing);
    const task = createBrowserDraftResumeMetadataStore({ ...base, taskContext: first }, backing);
    for (const slot of ['draft-handles', 'response-draft-create-operations', 'response-signing-operations']) {
      ordinary.write(slot, { draftId: 'ordinary-retained' });
      task.write(slot, { draftId: 'task-retained' });
      expect(ordinary.read(slot)).toEqual({ draftId: 'ordinary-retained' });
      task.remove(slot);
      expect(ordinary.read(slot)).toEqual({ draftId: 'ordinary-retained' });
    }
  });
  it('restores only the same selected task revision', () => {
    const backing = storage();
    createBrowserDraftResumeMetadataStore({ ...base, taskContext: first }, backing).write('draft-handles', { draftId: 'task-retained' });
    expect(createBrowserDraftResumeMetadataStore({ ...base, taskContext: { ...first } }, backing).read('draft-handles')).toEqual({ draftId: 'task-retained' });
    for (const taskContext of [{ ...first, taskId: 'urn:work-spec:task:opaque/two' }, { ...first, expectedTaskRevision: 'revision-two' }]) {
      expect(createBrowserDraftResumeMetadataStore({ ...base, taskContext }, backing).read('draft-handles')).toBeUndefined();
    }
  });
  it('retains identity separation within a task context', () => {
    const backing = storage();
    createBrowserDraftResumeMetadataStore({ ...base, taskContext: first }, backing).write('draft-handles', { draftId: 'task-retained' });
    expect(createBrowserDraftResumeMetadataStore({ ...base, identityContext: { ...base.identityContext, clientId: 'another-client' }, taskContext: first }, backing).read('draft-handles')).toBeUndefined();
  });
  it('refuses missing task or revision rather than falling back to ordinary storage', () => {
    for (const taskContext of [{ ...first, taskId: '' }, { ...first, expectedTaskRevision: ' ' }]) {
      expect(() => createBrowserDraftResumeMetadataStore({ ...base, taskContext }, storage())).toThrow('exact task and revision');
    }
  });
});
