import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalResponseHandoffBytes } from '@formspec-org/integrity-canonical';
import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
import { sampleFormDefinition, sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';
import { RESPONSE_SCHEMA_DOCUMENT } from '../../src/adapters/schema/canonical-schemas.ts';
import { prepareStaticTaskPresentation } from '../../src/shared/static-task-presentation.ts';

const sha = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const definition = structuredClone(sampleFormDefinition);
  const locale: LocaleDocument = { $formspecLocale: '2.1', url: 'urn:test:task-locale', version: '1',
    target: { kind: 'definition', url: definition.url, compatibleVersions: definition.version }, locale: 'en', strings: {} };
  const signature = RESPONSE_SCHEMA_DOCUMENT.properties.authoredSignatures.examples[0][0];
  const response: FormResponse = { ...structuredClone(sampleFormResponse), id: 'retained-task-response',
    displayedLocale: { locale: 'en', url: locale.url!, version: locale.version },
    authoredSignatures: [{ ...structuredClone(signature), signedPayload: { ...signature.signedPayload,
      responseId: 'retained-task-response', definitionUrl: definition.url, definitionVersion: definition.version } }] as FormResponse['authoredSignatures'] };
  const artifact = (kind: string, value: FormDefinition | LocaleDocument) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return { kind, reference: value.url, authoredVersion: value.version, rawHash: sha(bytes), bytes: [...bytes] };
  };
  const retainedSign = { recordRef: 'urn:formspec:task-draft-sign:sha256:' + 'b'.repeat(64), recordHash: 'sha256:' + 'b'.repeat(64),
    signedResponseHash: sha(canonicalResponseHandoffBytes(response)), signedCanonicalResponse: structuredClone(response),
    association: { formVersionHash: 'sha256:' + 'c'.repeat(64) } };
  const retainedPresentation = { version: 1, formVersionHash: retainedSign.association.formVersionHash,
    selectedLocale: response.displayedLocale as FormResponse['displayedLocale'] | null, artifacts: [artifact('definition', definition), artifact('locale', locale)] };
  return { definition, response, retainedSign, retainedPresentation, signal: new AbortController().signal,
    assertCurrent: vi.fn(), qualifyCurrent: vi.fn(async () => {}) };
}

describe('retained static task presentation', () => {
  it('keeps actual Sign identity and static field metadata without creating a handoff', async () => {
    const input = fixture(); const result = await prepareStaticTaskPresentation(input);
    expect(result.taskSign).toEqual({ recordRef: input.retainedSign.recordRef, recordHash: input.retainedSign.recordHash });
    expect(result).not.toHaveProperty('handoffId');
    expect(result.fields).not.toEqual({});
    expect(result.responseHash).toBe(input.retainedSign.signedResponseHash.slice(7));
    expect(input.qualifyCurrent).toHaveBeenCalledTimes(2);
  });
  it.each(['response', 'responseHash', 'publication', 'rawBytes', 'locale', 'duplicate', 'recordRef'] as const)('refuses changed retained association: %s', async change => {
    const input = fixture();
    if (change === 'response') input.retainedSign.signedCanonicalResponse.data = {};
    if (change === 'responseHash') input.retainedSign.signedResponseHash = 'sha256:' + 'd'.repeat(64);
    if (change === 'publication') input.retainedPresentation.formVersionHash = 'sha256:' + 'd'.repeat(64);
    if (change === 'rawBytes') input.retainedPresentation.artifacts[0].bytes[0] = 0;
    if (change === 'locale') input.retainedPresentation.selectedLocale = { ...input.response.displayedLocale!, locale: 'es' };
    if (change === 'duplicate') input.retainedPresentation.artifacts.push(input.retainedPresentation.artifacts[0]);
    if (change === 'recordRef') input.retainedSign.recordRef = 'urn:formspec:task-draft-sign:sha256:' + 'a'.repeat(64);
    await expect(prepareStaticTaskPresentation(input)).rejects.toThrow();
  });
  it('refuses a retired case after metadata preparation', async () => {
    const input = fixture(); input.qualifyCurrent.mockImplementationOnce(async () => {}).mockImplementationOnce(async () => { throw new Error('Case retired'); });
    await expect(prepareStaticTaskPresentation(input)).rejects.toThrow('Case retired');
  });
  it('refuses absent recorded Locale instead of inventing a display language', async () => {
    const input = fixture(); delete input.response.displayedLocale;
    input.retainedSign.signedCanonicalResponse = structuredClone(input.response);
    input.retainedSign.signedResponseHash = sha(canonicalResponseHandoffBytes(input.response));
    input.retainedPresentation.selectedLocale = null;
    input.retainedPresentation.artifacts = input.retainedPresentation.artifacts.filter(artifact => artifact.kind === 'definition');
    await expect(prepareStaticTaskPresentation(input)).rejects.toThrow('Recorded task Locale required');
    expect(input.qualifyCurrent).not.toHaveBeenCalled();
  });
  it('preserves the maintained dynamic wording refusal', async () => {
    const input = fixture(); input.definition.items[0].label = '{{ today }}';
    const bytes = new TextEncoder().encode(JSON.stringify(input.definition));
    input.retainedPresentation.artifacts[0] = { ...input.retainedPresentation.artifacts[0], bytes: [...bytes], rawHash: sha(bytes) };
    await expect(prepareStaticTaskPresentation(input)).rejects.toThrow('interpolation-unproven');
  });
});
