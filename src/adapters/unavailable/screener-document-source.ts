import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type {
  ScreenerDocumentQuery,
  ScreenerDocumentSource,
} from '../../ports/screener-document-source.ts';

export function unavailableScreenerDocumentSource(
  message = 'Screener catalog adapter is not configured for this deployment.',
): ScreenerDocumentSource {
  const adapter: ScreenerDocumentSource = {
    async readScreener(_query: ScreenerDocumentQuery) {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'screener',
    reason: message,
  });
}
