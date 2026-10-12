import { describe, expect, it } from 'vitest';
import { ownedDraftResumeSelection, ownedDraftResumeSelectionSchema } from '../../src/config/index.ts';
describe('owned draft resume deployment selection', () => {
  it('validates and snapshots two opaque bounded locators through the owning schema', () => {
    const input = { draftId: 'draft/opaque', expectedResponseId: 'response:opaque' };
    const selected = ownedDraftResumeSelection(input); input.draftId = 'changed';
    expect(selected).toEqual({ draftId: 'draft/opaque', expectedResponseId: 'response:opaque' });
    expect(Object.isFrozen(selected)).toBe(true); expect(ownedDraftResumeSelectionSchema.additionalProperties).toBe(false);
  });
  it.each([null, [], {}, { draftId: 'id' }, { draftId: 'id', expectedResponseId: '' },
    { draftId: ' id ', expectedResponseId: 'response' }, { draftId: 'x'.repeat(2049), expectedResponseId: 'response' },
    { draftId: 'id', expectedResponseId: 'response', owner: 'invented' }, { draftId: 1, expectedResponseId: 'response' }])('refuses malformed or authority-bearing selection', input => {
    expect(() => ownedDraftResumeSelection(input)).toThrow();
  });
});
