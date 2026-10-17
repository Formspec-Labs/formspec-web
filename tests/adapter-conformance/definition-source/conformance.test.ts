import { createHash, webcrypto } from 'node:crypto';
import { afterEach, vi } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import { HttpDefinitionSource, defaultFormIdResolver } from '../../../src/adapters/http/index.ts';
import { PinnedPackageDefinitionSource } from '../../../src/adapters/package/pinned-package-definition-source.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';
import { stubDefinitionSource } from '../../../src/adapters/stub/definition-source.ts';
import { jsonResponse, problemResponse, recordingFetch } from '../../adapters/http/test-fetch.ts';
import { defineDefinitionSourceConformance } from '../_framework/conformance.ts';

afterEach(() => vi.unstubAllGlobals());

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


defineDefinitionSourceConformance('pinned package DefinitionSource conformance', () => {
  let definition = structuredClone(sampleFormDefinition);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', (url: URL) => {
    const bytes = JSON.stringify(definition);
    if (url.pathname === '/conformance/package.json') {
      return Promise.resolve(jsonResponse({ files: { definition: {
        path: 'definition.json', sha256: createHash('sha256').update(bytes).digest('hex'),
      } } }));
    }
    return Promise.resolve(url.pathname === '/conformance/definition.json'
      ? new Response(bytes) : problemResponse(404, 'package file not found'));
  });
  return {
    adapter: new PinnedPackageDefinitionSource('/conformance/package.json'),
    registerDefinition(candidate) { definition = structuredClone(candidate); },
  };
});
