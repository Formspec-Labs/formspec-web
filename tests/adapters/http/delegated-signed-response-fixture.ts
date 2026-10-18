import { createHash } from 'node:crypto';
import { canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import { detachedSignatureProtectedHeader, encodeCoseSign1 } from '@formspec-org/integrity-cose';
import { hashSigningContent } from '@formspec-org/engine/render';
import type { FormResponse, SigningContent } from '@formspec-org/types';
import { loadCanonicalSigningContentValidator } from '../../../src/adapters/schema/index.ts';

/** Schema/mirror-correct service double; its zero signature bytes make no cryptographic-verification claim. */
export async function delegatedSignedResponseFixture(input: {
  response: FormResponse; content: SigningContent; actor: string; draftId: string; candidateVersion: number; keyId: string; issuer: string;
}): Promise<FormResponse> {
  const signedAt = '2026-10-07T12:00:00Z';
  const documentHash = await hashSigningContent(input.content, await loadCanonicalSigningContentValidator());
  const candidate: FormResponse = { ...structuredClone(input.response), extensions: {
    ...input.response.extensions, 'x-formspec-signing-content': { version: '1.0', issuer: input.issuer, content: input.content, documentHash,
      documentHashAlgorithm: 'sha-256', actorRef: input.actor, draftId: input.draftId, draftVersion: input.candidateVersion,
      signerName: 'Fixture signer', signedAt, consentAccepted: true },
  } };
  const bytes = encodeCoseSign1(detachedSignatureProtectedHeader(-8, new TextEncoder().encode(input.keyId),
    'urn:formspec:sig-method:ed25519-cose-sign1@1'), null, new Uint8Array(64));
  const signatureValue = btoa(String.fromCharCode(...bytes));
  return { ...candidate, authoredSignatures: [{ signatureId: 'fixture-signature', ceremonyId: 'fixture-ceremony',
    signatureProvider: 'urn:formspec:provider:delegated-response@1', documentId: input.content.documentId, signingIntent: input.content.signingIntent,
    signatureValue, signerId: input.actor, signerName: 'Fixture signer', consentAccepted: true,
    consentTextRef: input.content.electronicConsent.textRef, consentVersion: input.content.electronicConsent.version,
    affirmationText: input.content.affirmationText, documentHash, documentHashAlgorithm: 'sha-256', signedPayload: {
      canonicalization: 'formspec-response-signing-v1', digestAlgorithm: 'sha-256',
      digest: createHash('sha256').update(canonicalResponseSignedPayloadBytes(candidate)).digest('hex'),
      responseId: candidate.id!, definitionUrl: candidate.definitionUrl, definitionVersion: candidate.definitionVersion,
      signedAt, signingIntent: input.content.signingIntent,
    } }] };
}
