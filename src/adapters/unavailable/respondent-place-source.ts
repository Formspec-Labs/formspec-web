import type { RespondentPlaceQuery, RespondentPlaceSource } from '../../ports/respondent-place-source.ts';

export function unavailableRespondentPlaceSource(
  message = 'Respondent place adapter is not configured for this deployment.',
): RespondentPlaceSource {
  return {
    async readPlace(_query: RespondentPlaceQuery) {
      throw new Error(message);
    },
  };
}
