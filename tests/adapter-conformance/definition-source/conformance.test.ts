import type { FormDefinition } from '@formspec-org/types';
import { HttpDefinitionSource, defaultFormIdResolver } from '../../../src/adapters/http/index.ts';
import { stubDefinitionSource } from '../../../src/adapters/stub/definition-source.ts';
import { jsonResponse, problemResponse, recordingFetch } from '../../adapters/http/test-fetch.ts';
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

defineDefinitionSourceConformance('HTTP DefinitionSource conformance', () => {
  const definitions = new Map<string, FormDefinition>();
  const { fetch } = recordingFetch((request) => {
    const formId = request.url.split('/').at(-1) ?? '';
    const definition = definitions.get(decodeURIComponent(formId));
    return definition
      ? jsonResponse({ definition })
      : problemResponse(404, 'runtime definition not found');
  });
  return {
    adapter: new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    }),
    registerDefinition(definition) {
      definitions.set(defaultFormIdResolver(definition.url, definition.version), definition);
    },
  };
});
