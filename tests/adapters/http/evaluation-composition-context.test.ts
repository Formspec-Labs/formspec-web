import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import type { ScreenerRunView, ScreenerSelection, ScreenerAssociation } from '../../../src/ports/screener-retention.ts';
import type { SavedResponseDraft } from '../../../src/ports/response-signing.ts';
import type { EvaluationHydrationWire } from '../../../src/ports/evaluation-hydration.ts';
import { HttpScreenerHydration } from '../../../src/adapters/http/screener-hydration.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';

const directory = resolve(process.cwd(), 'tests/fixtures/source-composition-context-v1');
const custody = JSON.parse(readFileSync(resolve(directory, 'custody.json'), 'utf8')) as { sourceHandoffSha256: string; files: Record<string, string> };
function captured<T>(name: string): T {
  const bytes = readFileSync(resolve(directory, name));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(custody.files[name]);
  return JSON.parse(bytes.toString('utf8')) as T;
}
interface OriginalContext {
  definition: FormDefinition;
  selection: ScreenerSelection;
  selectionHash: string;
  compositionRegistrationHash: string;
  runView: ScreenerRunView;
  runViewAcceptanceOrigin: string;
  historicalRunView: ScreenerRunView;
  association: ScreenerAssociation;
  draftView: SavedResponseDraft['evidence'];
  owner: ScreenerRunView['run']['owner'];
  candidateHash: string;
  fixtureClock: string;
  hydration: EvaluationHydrationWire;
}
async function originalFixture(allSources = false) {
  const source = captured<OriginalContext>(allSources ? 'three-source-blocked-native-context.json' : 'single-native-native-context.json');
  const view = captured<EvaluationHydrationWire>(allSources ? 'valid-three-source-blocked-hydration.json' : 'valid-native-hydration.json');
  expect(source.hydration).toEqual(view);
  expect(source.runViewAcceptanceOrigin).toBe('original-create-response');
  expect(source.historicalRunView.acceptance).toBeNull();
  expect(source.fixtureClock).toBe('2026-10-09T12:00:00Z');
  const dto = source.draftView;
  // Client port setup only: copy actual DTO fields, preserving the complete signed response.
  // Source retains signing authority; this test invokes the real native hydration proof checker.
  const saved: SavedResponseDraft = { draftKey: { formUrl: source.selection.evaluationSelection.definitionUrl,
    formVersion: source.selection.evaluationSelection.definitionVersion, subjectRef: source.owner.subjectRef },
  response: dto.canonical_response, draft: { id: dto.draft_id, version: dto.draft_version, responseHash: await hash(dto.canonical_response) },
  actor: { id: source.owner.subjectRef }, evidence: dto };
  expect(saved.draft.responseHash).toBe(source.candidateHash);
  const scope = source.selection.evaluationSelection.scope;
  let returned: unknown = view;
  let elapsed = 0;
  const requests: unknown[] = [];
  const adapter = new HttpScreenerHydration({ baseUrl: 'https://source.example', definition: source.definition,
    selection: source.selection, selectionHash: source.selectionHash, compositionRegistrationHash: source.compositionRegistrationHash,
    accessToken: async () => 'test-only-token', monotonicNow: () => elapsed,
    tenantBinding: { kind: 'bound', scope: { tenant: scope.tenant_id, workspace: scope.workspace_id,
      environment: scope.environment_id, cell: scope.cell_id } },
    fetchImpl: async (_url, init) => { requests.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(returned),
      { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); } });
  const identity = source.owner.authenticated!;
  const input = { saved, run: source.runView, association: source.association,
    identity: { issuer: identity.issuer, subject: identity.subject, clientId: identity.clientId },
    signal: new AbortController().signal, assertCurrent: () => {} };
  return { source, view, input, adapter, requests, returnBody: (body: unknown) => { returned = body; },
    setElapsed: (value: number) => { elapsed = value; } };
}

describe('actual same-run Source composition native-proof replay', () => {
  it('preserves all eleven sealed Source outputs', () => {
    expect(custody.sourceHandoffSha256).toBe('e8efb099f946d31c17d120917f49e8bc16ef215f73a0a1c59432b829603fcf66');
    expect(Object.keys(custody.files)).toHaveLength(11);
    for (const name of Object.keys(custody.files)) captured(name);
  });
  it('qualifies the actual complete signed revision5 using original create acceptance', async () => {
    const f = await originalFixture();
    expect(f.input.saved.draft.version).toBe(5);
    expect(f.input.saved.response.authoredSignatures).toHaveLength(1);
    const context = await f.adapter.hydrate(f.input);
    context.assertReady();
    expect(context.view).toEqual(f.view);
    expect(f.requests).toEqual([{ draftVersion: 5, candidateHash: f.source.candidateHash }]);
    f.setElapsed(300_000);
    expect(() => context.assertCurrent()).toThrow('expired');
  });
  it('verifies the actual all3 unsigned revision4 and keeps two unavailable sources blocking', async () => {
    const f = await originalFixture(true);
    expect(f.input.saved.draft.version).toBe(4);
    expect(f.input.saved.response.authoredSignatures ?? []).toHaveLength(0);
    const context = await f.adapter.hydrate(f.input);
    expect(context.view.results.map(result => [result.instanceName, result.status])).toEqual([
      ['photo', 'unavailable'], ['screening', 'qualified'], ['taskContext', 'unavailable'],
    ]);
    expect(() => context.assertReady()).toThrow('required source unavailable');
  });
  it.each([0, 1, 2, 3, 4, 5, 6])('refuses same-run Source negative %s through the real checker', async index => {
    const f = await originalFixture();
    f.returnBody(captured(`invalid-native-hydration-${index}.json`));
    await expect(f.adapter.hydrate(f.input)).rejects.toThrow();
  });
  it('refuses the actual historical GET without renewing its null acceptance', async () => {
    const f = await originalFixture();
    f.input.run = f.source.historicalRunView;
    await expect(f.adapter.hydrate(f.input)).rejects.toThrow('local candidate binding mismatch');
    expect(f.requests).toHaveLength(0);
  });
  it.each(['association', 'owner', 'publication', 'candidate'] as const)('refuses original %s drift', async field => {
    const f = await originalFixture();
    if (field === 'association') f.input.association = { ...f.input.association, runId: `${f.input.association.runId}-foreign` };
    if (field === 'owner') f.input.saved = { ...f.input.saved, actor: { id: 'foreign' } };
    if (field === 'publication') f.input.saved = { ...f.input.saved, evidence: { ...f.input.saved.evidence, form_version_id: 'foreign' } };
    if (field === 'candidate') f.input.saved.response.data.name = 'changed';
    await expect(f.adapter.hydrate(f.input)).rejects.toThrow();
    expect(f.requests).toHaveLength(0);
  });
});
