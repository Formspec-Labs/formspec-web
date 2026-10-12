import Ajv2020 from 'ajv/dist/2020.js';
import { snapshotFiniteJson } from '@formspec-org/surface';
import type { OwnedDraftResumeSelection } from '../ports/draft-store.ts';
import schema from './owned-draft-resume.schema.json';
export { default as ownedDraftResumeSelectionSchema } from './owned-draft-resume.schema.json';
const validate = new Ajv2020({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile<OwnedDraftResumeSelection>(schema);
/** External deployment selects opaque locators; current Source authorization supplies ownership. */
export function ownedDraftResumeSelection(input: unknown): Readonly<OwnedDraftResumeSelection> {
  const selected = snapshotFiniteJson(input);
  if (!validate(selected)) throw new Error('Owned draft resume selection is invalid');
  return Object.freeze({ draftId: selected.draftId, expectedResponseId: selected.expectedResponseId });
}
