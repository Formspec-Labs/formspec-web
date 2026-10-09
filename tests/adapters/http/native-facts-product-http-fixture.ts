import type { FormDefinition, ScreenerDocument } from '@formspec-org/types';
import { HttpScreenerRetention } from '../../../src/adapters/http/screener-retention.ts';
import { HttpScreenerHydration } from '../../../src/adapters/http/screener-hydration.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import type { ScreenerAssociation, ScreenerRunView } from '../../../src/ports/screener-retention.ts';
import { hydrationFixture } from './screener-hydration-fixture.ts';
import { recordingFetch } from './test-fetch.ts';

/** Recording HTTP service double. It proves consumer binding, not Source cryptography or live execution. */
export async function nativeFactsProductHttpFixture(input: {
  definition: FormDefinition; screener: ScreenerDocument; unavailable?: boolean; refuseSigned?: boolean;
  attachmentReferences: () => readonly unknown[];
}) {
  const seed = await hydrationFixture();
  const selection = structuredClone(seed.config.selection);
  const owner = structuredClone(seed.input.run.run.owner);
  Object.assign(owner, { subjectRef: 'server-actor' }); Object.assign(owner.authenticated, { subjectRef: 'server-actor' });
  const requiredSources = ['screening', ...(input.unavailable ? ['other'] : [])];
  Object.assign(selection.evaluationSelection, { formId: 'form', formVersionId: 'publication', definitionUrl: input.definition.url!,
    definitionVersion: input.definition.version, definitionHash: await hash(input.definition), requiredSources });
  Object.assign(selection, { screenerUrl: input.screener.url!, screenerVersion: input.screener.version,
    screenerHash: await hash(input.screener), allowedTargets: ['surface:intake'] });
  const descriptor = structuredClone(seed.receipt.registration.publicDescriptor);
  const rules = [{ sourcePath: 'target', targetPath: 'eligible', transform: 'valueMap', valueMap: { forward: { 'surface:intake': false }, unmapped: 'error' } },
    { sourcePath: 'evidenceRef', targetPath: 'evidenceRef', transform: 'preserve' }];
  Object.assign(descriptor, { selection: selection.evaluationSelection, rules, rulesHash: await hash(rules) });
  const { screenerSelectionHash: _old, ...authority } = descriptor;
  Object.assign(selection, { instanceMappingHash: await hash({ ...authority, purpose: 'formspec.screener.instance.mapping-policy' }) });
  const selectionHash = await hash(selection); Object.assign(descriptor, { screenerSelectionHash: selectionHash });
  const at = seed.view.qualifiedAt; const expires = seed.receipt.proof.expiresAt;
  let run: ScreenerRunView['run'] | undefined;
  const associations = new Map<string, ScreenerAssociation>();
  let signedVersion: number | undefined;
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
  const transport = recordingFetch(async request => {
    const path = new URL(request.url).pathname;
    if (path.endsWith('/screener-runs')) {
      const body = request.body as { selectionHash: string; answers: ScreenerRunView['run']['answers'] };
      if (body.selectionHash !== selectionHash) throw new Error('fixture selection differs');
      const determination = { $formspecDetermination: '1.0', screener: { url: input.screener.url!, version: input.screener.version },
        timestamp: at, evaluationVersion: '1.0.0', status: 'completed', overrides: { matched: [], halted: false }, phases: [],
        inputs: body.answers, validity: { validUntil: expires } };
      const original = { ...seed.input.run.run, owner, selectionHash, answers: body.answers, answersHash: await hash(body.answers),
        determination, determinationHash: await hash(determination), qualification: { status: 'ready' as const, target: 'surface:intake' } };
      const { evidenceHash: _remove, ...preimage } = original;
      run = { ...original, evidenceHash: await hash(preimage) };
      return response({ version: 1, purpose: 'formspec.screener.run', selection, run,
        acceptance: { checkedAt: at, qualification: { status: 'ready', target: 'surface:intake' } } });
    }
    if (!run) throw new Error('fixture retained run missing');
    const body = request.body as { draftVersion: number; candidateHash: string; selectionHash?: string; runId?: string; runRevision?: number };
    const draftId = decodeURIComponent(path.split('/')[2]);
    if (path.endsWith('/screener-associations')) {
      if (body.selectionHash !== selectionHash || body.runId !== run.runId || body.runRevision !== run.revision) throw new Error('fixture run binding differs');
      const association = { ...seed.input.association, owner, draftId, draftVersion: body.draftVersion,
        candidateHash: body.candidateHash, selectionHash, evidenceHash: run.evidenceHash };
      associations.set(`${body.draftVersion}:${body.candidateHash}`, association);
      return response(association);
    }
    if (!path.endsWith('/evaluation-instances')) throw new Error(`Unexpected fixture request ${path}`);
    if (input.refuseSigned && body.draftVersion === signedVersion) return response({ error_code: 'FORMSPEC-4090', detail: 'signed candidate verification refused' }, 409);
    const association = associations.get(`${body.draftVersion}:${body.candidateHash}`);
    if (!association) throw new Error('fixture fresh association missing');
    const sources = { facts: 'screening', ...(input.unavailable ? { other: 'other' } : {}) };
    const bound = { operation: 'hydrate' as const, scope: selection.evaluationSelection.scope, owner,
      selection: selection.evaluationSelection, formVersionHash: selection.formVersionHash, draftId,
      draftVersion: body.draftVersion, candidateHash: body.candidateHash, sources };
    const requestHash = await hash(bound); const data = { eligible: false, evidenceRef: run.evidenceRef };
    const receipt = { ...structuredClone(seed.receipt), requestHash,
      registration: { ...seed.receipt.registration, publicDescriptor: descriptor, registrationHash: await hash(descriptor) },
      proof: { ...seed.receipt.proof, association, evidenceHash: run.evidenceHash, dataHash: await hash(data) } };
    const { receiptHash: _remove, ...preimage } = receipt; receipt.receiptHash = await hash(preimage);
    return response({ version: 1, purpose: 'formspec.instance.hydrate', ...bound, requestHash, qualifiedAt: at,
      attachmentBindings: input.attachmentReferences(), providerReceipt: receipt,
      results: [{ ...seed.view.results[0], data, dataHash: await hash(data) }, ...(input.unavailable ? [{ status: 'unavailable', instanceName: 'other', sourceRef: 'other', reason: 'not-qualified' }] : [])] });
  });
  const config = { ...seed.config, selection, selectionHash, definition: input.definition, fetchImpl: transport.fetch };
  return { retention: new HttpScreenerRetention(config), hydration: new HttpScreenerHydration(config),
    context: () => seed.input, requests: transport.requests, markSigned: (version: number) => { signedVersion = version; } };
}
