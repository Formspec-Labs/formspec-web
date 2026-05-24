import { stubRespondentHistorySource } from '../../../src/adapters/stub/respondent-history-source.ts';
import { defineRespondentHistorySourceConformance } from '../_framework/conformance.ts';

defineRespondentHistorySourceConformance('stub RespondentHistorySource conformance', () => {
  const adapter = stubRespondentHistorySource();
  return {
    adapter,
    replaceSnapshot: (snapshot) => adapter.replaceSnapshot(snapshot),
  };
});
