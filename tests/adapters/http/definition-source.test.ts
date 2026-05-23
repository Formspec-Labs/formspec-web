import { describe, expect, it } from 'vitest';
import { HttpDefinitionSource } from '../../../src/adapters/http/definition-source.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';
import { jsonResponse, problemResponse, recordingFetch } from './test-fetch.ts';

describe('HttpDefinitionSource', () => {
  it('mirrors formspec-server GET /runtime/forms/{form_id}', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({ definition: sampleFormDefinition }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition(sampleFormDefinition.url)).resolves.toEqual(
      sampleFormDefinition,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      'https://formspec-server.example.test/runtime/forms/conformance',
    );
  });

  it('rejects missing runtime definitions', async () => {
    const { fetch } = recordingFetch(() => problemResponse(404, 'not_found'));
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition('https://formspec.example.test/forms/missing')).rejects
      .toThrow();
  });
});
