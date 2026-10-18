import type { FormResponse, RuntimeRequest } from '@formspec-org/types';
import type { SignedResponseSigning } from '../../src/ports/response-signing.ts';
import { RESPONSE_SCHEMA_DOCUMENT } from '../../src/adapters/schema/canonical-schemas.ts';

/** Schema-correct routing fixture only; this supplies no service or signature authority. */
export function taskCompletionFixture(input: FormResponse) {
  const response = { ...input, status: 'completed' as const,
    authoredSignatures: [RESPONSE_SCHEMA_DOCUMENT.properties.authoredSignatures.examples[0][0]] as FormResponse['authoredSignatures'] };
  const signedDraft = { draftId: 'scope-routing-draft', expectedSignedDraftVersion: 2,
    expectedSignedResponseHash: `sha256:${'a'.repeat(64)}`, associationHash: `sha256:${'b'.repeat(64)}`,
    taskBindingHash: `sha256:${'c'.repeat(64)}` };
  const signed: SignedResponseSigning = { response,
    draftKey: { formUrl: response.definitionUrl, formVersion: response.definitionVersion, subjectRef: 'scope-routing-owner' },
    draft: { id: signedDraft.draftId, version: 2, responseHash: 'a'.repeat(64) }, actor: { id: 'scope-routing-owner' },
    evidence: { draft_id: signedDraft.draftId, draft_version: 2, form_version_id: 'scope-routing-publication',
      subject_ref: 'scope-routing-owner', draft_state: response.data, canonical_response: response, status: 'in_progress',
      taskDraft: { version: 1, associationHash: signedDraft.associationHash, taskBindingHash: signedDraft.taskBindingHash, signedDraft } },
    content: { source: { ref: 'urn:test:scope-content', version: '1' }, locale: 'en', documentId: 'scope-content',
      signingIntent: 'urn:test:scope-sign', declaration: 'Declaration', affirmationText: 'Affirmation', paperAlternative: 'Paper',
      delegatedSigningNotice: 'Notice', electronicConsent: { text: 'Consent', controlLabel: 'Consent', textRef: 'urn:test:consent', version: '1' } },
    verification: { mode: 'delegated-service-key', provider: 'fixture', keyId: 'fixture' } };
  const request: RuntimeRequest = { id: 'scope-completion', adapter: 'http-json', successStatuses: [200],
    request: { method: 'POST', pathTemplate: '/api/v1/tasks/{taskId}/response',
      pathBindings: { taskId: { from: 'input', path: 'taskId' } },
      bodyDefaults: { definitionUrl: response.definitionUrl, definitionVersion: response.definitionVersion },
      bodyBindings: { '/response': { from: 'input', path: 'frozenResponse' }, '/signedDraft': { from: 'input', path: 'signedDraft' } } } };
  return { signed, request, invocationInput: {} };
}
