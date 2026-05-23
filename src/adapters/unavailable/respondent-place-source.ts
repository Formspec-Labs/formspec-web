import type {
  RespondentPlaceQuery,
  RespondentPlaceSource,
} from '../../ports/respondent-place-source.ts';
import { markUnavailableAdapter } from '../../policy/sentinel.ts';

export function unavailableRespondentPlaceSource(
  message = 'Respondent place adapter is not configured for this deployment.',
): RespondentPlaceSource {
  const adapter: RespondentPlaceSource = {
    async readPlace(_query: RespondentPlaceQuery) {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'respondentPlace',
    reason: message,
  });
}
