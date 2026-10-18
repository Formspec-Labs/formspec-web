import { describe, expect, it } from 'vitest';
import type { SigningContent } from '@formspec-org/types';
import type { EvaluationHydrationWire, NativeScreenerMappingReceipt } from '../../../src/ports/evaluation-hydration.ts';
import { HttpScreenerHydration } from '../../../src/adapters/http/screener-hydration.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import { hydrationFixture } from './screener-hydration-fixture.ts';
import { delegatedSignedResponseFixture } from './delegated-signed-response-fixture.ts';
import { recordingFetch } from './test-fetch.ts';

const content: SigningContent = {
  source: { ref: 'urn:test:form#/extensions/x-formspec-signing-content/entries/en', version: '1' },
  locale: 'en', documentId: 'declaration', signingIntent: 'urn:test:intent', declaration: 'These are my answers.',
  paperAlternative: 'Request a paper form.', affirmationText: 'I affirm these answers.', delegatedSigningNotice: 'The service signs with its key.',
  electronicConsent: { textRef: 'urn:test:consent', version: '1', text: 'I agree.', controlLabel: 'I agree' },
};
async function signedFixture(options: Parameters<typeof hydrationFixture>[0] = {}) {
  const f = await hydrationFixture(options);
  const response = await delegatedSignedResponseFixture({ response: { ...f.input.saved.response, id: 'signed-response' }, content,
    actor: f.input.saved.actor.id, draftId: f.input.saved.draft.id, candidateVersion: 2, issuer: 'https://source.example.test/tenant/workspace/production', keyId: 'fixture-key' });
  const { authoredSignatures: _signatures, ...unsignedCandidate } = response;
  const unsignedHash = await hash(unsignedCandidate);
  Object.assign(f.input.saved, { response }); Object.assign(f.input.saved.evidence, { canonical_response: response });
  const candidateHash = await hash(response);
  Object.assign(f.input.association, { candidateHash });
  Object.assign(f.view, { candidateHash });
  const { scope, owner, selection, formVersionHash, draftId, draftVersion, sources } = f.view;
  const requestHash = await hash({ operation: 'hydrate', scope, owner, selection, formVersionHash, draftId, draftVersion, candidateHash, sources });
  Object.assign(f.view, { requestHash }); Object.assign(f.receipt, { requestHash });
  const { receiptHash: _omit, ...preimage } = f.receipt;
  Object.assign(f.receipt, { receiptHash: await hash(preimage) });
  return { ...f, unsignedHash };
}

describe('exact signed candidate HTTP facts', () => {
  it('requests the complete signed current candidate after its fresh signed revision association', async () => {
    const f = await signedFixture(); const before = structuredClone(f.input.saved);
    const facts = await new HttpScreenerHydration(f.config).hydrate(f.input);
    facts.assertReady();
    expect(f.requests[0].body).toEqual({ draftVersion: 3, candidateHash: await hash(before.response) });
    expect((f.requests[0].body as { candidateHash: string }).candidateHash).not.toBe(f.unsignedHash);
    expect(f.requests[0].headers.get('authorization')).toBe('Bearer owner-token');
    expect(f.input.saved).toEqual(before); expect(f.input.saved.response.authoredSignatures).toHaveLength(1);
  });

  it.each(['unsigned-association', 'changed-signature'] as const)('rejects %s against existing signed bindings before credentials', async mode => {
    const f = await signedFixture();
    if (mode === 'unsigned-association') Object.assign(f.input.association, { candidateHash: f.unsignedHash });
    else Object.assign(f.input.saved.response.authoredSignatures![0], { signatureValue: 'dGFtcGVyZWQ=' });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('local digest');
    expect(f.accessToken).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
  });

  it.each(['unsigned-hash', 'draft', 'revision', 'owner', 'prior-association'] as const)('rejects returned signed facts with changed %s', async mode => {
    let unsignedHash = '';
    const f = await signedFixture({ mutate: (view: EvaluationHydrationWire) => {
      if (mode === 'unsigned-hash') Object.assign(view, { candidateHash: unsignedHash });
      if (mode === 'draft') Object.assign(view, { draftId: 'foreign-draft' });
      if (mode === 'revision') Object.assign(view, { draftVersion: 2 });
      if (mode === 'owner') Object.assign(view.owner, { subjectRef: 'foreign-owner' });
      if (mode === 'prior-association') Object.assign((view.providerReceipt as NativeScreenerMappingReceipt).proof.association, { draftVersion: 2 });
    } }); unsignedHash = f.unsignedHash;
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow();
    expect(f.requests).toHaveLength(1);
  });

  it('keeps every selected source required for the signed response', async () => {
    const f = await signedFixture({ extraSource: true });
    const facts = await new HttpScreenerHydration(f.config).hydrate(f.input);
    expect(() => facts.assertReady()).toThrow('required source unavailable');
    expect(facts.view.results[1].status).toBe('unavailable');
  });

  it('preserves a consistently bound signed candidate when Source refuses signature or current-revision verification', async () => {
    const f = await signedFixture(); const before = structuredClone(f.input.saved);
    const transport = recordingFetch(() => new Response(JSON.stringify({ error_code: 'FORMSPEC-4090', detail: 'signed candidate verification refused' }),
      { status: 409, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }));
    await expect(new HttpScreenerHydration({ ...f.config, fetchImpl: transport.fetch }).hydrate(f.input)).rejects.toThrow();
    expect(transport.requests).toHaveLength(1); expect(f.input.saved).toEqual(before);
  });
});
