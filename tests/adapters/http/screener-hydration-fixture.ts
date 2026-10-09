import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import type { ScreenerRunView, ScreenerSelection, ScreenerAssociation } from '../../../src/ports/screener-retention.ts';
import type { SavedResponseDraft } from '../../../src/ports/response-signing.ts';
import type { EvaluationHydrationWire, NativeScreenerMappingReceipt } from '../../../src/ports/evaluation-hydration.ts';
import type { FormDefinition } from '@formspec-org/types';
import { recordingFetch } from './test-fetch.ts';

export async function hydrationFixture(options: { extraSource?: boolean; outputSchemaHash?: string; data?: Record<string, unknown>; mutate?: (view: EvaluationHydrationWire) => void | Promise<void> } = {}) {
  const digest = `sha256:${'a'.repeat(64)}`;
  const at = '2026-10-09T12:00:00Z';
  const expires = '2026-10-09T12:01:00Z';
  const scope = { tenant_id: 'tenant', workspace_id: 'workspace', environment_id: 'environment', cell_id: 'cell' };
  const owner = { sessionId: 'session', subjectRef: 'source-subject', authenticated: { issuer: 'https://issuer.example', subject: 'oidc',
    clientId: 'client', principalId: 'principal', profile: 'profile', actorRef: 'separate-actor', subjectRef: 'source-subject', sessionId: 'session' } };
  const definition: FormDefinition = { $formspec: '1.0', url: 'urn:test:form', version: '1.0.0', title: 'Hydration', items: [{ type: 'field', key: 'flag', label: 'Flag', dataType: 'boolean' }],
    instances: { facts: { source: 'screening', readonly: true }, ...(options.extraSource ? { photo: { source: 'photo', readonly: true } } : {}) } };
  const evaluationSelection = { scope, formId: 'form/id', formVersionId: 'version', definitionUrl: definition.url!,
    definitionVersion: definition.version, definitionHash: await hash(definition), requiredSources: ['screening', ...(options.extraSource ? ['photo'] : [])] };
  const rules = [{ sourcePath: 'target', targetPath: 'eligible', transform: 'valueMap', valueMap: { forward: { 'urn:test:target': false }, unmapped: 'error' } },
    { sourcePath: 'evidenceRef', targetPath: 'evidenceRef', transform: 'preserve' }];
  const document = '{"type":"object","properties":{"eligible":{"type":"boolean"},"evidenceRef":{"type":"string"}},"required":["eligible","evidenceRef"],"additionalProperties":false}';
  const descriptor = { version: 1, resolver: 'nativeScreenerMapping', providerId: 'provider', providerVersion: '1', selection: evaluationSelection,
    formVersionHash: digest, screenerSelectionHash: digest, instanceName: 'facts', sourceRef: 'screening', rules, rulesHash: await hash(rules),
    outputSchema: { url: 'urn:test:output', version: '1', document, hash: options.outputSchemaHash ?? `sha256:${createHash('sha256').update(document).digest('hex')}` },
    budgets: { maxEvidenceAgeSeconds: 60, maxValiditySeconds: 60 } };
  const { screenerSelectionHash: _omit, ...authority } = descriptor;
  const selection: ScreenerSelection = { evaluationSelection, formVersionHash: digest, sourceRef: 'screening', screenerUrl: 'urn:test:screener', screenerVersion: '1',
    screenerRawHash: digest, screenerHash: digest, allowedTargets: ['urn:test:target'], qualificationProfile: 'flat-first-match-v1',
    instanceMappingHash: await hash({ ...authority, purpose: 'formspec.screener.instance.mapping-policy' }) };
  const selectionHash = await hash(selection);
  descriptor.screenerSelectionHash = selectionHash;
  const answers = { flag: { state: 'answered' as const, value: false } };
  const determination = { timestamp: at, validity: { validUntil: expires } };
  const runWithoutHash = { version: 1 as const, scope, owner, runId: 'run', revision: 1, selectionHash, answers, answersHash: await hash(answers), evaluatedAt: at,
    determination, determinationHash: await hash(determination), qualification: { status: 'ready' as const, target: 'urn:test:target' }, evidenceRef: 'urn:formspec:source:screener:run:revision:1' };
  const run: ScreenerRunView = { version: 1, purpose: 'formspec.screener.run', selection,
    run: { ...runWithoutHash, evidenceHash: await hash(runWithoutHash) }, acceptance: { checkedAt: at, qualification: { status: 'ready', target: 'urn:test:target' } } };
  const response = { $formspecResponse: '1.0', definitionUrl: definition.url!, definitionVersion: definition.version,
    status: 'in-progress', data: options.data ?? { flag: false } };
  const saved = { draftKey: { formUrl: definition.url!, formVersion: definition.version, subjectRef: owner.subjectRef },
    response, draft: { id: 'draft/id', version: 3, responseHash: digest }, actor: { id: owner.subjectRef }, evidence: {
      draft_id: 'draft/id', draft_version: 3, form_version_id: 'version', subject_ref: owner.subjectRef, canonical_response: response, status: 'in_progress', draft_state: structuredClone(response.data),
    } } as SavedResponseDraft;
  const association: ScreenerAssociation = { scope, owner, draftId: saved.draft.id, draftVersion: saved.draft.version, candidateHash: await hash(saved.response),
    selectionHash, runId: 'run', runRevision: 1, evidenceHash: run.run.evidenceHash, associatedAt: at };
  const sources = { facts: 'screening', ...(options.extraSource ? { photo: 'photo' } : {}) };
  const request = { operation: 'hydrate' as const, scope, owner, selection: evaluationSelection, formVersionHash: digest,
    draftId: saved.draft.id, draftVersion: saved.draft.version, candidateHash: association.candidateHash, sources };
  const requestHash = await hash(request);
  const data = { eligible: false, evidenceRef: run.run.evidenceRef };
  const receipt: NativeScreenerMappingReceipt = { kind: 'nativeScreenerMapping', version: 1, purpose: 'formspec.instance.native-screener.map', registration: {
    providerId: descriptor.providerId, providerVersion: descriptor.providerVersion, registrationHash: await hash(descriptor), publicDescriptor: descriptor,
    outputSchemaHash: descriptor.outputSchema.hash, ...descriptor.budgets }, requestHash, resolvedAt: at,
    proof: { association, evidenceRef: run.run.evidenceRef, evidenceHash: run.run.evidenceHash, issuedAt: at, expiresAt: expires,
      instanceName: 'facts', sourceRef: 'screening', dataHash: await hash(data) }, receiptHash: digest };
  const { receiptHash: _remove, ...preimage } = receipt;
  Object.assign(receipt, { receiptHash: await hash(preimage) });
  const view: EvaluationHydrationWire = { version: 1, purpose: 'formspec.instance.hydrate', ...request, requestHash,
    attachmentBindings: [], qualifiedAt: at, results: [{ status: 'qualified', instanceName: 'facts', sourceRef: 'screening', data, dataHash: await hash(data),
      evidenceRef: run.run.evidenceRef, issuedAt: at, expiresAt: expires }, ...(options.extraSource ? [{ status: 'unavailable' as const, instanceName: 'photo', sourceRef: 'photo', reason: 'not-qualified' }] : [])], providerReceipt: receipt };
  let elapsed = 0;
  const context = { identity: { issuer: owner.authenticated.issuer, subject: owner.authenticated.subject, clientId: owner.authenticated.clientId }, signal: new AbortController().signal, assertCurrent: vi.fn() };
  const accessToken = vi.fn(async () => 'owner-token');
  const { fetch, requests } = recordingFetch(async () => {
    const returned = structuredClone(view);
    await options.mutate?.(returned);
    return new Response(JSON.stringify(returned), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  });
  const config = { baseUrl: 'https://source.example', selection, selectionHash, definition, accessToken, fetchImpl: fetch,
    monotonicNow: () => elapsed, tenantBinding: { kind: 'bound' as const, scope: { tenant: 'tenant', workspace: 'workspace', environment: 'environment', cell: 'cell' } } };
  return { config, input: { ...context, saved, run, association }, view, receipt, requests, accessToken, setElapsed: (value: number) => { elapsed = value; } };
}
