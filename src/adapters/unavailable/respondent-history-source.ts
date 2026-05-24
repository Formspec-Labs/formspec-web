import type {
  HistoryQuery,
  RespondentHistorySource,
} from '../../ports/respondent-history-source.ts';
import { markUnavailableAdapter } from '../../policy/sentinel.ts';

export function unavailableRespondentHistorySource(
  message = 'Respondent history adapter is not configured for this deployment.',
): RespondentHistorySource {
  const adapter: RespondentHistorySource = {
    async readHistory(_query: HistoryQuery) {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'crossIssuerHistory',
    reason: message,
  });
}
