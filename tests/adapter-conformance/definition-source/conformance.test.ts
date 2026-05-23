import { stubDefinitionSource } from '../../../src/adapters/stub/definition-source.ts';
import { defineDefinitionSourceConformance } from '../_framework/conformance.ts';

defineDefinitionSourceConformance('stub DefinitionSource conformance', () => {
  const adapter = stubDefinitionSource();
  return {
    adapter,
    registerDefinition(definition) {
      adapter.registerDefinition(definition.url, definition, definition.version);
    },
  };
});
