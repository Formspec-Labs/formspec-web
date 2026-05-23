import { stubRespondentPlaceSource } from '../../../src/adapters/stub/respondent-place-source.ts';
import { defineRespondentPlaceSourceConformance } from '../_framework/conformance.ts';

defineRespondentPlaceSourceConformance('stub RespondentPlaceSource conformance', () => {
  const adapter = stubRespondentPlaceSource();
  return {
    adapter,
    replaceSnapshot(snapshot) {
      adapter.replaceSnapshot(snapshot);
    },
  };
});
