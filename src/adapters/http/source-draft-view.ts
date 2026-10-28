import type { components } from '../../api/generated/source-public.d.ts';
import type { FormResponse } from '@formspec-org/types';
import type { TaskDraftAssociation } from '../../ports/task-draft.ts';
import { isRecord } from '../../shared/is-record.ts';
import { assertTaskDraftWire } from '../../shared/task-draft-wire.ts';

/** Source's generated wire shape is the transport authority, including null initialization. */
export type SourceDraftView = components['schemas']['DraftView'];
export type SavedSourceDraftView = Omit<SourceDraftView, 'canonical_response' | 'draft_state'> & {
  canonical_response: FormResponse;
  draft_state: Record<string, unknown>;
  taskDraft?: TaskDraftAssociation;
};
export type InitializedSourceDraftView = SourceDraftView & {
  canonical_response: null;
  is_initialization_only: true;
};

/** Payload qualification only. Callers must still check owner, publication and revision. */
export async function savedSourceDraftView(view: SourceDraftView,
  validateResponse: (value: unknown) => boolean | Promise<boolean>, message: string): Promise<SavedSourceDraftView> {
  const response = view?.canonical_response;
  if (!response || !schemaValidatedResponse(response, await validateResponse(response)) || !isRecord(view.draft_state)) throw new Error(message);
  const { taskDraft, ...draft } = view;
  assertTaskDraftWire(taskDraft);
  return { ...draft, canonical_response: response, draft_state: view.draft_state, ...(taskDraft === undefined ? {} : { taskDraft }) };
}

/** Narrow only after the selected maintained Response schema has checked this exact value. */
function schemaValidatedResponse(value: unknown, schemaValid: boolean): value is FormResponse {
  return isRecord(value) && schemaValid;
}
