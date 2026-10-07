import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';
import { SIGNING_CEREMONY_WIDGET_SHAPE, RESPONSE_REVIEW_WIDGET_SHAPE } from '@formspec-org/surface-react';
import type { FormResponse, LocaleDocument } from '@formspec-org/types';
import * as nativeHostModule from '../../src/shared/native-package-signing-host.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { resolveActiveConfig } from '../../src/config/runtime.ts';
import { nativePackageSigningConfig } from '../../src/config/native-package-signing.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import { computeJcsSha256Digest } from '../../src/adapters/http/response-action-ledger.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';

const nativeBytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/native-signing-r5/native-bundle.json'), 'utf8');
const componentBytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/native-signing-r5/passport-renewal.component.json'), 'utf8');
const initialDefinitionUrl = 'https://server.example.test/runtime/forms/actual-form';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fixture() {
  vi.stubGlobal('crypto', webcrypto);
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } });
  const bundle = JSON.parse(nativeBytes) as BundleExport;
  const resolved = dereferenceBundleExport(bundle);
  const definition = [...resolved.definitions.values()][0];
  const component = JSON.parse(componentBytes);
  const locales = Object.values(bundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document) as LocaleDocument[];
  const document = resolved.responseActions[0];
  const ceremony = resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => route.slots ?? []))
    .find(slot => slot.slotType === 'module-widget' && (slot.binding as Record<string, unknown>).widgetName === 'SigningCeremony')!;
  const review = resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => route.slots ?? []))
    .find(slot => slot.slotType === 'module-widget' && (slot.binding as Record<string, unknown>).widgetName === 'ResponseReview')!;
  const ceremonyBindings = (ceremony.binding as { dataBindings: Record<string, object> }).dataBindings;
  const reviewBindings = (review.binding as { dataBindings: Record<string, object> }).dataBindings;
  const bindings = Object.fromEntries([...new Set([...SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs, ...RESPONSE_REVIEW_WIDGET_SHAPE.dataInputs].map(input => input.name))]
    .map(name => { const selected = (ceremonyBindings[name] ?? reviewBindings[name]) as { catalogRef: string; sourceRef: string };
      return [name, { catalogRef: selected.catalogRef, sourceRef: selected.sourceRef }]; }));
  const signing = nativePackageSigningConfig({ keyId: 'fixture-key', definition: { url: definition.url, version: definition.version },
    bundle: { id: bundle.manifest.id, version: bundle.manifest.version }, module: bundle.manifest.modules![0], initialLocale: 'en',
    roles: Object.fromEntries(Object.entries({ saveInitial: 'save-draft-initial', saveOwned: 'save-draft-owned', prepare: 'prepare', sign: 'sign', submit: 'submit', paper: 'paper' })
      .map(([role, actionRef]) => [role, { artifactRef: bundle.manifest.responseActionDocuments![0].url, actionRef }])), bindings,
    readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' } });
  const config = resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'https://server.example.test', nativePackageSigning: signing,
    attachmentMaxUploadBytes: 1024 * 1024, tenantBinding: { kind: 'bound', scope: { tenant: 'fixture', workspace: 'fixture', environment: 'test', cell: 'fixture' } } });
  const texts: Record<string, string> = { 'native.json': nativeBytes, 'component.json': componentBytes,
    'definition.json': JSON.stringify(definition), ...Object.fromEntries(locales.map((locale, index) => [`locale-${index}.json`, JSON.stringify(locale)])) };
  // Package pins cover raw bytes, not the independent canonical publication digest.
  const rawPin = async (path: string) => ({ path, sha256: [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(texts[path])))].map(byte => byte.toString(16).padStart(2, '0')).join('') });
  const files = { definition: await rawPin('definition.json'), locales: await Promise.all(locales.map((_, index) => rawPin(`locale-${index}.json`))),
    nativeBundle: await rawPin('native.json'), component: { ...await rawPin('component.json'), ref: (JSON.parse(nativeBytes).manifest.components)[0] } };
  const publication = { form_id: 'actual-form', form_version_id: 'actual-publication', definition_url: definition.url,
    definition_version: definition.version, definition_hash: await computeJcsSha256Digest(definition), definition: structuredClone(definition) };
  const requests: { url: string; method: string; body?: unknown }[] = [];
  let saved: FormResponse | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url: url.href, method, body });
    if (url.origin !== 'https://server.example.test') {
      const name = url.pathname.split('/').at(-1)!;
      return new Response(name === 'package.json' ? JSON.stringify({ files }) : texts[name]);
    }
    if (url.pathname.endsWith('/sessions/anonymous')) return Response.json({ session_id: 'fixture-session', session_token: 'fixture-token',
      subject_ref: 'anon:fixture', form_id: 'actual-form', expires_at: '2099-01-01T00:00:00Z' });
    if (url.pathname === '/runtime/forms/actual-form' && method === 'GET') return Response.json(publication);
    if (url.pathname === '/runtime/forms/actual-form/drafts' && method === 'POST') saved = structuredClone(body.canonical_response);
    if (url.pathname === '/drafts/fixture-draft' || (url.pathname.endsWith('/drafts') && method === 'POST')) return Response.json({
      draft_id: 'fixture-draft', draft_version: 1, form_version_id: 'actual-publication', subject_ref: 'anon:fixture',
      canonical_response: saved, draft_state: saved?.data, status: 'in_progress' });
    throw new Error(`Unexpected test request ${method} ${url.href}`);
  });
  vi.stubGlobal('fetch', fetch);
  return { config, signing, bundle, definition, document, component, files, texts, publication, requests, fetch };
}

describe('explicit native package composition', () => {
  it('requires config and explicit package URL, leaving ordinary preview unsigned', async () => {
    const test = await fixture();
    expect(() => createDefaultComposition(test.config)).toThrow('explicit package URL');
    const ordinary = createDefaultComposition(resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'https://server.example.test' }),
      { packageUrl: '/package.json', initialDefinitionUrl });
    expect(ordinary.nativePackageRespondent).toBeUndefined(); expect(ordinary.responseSigning).toBeUndefined();
    expect(test.requests).toEqual([]);
  });

  it('qualifies the actual r5 package before returning one owned HTTP cohort and caches boot', async () => {
    const test = await fixture();
    const deferred = createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl });
    expect(test.requests).toEqual([]);
    await expect(deferred.draftStore.load({ formUrl: test.definition.url })).rejects.toThrow('admission has not completed');
    await expect(deferred.definitionSource.getDefinition(initialDefinitionUrl)).rejects.toThrow('admission has not completed');
    expect(test.requests).toEqual([]);
    const [boot, sameBoot] = await Promise.all([deferred.nativePackageRespondent!.load(), deferred.nativePackageRespondent!.load()]);
    expect(boot).toBe(sameBoot); expect(boot.componentDocument).toEqual(test.component);
    expect(await boot.composition.definitionSource.getDefinition(initialDefinitionUrl)).toEqual(test.definition);
    expect(boot.moduleId).toBe(test.signing.module.id); expect(boot.initialLocale).toBe('en');
    expect(boot.host.getSnapshot().locale).toBe('en');
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    expect(test.requests.some(request => request.url.includes('sessions/anonymous'))).toBe(false);
    const response = { ...sampleFormResponse, id: generateIdempotencyKey(), definitionUrl: test.definition.url, definitionVersion: test.definition.version, status: 'in-progress' as const };
    const saveAction = test.document.actions.find(action => action.id === test.signing.roles.saveInitial.actionRef)!;
    await boot.composition.responseSigning!.saveDraft({ formId: test.publication.form_id,
      draftKey: { formUrl: test.definition.url, formVersion: test.definition.version }, definition: test.definition,
      formVersionId: test.publication.form_version_id, response, operationId: generateIdempotencyKey(),
      action: { ...test.signing.roles.saveInitial, document: test.document, artifactDigest: await computeJcsSha256Digest(test.document),
        requestRef: (saveAction.effects[0] as { requestRef: string }).requestRef } });
    const creates = test.requests.filter(request => request.method === 'POST' && request.url.endsWith('/drafts'));
    expect(creates).toHaveLength(1); expect((creates[0].body as { canonical_response: FormResponse }).canonical_response.id).toBe(response.id);
    expect(await boot.composition.draftStore.load({ formUrl: test.definition.url, formVersion: test.definition.version })).toEqual(response);
    boot.host.dispose();
  });

  it('supplies actual authored label-reference keys to the maintained ceremony consumer', async () => {
    const test = await fixture();
    const factory = vi.spyOn(nativeHostModule, 'createNativePackageSigningHost');
    const deferred = createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl });
    const boot = await deferred.nativePackageRespondent!.load();
    const policy = factory.mock.calls[0][0];
    const references = ['sign', 'submit', 'paper'].map(role => {
      const selected = test.signing.roles[role as 'sign' | 'submit' | 'paper'];
      const action = test.document.actions.find(action => action.id === selected.actionRef)!;
      return (action.label as { ref: string }).ref;
    });
    const labels = policy.actionLabels('en');
    expect(Object.keys(labels)).toEqual(references);
    // SigningCeremony resolves each mapped action by action.label.ref, not its output name.
    for (const ref of references) expect(labels[ref]).toBe(boot.localeDocuments.find(document => document.locale === 'en')!.strings[ref]);
    const spanish = policy.actionLabels('es-US');
    for (const ref of references) expect(spanish[ref]).toBe(boot.localeDocuments.find(document => document.locale === 'es-US')!.strings[ref]);
    expect(labels).not.toHaveProperty('sign');
    boot.host.dispose();
  });

  it('refuses a configured source or action absent from the authored graph before credentials', async () => {
    const test = await fixture();
    for (const signing of [
      { ...test.signing, bindings: { ...test.signing.bindings, actor: { ...test.signing.bindings.actor, sourceRef: 'host:other' } } },
      { ...test.signing, roles: { ...test.signing.roles, saveInitial: { ...test.signing.roles.saveInitial, actionRef: 'absent' } } },
    ]) {
      const config = resolveActiveConfig(test.config, { nativePackageSigning: nativePackageSigningConfig(signing) });
      const composition = createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl });
      await expect(composition.nativePackageRespondent!.load()).rejects.toThrow();
    }
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    expect(test.requests.some(request => request.url.includes('sessions/anonymous'))).toBe(false);
  });

  it('refuses simultaneous signed-Surface and native package root configuration', async () => {
    const test = await fixture();
    const config = resolveActiveConfig(test.config, { surfaceBundle: {
      locator: 'https://example.test/signed', allowedOrigins: ['https://example.test'], maxBytes: 1024, timeoutMs: 1000,
      redirectPolicy: 'refuse', starterModuleId: 'x-example', receiptResourceUrl: 'https://example.test/receipt',
      verification: { expectedAppId: 'urn:test:app', methodRegistry: { version: '1', entries: [{}] },
        keys: [{ kid: 'fixture', publicKey: 'A'.repeat(43) }], authorities: [{}], pinnedReleases: [{}] },
    } as never });
    expect(() => createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl })).toThrow('cannot both be active');
    expect(test.requests).toEqual([]);
  });

  it('refuses authenticated-required native configuration instead of borrowing preview identity', async () => {
    const test = await fixture();
    expect(() => createDefaultComposition({ ...test.config, identity: { mode: 'oidc-required', oidc: {
      issuer: 'https://idp.test', clientId: 'fixture', redirectUri: '/callback', minAssurance: 'L2',
    } } }, { packageUrl: '/package.json', initialDefinitionUrl })).toThrow('anonymous package service');
    expect(test.requests).toEqual([]);
  });

  it.each(['definition', 'bundle', 'publication'] as const)('refuses %s pin/content mismatch before credentials or writes', async field => {
    const test = await fixture();
    if (field === 'publication') test.publication.definition.title = 'Altered';
    const config = field === 'publication' ? test.config : resolveActiveConfig(test.config, { nativePackageSigning: nativePackageSigningConfig({
      ...test.signing, [field]: { ...test.signing[field], version: 'wrong' },
    }) });
    const composition = createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl });
    await expect(composition.nativePackageRespondent!.load()).rejects.toThrow();
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    expect(test.requests.some(request => request.url.includes('sessions/anonymous'))).toBe(false);
  });
});
