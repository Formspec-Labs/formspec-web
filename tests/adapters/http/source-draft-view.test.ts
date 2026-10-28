import { describe, expect, expectTypeOf, it } from 'vitest';
import type { components } from '../../../src/api/generated/source-public.d.ts';
import { savedSourceDraftView, type SourceDraftView } from '../../../src/adapters/http/source-draft-view.ts';
import { validateCanonicalFormResponse } from '../../../src/adapters/schema/surface-bundle-schema-validators.ts';
import { sampleFormResponse } from '../../../src/adapter-conformance/fixtures.ts';

const initialized: SourceDraftView = {
  draft_id: 'owned-draft', draft_version: 1, form_version_id: 'publication', subject_ref: 'owner',
  status: 'in_progress', draft_state: {}, canonical_response: null, is_initialization_only: true,
};

describe('generated Source draft transport and semantic saved payload', () => {
  it('retains generated required identities and nullable initialization at the transport boundary', () => {
    expectTypeOf<SourceDraftView>().toEqualTypeOf<components['schemas']['DraftView']>();
    expectTypeOf<SourceDraftView['form_version_id']>().toEqualTypeOf<string>();
    expectTypeOf<SourceDraftView['subject_ref']>().toEqualTypeOf<string>();
    expectTypeOf<SourceDraftView['status']>().toEqualTypeOf<string>();
    expect(initialized.canonical_response).toBeNull();
  });

  it('refuses to promote an initialized or malformed transport body into a saved Response', async () => {
    await expect(savedSourceDraftView(initialized, validateCanonicalFormResponse, 'not saved')).rejects.toThrow('not saved');
    await expect(savedSourceDraftView({ ...initialized, canonical_response: { invalid: true } },
      validateCanonicalFormResponse, 'not saved')).rejects.toThrow('not saved');
  });

  it('checks the Response schema and optional task metadata before producing a saved payload', async () => {
    const wire: SourceDraftView = { ...initialized, canonical_response: sampleFormResponse,
      draft_state: sampleFormResponse.data, is_initialization_only: false };
    const saved = await savedSourceDraftView(wire, validateCanonicalFormResponse, 'not saved');
    expect(saved.canonical_response).toEqual(sampleFormResponse);
    expect(saved).not.toHaveProperty('taskDraft');
    await expect(savedSourceDraftView({ ...wire, taskDraft: null }, validateCanonicalFormResponse, 'not saved'))
      .rejects.toThrow('Invalid task draft association');
  });
});
