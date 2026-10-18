import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NativePackageRuntime } from '../../src/app/NativePackageRuntime.tsx';
import type { ResponseActionsDocument } from '@formspec-org/types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';
import { SIGNING_CEREMONY_WIDGET_SHAPE, RESPONSE_REVIEW_WIDGET_SHAPE } from '@formspec-org/surface-react';
import type { FormResponse, LocaleDocument } from '@formspec-org/types';
import type { SigningContent } from '@formspec-org/types';
import { createFormEngine } from '@formspec-org/engine/render';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import * as engineInitialization from '@formspec-org/engine/init-formspec-engine';
import { delegatedSignedResponseFixture } from '../adapters/http/delegated-signed-response-fixture.ts';
import type { ScreenerSelection } from '../../src/ports/screener-retention.ts';
import type { NativeScreenerHydrationFactory, NativeScreenerHydrationFactoryContext } from '../../src/adapters/http/initial-mixed-screener-hydration.ts';
import type { BrowserAuthSessionState } from '../../src/ports/browser-auth-session.ts';
import { hydrationFixture } from '../adapters/http/screener-hydration-fixture.ts';
import * as nativeHostModule from '../../src/shared/native-package-signing-host.ts';
import { createDefaultComposition, type IdentityBinding } from '../../src/composition/default.ts';
import { resolveActiveConfig } from '../../src/config/runtime.ts';
import { nativePackageSigningConfig, type NativePackageSigningConfig } from '../../src/config/native-package-signing.ts';
import { taskCompletionFixture } from '../fixtures/task-completion.ts';
import { createNativePackageComposition } from '../../src/composition/native-package.ts';
import type { NativePackageCompositionOptions } from '../../src/composition/native-package.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import { computeJcsSha256Digest } from '../../src/adapters/http/response-action-ledger.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';
import { otherScopeKey, testScopeKey } from '../fixtures/scope.ts';
import * as appGraphModule from '@formspec-org/app-graph';
import { loadCanonicalModulePayloadSchemaResources } from 'formspec-web/adapters/schema';

/** Lowercase hex SHA-256 of a text, as package manifests pin their files. */
const rawDigest = async (value: string) => [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const nativeBytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/native-signing-r5/native-bundle.json'), 'utf8');
const componentBytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/native-signing-r5/passport-renewal.component.json'), 'utf8');
const initialDefinitionUrl = 'https://server.example.test/runtime/forms/actual-form';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fixture(subject = 'anon:fixture', lifecycle = false) {
  const selectedNativeBytes = lifecycle ? readFileSync(resolve('public/demo-packages/d1-passport/v0.1.7/native-bundle.json'), 'utf8') : nativeBytes;
  const selectedComponentBytes = lifecycle ? readFileSync(resolve('public/demo-packages/d1-passport/v0.1.7/passport-renewal.component.json'), 'utf8') : componentBytes;
  const capabilities = { earlyCaseCreation: true, persistentSaving: true, formVersionId: 'actual-publication' };
  vi.stubGlobal('crypto', webcrypto);
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } });
  const bundle = JSON.parse(selectedNativeBytes) as BundleExport;
  const resolved = dereferenceBundleExport(bundle);
  const definition = [...resolved.definitions.values()][0];
  const component = JSON.parse(selectedComponentBytes);
  component.targetSurfaceRoutes = resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => (route.slots ?? [])
    .filter(slot => slot.slotType === 'definition-form')
    .map(slot => ({ surface: bundle.manifest.surfaces!.find(ref => ref.url === resolved.surfaceRefs!.get(surface)),
      route: route.id, slot: slot.id, role: 'slot' }))));
  let node = 0;
  const identify = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const entry = value as Record<string, unknown>;
    if (typeof entry.component === 'string' && !entry.nodeId && !entry.bind && !entry.id) entry.id = `fixture-node-${node++}`;
    Object.values(entry).forEach(identify);
  };
  identify(component.tree);
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
  const signing = nativePackageSigningConfig({ keyId: 'fixture-key', expectedIssuer: 'https://source.example.test/tenant/workspace/production', definition: { url: definition.url, version: definition.version },
    bundle: { id: bundle.manifest.id, version: bundle.manifest.version }, module: bundle.manifest.modules![0], initialLocale: 'en',
    roles: Object.fromEntries(Object.entries({ ...(lifecycle ? { startApplication: 'start-application' } : {}), saveInitial: 'save-draft-initial', saveOwned: 'save-draft-owned', prepare: 'prepare', sign: 'sign', submit: 'submit', paper: 'paper' })
      .map(([role, actionRef]) => [role, { artifactRef: bundle.manifest.responseActionDocuments![0].url, actionRef }])), bindings,
    readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' },
    ...(lifecycle ? { applicationLifecycle: { instance: 'draftReadiness', canStartPath: 'canStart', startedPath: 'started', persistentSavingPath: 'persistentSaving' } } : {}) });
  const config = resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'https://server.example.test', nativePackageSigning: signing,
    attachmentMaxUploadBytes: 1024 * 1024, scopeKey: testScopeKey });
  const texts: Record<string, string> = { 'native.json': selectedNativeBytes, 'component.json': JSON.stringify(component),
    'definition.json': JSON.stringify(definition), ...Object.fromEntries(locales.map((locale, index) => [`locale-${index}.json`, JSON.stringify(locale)])) };
  // Package pins cover raw bytes, not the independent canonical publication digest.
  const rawPin = async (path: string) => ({ path, sha256: [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(texts[path])))].map(byte => byte.toString(16).padStart(2, '0')).join('') });
  const files = { definition: await rawPin('definition.json'), locales: await Promise.all(locales.map((_, index) => rawPin(`locale-${index}.json`))),
    nativeBundle: await rawPin('native.json'), component: { ...await rawPin('component.json'), ref: (JSON.parse(selectedNativeBytes).manifest.components)[0] } };
  const publication = { form_id: 'actual-form', form_version_id: 'actual-publication', definition_url: definition.url,
    definition_version: definition.version, definition_hash: await computeJcsSha256Digest(definition), definition: structuredClone(definition) };
  const requests: { url: string; method: string; body?: unknown; headers: Headers }[] = [];
  let saved: FormResponse | undefined; let draftReadGate: Promise<void> | undefined;
  let draftStatus = 'in_progress'; let draftVersion = 1;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url: url.href, method, body, headers: new Headers(init?.headers) });
    if (url.origin !== 'https://server.example.test') {
      const name = url.pathname.split('/').at(-1)!;
      return new Response(name === 'package.json' ? JSON.stringify({ files }) : texts[name]);
    }
    if (url.pathname.endsWith('/sessions/anonymous')) return Response.json({ session_id: 'fixture-session', session_token: 'fixture-token',
      subject_ref: 'anon:fixture', form_id: 'actual-form', expires_at: '2099-01-01T00:00:00Z' });
    if (url.pathname === '/runtime/forms/actual-form/application-lifecycle') return Response.json(capabilities);
    if (url.pathname === '/runtime/forms/actual-form' && method === 'GET') return Response.json(publication);
    if (url.pathname === '/runtime/forms/actual-form/drafts' && method === 'POST') saved = structuredClone(body.canonical_response);
    if (url.pathname === '/drafts/fixture-draft' && method === 'GET') await draftReadGate;
    if (url.pathname === '/drafts/fixture-draft' || (url.pathname.endsWith('/drafts') && method === 'POST')) return Response.json({
      draft_id: 'fixture-draft', draft_version: draftVersion, form_version_id: 'actual-publication', subject_ref: subject,
      canonical_response: saved, draft_state: saved?.data, status: draftStatus });
    throw new Error(`Unexpected test request ${method} ${url.href}`);
  });
  vi.stubGlobal('fetch', fetch);
  return { capabilities, config, signing, bundle, definition, document, component, files, texts, publication, requests, fetch, values,
    setDraftReadGate: (gate: Promise<void>) => { draftReadGate = gate; },
    setDraft: (response: FormResponse, status: string, version: number) => { saved = structuredClone(response); draftStatus = status; draftVersion = version; } };
}

async function multiTargetLocaleFixture(options: { omitSelected?: boolean; duplicateSelected?: boolean; appTarget?: boolean; incompatibleSelected?: boolean } = {}) {
  const test = await fixture();
  const candidate = JSON.parse(test.texts['native.json']);
  const originalLocale = Object.values(candidate.documents).find((document: unknown) => !!document && typeof document === 'object' && '$formspecLocale' in document && 'locale' in document && document.locale === test.signing.initialLocale) as LocaleDocument;
  if (!originalLocale.url) throw new Error('Fixture Locale URL is unavailable');
  const otherDefinition = { ...test.definition, url: 'urn:test:other-definition' };
  candidate.manifest.definitions.push({ url: otherDefinition.url, version: otherDefinition.version });
  candidate.documents[otherDefinition.url] = otherDefinition;
  const otherLocale = { ...originalLocale, url: 'urn:test:other-locale',
    target: options.appTarget
      ? { kind: 'app' as const, url: candidate.manifest.id, compatibleVersions: candidate.manifest.version }
      : { ...originalLocale.target, url: options.duplicateSelected ? test.definition.url : otherDefinition.url },
    ...(options.appTarget ? { strings: {} } : {}) };
  candidate.manifest.locales.push({ url: otherLocale.url, version: otherLocale.version, locale: otherLocale.locale });
  candidate.documents[otherLocale.url] = otherLocale;
  test.texts['other-locale.json'] = JSON.stringify(otherLocale);
  test.files.locales.push({ path: 'other-locale.json', sha256: await rawDigest(test.texts['other-locale.json']) });
  if (options.omitSelected) {
    delete candidate.documents[originalLocale.url];
    candidate.manifest.locales = candidate.manifest.locales.filter((ref: { url: string }) => ref.url !== originalLocale.url);
    test.files.locales = test.files.locales.filter(pin => JSON.parse(test.texts[pin.path]).url !== originalLocale.url);
  }
  if (options.incompatibleSelected) {
    originalLocale.target.compatibleVersions = '99.0.0';
    const pin = test.files.locales.find(pin => JSON.parse(test.texts[pin.path]).url === originalLocale.url)!;
    test.texts[pin.path] = JSON.stringify(originalLocale);
    pin.sha256 = await rawDigest(test.texts[pin.path]);
  }
  test.texts['native.json'] = JSON.stringify(candidate);
  test.files.nativeBundle.sha256 = await rawDigest(test.texts['native.json']);
  return test;
}

async function moduleBindingFixture(selectedModule = false) {
  const test = await fixture();
  const candidate = JSON.parse(test.texts['native.json']) as BundleExport;
  const resolved = dereferenceBundleExport(candidate);
  const surface = resolved.surfaces[0];
  const route = surface.routes.find(route => route.id === 'signing')!;
  const registry = resolved.registries[0];
  const module = selectedModule ? test.signing.module : { id: 'x-sibling-review', version: '0.1.0' };
  const common = { version: '0.1.0', status: 'stable' as const, description: 'Generic sibling review', compatibility: { formspecVersion: '>=1.0.0' } };
  const widgetName = 'x-sibling-review-widget';
  if (selectedModule) registry.entries.find(entry => entry.name === module.id)!.contributes!.push(widgetName);
  else {
    candidate.manifest.modules = [...candidate.manifest.modules!, module];
    registry.entries.push({ ...common, name: module.id, category: 'module', contributes: [widgetName] });
  }
  registry.entries.push({ ...common, name: widgetName, category: 'widget', widgetShape: {
    props: { type: 'object', additionalProperties: false }, dataInputs: [{ name: 'response', required: true }],
  } });
  route.slots!.push({ id: 'sibling-review', slotType: 'module-widget', binding: {
    moduleId: module.id, widgetName, config: {}, dataBindings: { response: test.signing.bindings.actor },
  } });
  // Dereferencing returns the document values used by the native graph.
  test.texts['native.json'] = JSON.stringify(candidate);
  test.files.nativeBundle.sha256 = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(test.texts['native.json'])))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const config = resolveActiveConfig(test.config, { nativePackageSigning: { ...test.signing, modules: candidate.manifest.modules } });
  return { ...test, config };
}

async function completeStudioFixture(scoped: boolean, subject = 'anon:fixture', restorationTest?: { hostState?: boolean; initialData?: boolean }) {
  const test = await fixture(subject);
  const bytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/photo-complete-successor-v1.bundle.json'), 'utf8');
  const bundle = JSON.parse(bytes) as BundleExport;
  const resolved = dereferenceBundleExport(bundle);
  const definition = resolved.definitions.get('urn:formspec:demo:d1:passport-renewal')!;
  const locales = Object.values(bundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document) as LocaleDocument[];
  test.texts['native.json'] = bytes; test.files.nativeBundle.sha256 = await rawDigest(bytes);
  test.texts['definition.json'] = JSON.stringify(definition); test.files.definition.sha256 = await rawDigest(test.texts['definition.json']);
  // Actual inline Components remain in the frozen complete graph.
  Reflect.deleteProperty(test.files, 'component');
  test.files.locales = await Promise.all(locales.map(async (document, index) => {
    const path = `locale-${index}.json`; test.texts[path] = JSON.stringify(document);
    return { path, sha256: await rawDigest(test.texts[path]) };
  }));
  Object.assign(test.publication, { definition_url: definition.url, definition_version: definition.version,
    definition_hash: await computeJcsSha256Digest(definition), definition });
  const intakeSurface = resolved.surfaces.find(surface => resolved.surfaceRefs?.get(surface) === 'urn:formspec:demo:d1:signing-app:surface')!;
  const route = intakeSurface.routes.find(route => route.id === 'signing')!;
  const intake = intakeSurface.routes.find(route => route.id === 'intake')!;
  if (restorationTest?.hostState) {
    const requiredContext = structuredClone(route.slots!.find(slot => slot.slotType === 'module-widget'
      && (slot.binding as { widgetName: string }).widgetName === 'x-structured-panel')!);
    const binding = requiredContext.binding as { dataBindings: { caseFile: { catalogRef: string; sourceRef: string } } };
    const catalog = resolved.dataSources!.find(handle => handle.catalogRef === binding.dataBindings.caseFile.catalogRef)!.document;
    const source = structuredClone(catalog.sources.find(source => source.id === binding.dataBindings.caseFile.sourceRef)!);
    source.id = 'host:restoration-context'; source.availability = { level: 'route', surfaceRef: resolved.surfaceRefs!.get(intakeSurface)!, routeRef: intake.id };
    catalog.sources.push(source); binding.dataBindings.caseFile.sourceRef = source.id;
    requiredContext.id = 'saved-context'; intake.slots!.push(requiredContext);
  }
  const prefillSnapshot = { fullName: 'Mapped source name', email: 'mapped@example.test', photo: null };
  if (restorationTest?.initialData) {
    const catalog = resolved.dataSources![0].document;
    catalog.sources.push({ id: 'host:scenario-prefill', kind: 'host-state', owner: 'host', scope: 'route',
      availability: { level: 'slot', surfaceRef: resolved.surfaceRefs!.get(intakeSurface)!, routeRef: intake.id, slotId: 'form' },
      runtime: { delivery: 'live', cache: { mode: 'subscribe' }, authorizationBoundary: 'host', failureMode: 'block-render',
        provenance: { kind: 'host-state', source: 'declared-neutral-snapshot' } },
      schema: { type: 'object', required: ['fullName', 'email', 'photo'], properties: { fullName: { type: 'string' }, email: { type: 'string' }, photo: { type: 'null' } }, additionalProperties: false } });
    const mappingUrl = 'urn:test:owned-form-prefill';
    bundle.documents = { ...bundle.documents, [mappingUrl]: { $formspecMapping: '1.0', version: '1.0.0', definitionRef: definition.url,
      definitionVersion: definition.version, autoMap: false, direction: 'reverse', targetSchema: { format: 'json' },
      rules: ['fullName', 'email', 'photo'].map(path => ({ sourcePath: path, targetPath: path, transform: 'preserve' })) } };
    bundle.manifest.mappings = [...bundle.manifest.mappings!, { handle: 'scenarioPrefill', url: mappingUrl, version: '1.0.0' }];
    const formSlot = intake.slots!.find(slot => slot.slotType === 'definition-form')!;
    Object.assign(formSlot.binding, { initialData: { catalogRef: catalog.id, sourceRef: 'host:scenario-prefill', mappingRef: 'scenarioPrefill' } });
  }
  if (restorationTest?.hostState || restorationTest?.initialData) {
    test.texts['native.json'] = JSON.stringify(bundle); test.files.nativeBundle.sha256 = await rawDigest(test.texts['native.json']);
  }
  const bindingFor = (name: string) => route.slots!.flatMap(slot => {
    const binding = slot.binding as { dataBindings?: Record<string, { catalogRef: string; sourceRef: string }> };
    const selected = binding.dataBindings?.[name];
    return selected ? [{ catalogRef: selected.catalogRef, sourceRef: selected.sourceRef }] : [];
  })[0];
  const signing = { ...test.signing, definition: { url: definition.url, version: definition.version },
    bundle: { id: bundle.manifest.id!, version: bundle.manifest.version! }, module: bundle.manifest.modules![0], modules: bundle.manifest.modules,
    component: (bundle.manifest as typeof bundle.manifest & { components: { handle: string; url: string; version: string }[] })
      .components.find(ref => ref.handle === 'intake')!,
    bindings: Object.fromEntries(Object.keys(test.signing.bindings).map(name => [name, bindingFor(name)])),
    ...(scoped ? { signingScope: { surface: { url: 'urn:formspec:demo:d1:signing-app:surface', version: '0.3.3' },
      route: 'signing', ceremonySlot: 'ceremony', reviewSlot: 'review' } } : {}) };
  const config = resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'https://server.example.test', nativePackageSigning: signing,
    scopeKey: testScopeKey });
  const screenerSlot = intakeSurface.routes.flatMap(route => route.slots ?? []).find(slot => slot.slotType === 'screener')!;
  const screenerRef = (screenerSlot.binding as { screenerRef: string }).screenerRef;
  const screener = resolved.screenerHandles!.find(handle => handle.ref.url === screenerRef)!.document;
  const session = { issuer: 'https://idp.test', subject: 'fixture', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
  const browserAuthSession = { getSession: async () => session, begin: async () => {}, completeCallback: async () => session,
    completeSilentCallback: async () => {}, renew: async () => session, logout: async () => {}, completeLogoutCallback: async () => {},
    accessToken: async () => 'fixture-bearer', subscribe: () => () => {}, dispose: () => {} };
  const provider = { discover: vi.fn(async () => []), authenticate: vi.fn(), revoke: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) };
  const selection: ScreenerSelection = { evaluationSelection: {
    scope: testScopeKey,
    formId: test.publication.form_id, formVersionId: test.publication.form_version_id,
    definitionUrl: definition.url!, definitionVersion: definition.version, definitionHash: test.publication.definition_hash,
    requiredSources: Object.values(definition.instances ?? {}).flatMap(instance => instance.source ? [instance.source] : []) },
    formVersionHash: test.publication.definition_hash, sourceRef: definition.instances!.eligibility.source!, screenerUrl: screener.url!, screenerVersion: screener.version!,
    screenerRawHash: `sha256:${await rawDigest(JSON.stringify(screener))}`, screenerHash: await computeJcsSha256Digest(screener),
    allowedTargets: ['surface:intake', 'surface:paper-help'], qualificationProfile: 'flat-first-match-v1',
    // Syntactic fixture pin only: no Mapping or hydration operation is qualified by this package-load test.
    instanceMappingHash: await computeJcsSha256Digest({ purpose: 'unexecuted-test-mapping-policy' }) };
  // Package admission requires selected capabilities; this test does not execute sources or accept a screening result.
  const initialDataSources = vi.fn(() => {
    if (!restorationTest?.initialData) throw new Error('Initial data was not selected for execution');
    return { authorizeDataSource: () => ({ status: 'authorized' as const }),
      dataSourceLoader: () => ({ status: 'loaded' as const, value: structuredClone(prefillSnapshot), freshness: 'fresh' as const }),
      validateDataSourcePayload: () => ({ valid: true }) };
  });
  const hostEvents = Object.entries(bundle.documents).flatMap(([artifactRef, raw]) => {
    const document = raw as ResponseActionsDocument;
    return document.targetDefinition?.url === definition.url ? (document.actions ?? []).flatMap(action => {
      const effect = action.effects?.length === 1 ? action.effects[0] : undefined;
      return effect?.type === 'hostEvent' && !Object.values(signing.roles).some(role => role.actionRef === action.id)
        ? [{ artifactRef, actionRef: action.id, eventName: effect.eventName, handle: async () => { throw new Error('Unexecuted fixture host capability'); } }] : [];
    }) : [];
  });
  const options = { packageUrl: '/package.json', initialDefinitionUrl, initialDataSources, hostEvents,
    nativeScreener: { selection, selectionHash: await computeJcsSha256Digest(selection), selectionKey: 'fixture',
      entryGate: { protectedTargets: ['surface:intake'] } },
    identityBinding: { provider, accessToken: async () => 'fixture-bearer', browserAuthSession } };
  const authenticatedConfig = { ...config, ports: { ...config.ports, identityProvider: 'oidc' as const }, identity: {
    mode: 'oidc-required' as const, oidc: { issuer: session.issuer, clientId: 'fixture', redirectUri: '/callback', minAssurance: 'L2' as const } } };
  return { ...test, config: authenticatedConfig, options, initialDataSources };
}

describe('explicit native package composition', () => {
  it.each(['screening', 'both-with-prefill'] as const)('mounts an exact retained unsigned draft through real package admission and Surface with %s startup gates', async gate => {
    const test = await completeStudioFixture(true, 'oidc:fixture', { hostState: gate !== 'screening', initialData: gate === 'both-with-prefill' });
    const claim = { provider: 'https://idp.test', adapter: 'oidc-client-ts', subjectRef: 'oidc:fixture',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L2' as const };
    const identityBinding = { ...test.options.identityBinding, provider: {
      discover: async () => [{ kind: 'oidc' as const, issuer: claim.provider, displayName: 'Sign in', minAssurance: 'L2' as const }],
      authenticate: async () => claim, revoke: async () => {}, subscribe: (listener: (value: typeof claim) => void) => { listener(claim); return () => {}; },
    } };
    const options = { ...test.options, identityBinding };
    const seedBoot = await createDefaultComposition(test.config, options).nativePackageRespondent!.load();
    const engine = createFormEngine(seedBoot.host.definition);
    seedBoot.localeDocuments.forEach(document => engine.loadLocale(document)); engine.setLocale('en');
    engine.setValue('fullName', 'Retained person');
    const photo = { kind: 'attachment-ref', uri: 'urn:formspec:attachment:retained-photo', filename: 'retained.png', mimeType: 'image/png', contentType: 'image/png', size: 1, hash: `sha256:${'a'.repeat(64)}` };
    engine.setValue('photo', photo);
    const response = { ...engine.getResponse({ profile: 'off' }), id: generateIdempotencyKey() }; delete response.data.email; engine.dispose(); seedBoot.host.dispose();
    test.setDraft(response, 'in_progress', 7);
    const composition = createDefaultComposition(test.config, { ...options, ownedDraftResume: {
      draftId: 'fixture-draft', expectedResponseId: response.id,
    } });
    const boot = await composition.nativePackageRespondent!.load();
    const formRoute = boot.host.bundle.surfaces.flatMap(surface => surface.routes).find(route => route.slots?.some(slot =>
      slot.slotType === 'definition-form' && (slot.binding as { definitionRef: string }).definitionRef === boot.host.definition.url))!;
    window.history.replaceState(null, '', formRoute.path!);
    const configure = vi.spyOn(boot.host, 'configureRuntime');
    const mounted = render(createElement(NativePackageRuntime, { composition, config: test.config }));
    await vi.waitFor(() => expect(test.requests.some(request => request.method === 'GET' && request.url.endsWith('/drafts/fixture-draft'))).toBe(true));
    await vi.waitFor(() => expect(mounted.container.querySelector('.native-package-workspace')).not.toBeNull());
    await screen.findByRole('textbox', { name: /full legal name/i });
    expect(configure).toHaveBeenCalled(); expect(boot.host.getSnapshot().controller?.saved?.draft.version).toBe(7);
    expect(boot.host.getSnapshot().controller!.saved!.response).toEqual(response);
    expect((screen.getByRole('textbox', { name: /full legal name/i }) as HTMLInputElement).value).toBe('Retained person');
    expect(boot.host.getSnapshot().controller!.saved!.response.data.photo).toEqual(photo);
    expect(Object.hasOwn(boot.host.getSnapshot().controller!.saved!.response.data, 'email')).toBe(false);
    const startup = boot.host.getStartupRoute(formRoute.path!);
    expect(startup.requiresScreener).toBe(true); expect(startup.requiresHostState).toBe(gate !== 'screening');
    expect(startup.canRestoreOwnedForm).toBe(true);
    expect(boot.host.getSnapshot().runtime).toBeUndefined(); expect(boot.host.getSnapshot().controller?.prepared).toBeUndefined();
    expect(test.initialDataSources).toHaveBeenCalledTimes(gate === 'both-with-prefill' ? 1 : 0);
    if (gate === 'both-with-prefill') {
      const input = configure.mock.calls[0][0]; expect(input.restoredSavedDraft!.response).toEqual(response);
      expect(input.engine.getResponse({ profile: 'off' }).data.email).not.toBe('mapped@example.test');
    }
    expect(boot.host.getSnapshot().nativeReadiness).toBe('needs-save');
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    const reviewRoute = boot.host.bundle.surfaces.flatMap(surface => surface.routes).find(route => route.id === 'signing')!;
    expect(boot.host.getStartupRoute(reviewRoute.path!).canRestoreOwnedForm).toBe(false);
    fireEvent.change(screen.getByRole('textbox', { name: /full legal name/i }), { target: { value: 'Edited retained person' } });
    await vi.waitFor(() => expect((screen.getByRole('textbox', { name: /full legal name/i }) as HTMLInputElement).value).toBe('Edited retained person'));
    expect(boot.host.getStartupRoute(formRoute.path!).canRestoreOwnedForm).toBe(true);
    if (gate === 'screening') mounted.unmount();
    else boot.host.retireCandidateAuthority!();
    expect(boot.host.getStartupRoute(formRoute.path!).canRestoreOwnedForm).toBe(false);
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    mounted.unmount(); boot.host.dispose(); window.history.replaceState(null, '', '/');
  }, 30000);
  it('awaits runtime then tools for an admitted initial-data Mapping before publishing the host', async () => {
    const test = await completeStudioFixture(true); const order: string[] = [];
    let release: (() => void) | undefined;
    vi.spyOn(engineInitialization, 'initFormspecEngine').mockImplementation(async () => { order.push('runtime'); });
    vi.spyOn(engineInitialization, 'initFormspecEngineTools').mockImplementation(async () => {
      order.push('tools-start'); await new Promise<void>(resolve => { release = resolve; }); order.push('tools-ready');
    });
    let published = false;
    const pending = createDefaultComposition(test.config, test.options).nativePackageRespondent!.load().then(boot => { published = true; return boot; });
    await vi.waitFor(() => expect(order).toEqual(['runtime', 'tools-start']));
    expect(published).toBe(false); expect(test.initialDataSources).not.toHaveBeenCalled();
    release!(); const boot = await pending;
    expect(order).toEqual(['runtime', 'tools-start', 'tools-ready']); boot.host.dispose();
  });
  it('refuses boot when required tools initialization fails', async () => {
    const test = await completeStudioFixture(true);
    vi.spyOn(engineInitialization, 'initFormspecEngineTools').mockRejectedValue(new Error('selected-tools-unavailable'));
    await expect(createDefaultComposition(test.config, test.options).nativePackageRespondent!.load()).rejects.toThrow('selected-tools-unavailable');
    expect(test.initialDataSources).not.toHaveBeenCalled();
    expect(test.requests.filter(request => request.url.startsWith('https://server.example.test'))).toHaveLength(0);
  });
  it('keeps tools unloaded for a package without initial-data Mapping', async () => {
    const test = await fixture(); const tools = vi.spyOn(engineInitialization, 'initFormspecEngineTools');
    const boot = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    expect(tools).not.toHaveBeenCalled(); boot.host.dispose();
  });

  it.each(['admitted', 'host-refused'] as const)('owns an injected hydration provider through %s', async mode => {
    const test = await completeStudioFixture(true);
    const dispose = vi.fn(), retireFacts = vi.fn(), hydrate = vi.fn(async () => { throw new Error('not selected for execution'); });
    const hydrationFactory = vi.fn((_context: NativeScreenerHydrationFactoryContext) => ({ dispose, retireFacts, hydrate }));
    const nativeScreener: typeof test.options.nativeScreener & { hydrationFactory: NativeScreenerHydrationFactory } = { ...test.options.nativeScreener, hydrationFactory };
    const options = { ...test.options, nativeScreener, ...(mode === 'host-refused' ? { initialDataSources: undefined } : {}) };
    const composition = createDefaultComposition(test.config, options);
    nativeScreener.hydrationFactory = () => { throw new Error('late caller substitution'); };
    if (mode === 'host-refused') {
      await expect(composition.nativePackageRespondent!.load()).rejects.toThrow('native-initial-data-source-capability-unavailable');
    } else {
      const boot = await composition.nativePackageRespondent!.load();
      expect(dispose).not.toHaveBeenCalled(); boot.host.dispose();
    }
    expect(hydrationFactory).toHaveBeenCalledOnce();
    expect(hydrationFactory.mock.calls[0][0]).toMatchObject({ publication: test.publication, selection: test.options.nativeScreener.selection });
    expect(dispose).toHaveBeenCalledOnce(); expect(hydrate).not.toHaveBeenCalled();
  });

  it('loads the exact Studio two-ceremony package with explicit intake selection', async () => {
    const test = await completeStudioFixture(true);
    const boot = await createDefaultComposition(test.config, test.options).nativePackageRespondent!.load();
    expect(boot.host.bundle.surfaces).toHaveLength(5);
    expect(test.initialDataSources).not.toHaveBeenCalled();
    boot.host.dispose();
  });
  it('refuses the same complete two-ceremony package without selection', async () => {
    const test = await completeStudioFixture(false);
    await expect(createDefaultComposition(test.config, test.options).nativePackageRespondent!.load()).rejects.toThrow();
    expect(test.requests.filter(request => request.url.startsWith('https://server.example.test'))).toHaveLength(0);
  });

  it('carries one admitted selected ceremony identity into the private host', async () => {
    const test = await fixture();
    const factory = vi.spyOn(nativeHostModule, 'createNativePackageSigningHost');
    const signing = { ...test.signing, signingScope: { surface: { ...test.bundle.manifest.surfaces![0], version: test.bundle.manifest.surfaces![0].version! },
      route: 'signing', ceremonySlot: 'ceremony', reviewSlot: 'review' } };
    const config = resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'https://server.example.test', nativePackageSigning: signing,
      scopeKey: testScopeKey });
    const boot = await createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    const policy = factory.mock.calls[0][0];
    expect(policy.signingScope).toMatchObject({ ...signing.signingScope, surfaceId: 'surface', moduleId: signing.module.id });
    expect(policy.controller.roles.sign?.widgetSource?.route.routeId).toBe('signing');
    boot.host.dispose();
  });

  it('scopes Source binding comparison to the explicitly selected module', async () => {
    const test = await moduleBindingFixture();
    await expect(createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load()).rejects.toThrow('native-widget-unadmitted');
    expect(test.requests.some(request => request.url === initialDefinitionUrl)).toBe(true);
    expect(test.requests.some(request => request.url.endsWith('/sessions/anonymous'))).toBe(false);
  });

  it('refuses a binding supplied only by another admitted module', async () => {
    const test = await moduleBindingFixture();
    const admitted = test.config.referenceAdapters!.formspecStack!.nativePackageSigning!;
    const config = resolveActiveConfig(test.config, { nativePackageSigning: {
      ...admitted, module: { id: 'x-sibling-review', version: '0.1.0' },
    } });
    await expect(createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load()).rejects.toThrow('Native source binding differs from the authored Surface');
    expect(test.requests.every(request => !request.url.startsWith('https://server.example.test'))).toBe(true);
  });

  it('refuses a conflicting Source binding in the selected module before publication', async () => {
    const test = await moduleBindingFixture(true);
    await expect(createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load()).rejects.toThrow('Native source binding differs from the authored Surface');
    expect(test.requests.every(request => !request.url.startsWith('https://server.example.test'))).toBe(true);
  });


  it('selects the current Definition Locale when another admitted Definition uses the same language', async () => {
    const test = await multiTargetLocaleFixture();
    const boot = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    expect(boot.host.bundle.definitions.size).toBe(2);
    expect(boot.localeDocuments).toHaveLength(3);
    expect(test.requests.some(request => request.url === initialDefinitionUrl)).toBe(true);
    expect(test.requests.some(request => request.url.endsWith('/sessions/anonymous'))).toBe(false);
    boot.host.dispose();
  });

  it('refuses cross-target Locale fallback before publication', async () => {
    const test = await multiTargetLocaleFixture({ omitSelected: true });
    await expect(createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load()).rejects.toThrow('Native package Locale pin is unavailable or ambiguous');
    expect(test.requests.every(request => !request.url.startsWith('https://server.example.test'))).toBe(true);
  });

  it('refuses conflicting Locale documents for the selected target and language', async () => {
    const test = await multiTargetLocaleFixture({ duplicateSelected: true });
    await expect(createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load()).rejects.toThrow();
    expect(test.requests.every(request => !request.url.startsWith('https://server.example.test'))).toBe(true);
  });

  it('refuses an app Locale as fallback for the selected Definition', async () => {
    const test = await multiTargetLocaleFixture({ omitSelected: true, appTarget: true });
    await expect(createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load()).rejects.toThrow('Native package Locale pin is unavailable or ambiguous');
    expect(test.requests.every(request => !request.url.startsWith('https://server.example.test'))).toBe(true);
  });

  it('refuses an incompatible selected Definition Locale before publication', async () => {
    const test = await multiTargetLocaleFixture({ incompatibleSelected: true });
    await expect(createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load()).rejects.toThrow();
    expect(test.requests.every(request => !request.url.startsWith('https://server.example.test'))).toBe(true);
  });

  it('loads an explicitly selected inline Component without a duplicate external file', async () => {
    const test = await fixture();
    const component = test.files.component.ref;
    const bundle = { ...test.bundle, documents: { ...test.bundle.documents, [component.url]: test.component } };
    test.texts['native.json'] = JSON.stringify(bundle);
    test.files.nativeBundle.sha256 = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(test.texts['native.json'])))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    delete (test.files as { component?: unknown }).component;
    const config = { ...test.config, referenceAdapters: { ...test.config.referenceAdapters, formspecStack: { ...test.config.referenceAdapters!.formspecStack!, nativePackageSigning: { ...test.signing, component } } } };
    const boot = await createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    expect(boot.componentDocument).toEqual(test.component);
    expect(test.requests.some(request => request.url.endsWith('/component.json') || request.url.endsWith('/sessions/anonymous'))).toBe(false);
  });

  it('preserves explicit single-module selection through the maintained composition operation', async () => {
    const test = await fixture();
    const config = { ...test.config, referenceAdapters: { ...test.config.referenceAdapters, formspecStack: { ...test.config.referenceAdapters!.formspecStack!, nativePackageSigning: { ...test.signing, modules: [test.signing.module] } } } };
    const boot = await createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    expect(boot.moduleId).toBe(test.signing.module.id);
    expect(test.requests.some(request => request.url.endsWith('/sessions/anonymous'))).toBe(false);
  });

  it('refuses a configured module absent from the package before publication or credentials', async () => {
    const test = await fixture();
    const config = { ...test.config, referenceAdapters: { ...test.config.referenceAdapters, formspecStack: { ...test.config.referenceAdapters!.formspecStack!, nativePackageSigning: { ...test.signing, modules: [test.signing.module, { id: 'x-additional-review', version: '1' }] } } } };
    await expect(createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load())
      .rejects.toThrow('Native package differs from its explicit deployment pins');
    expect(test.requests.every(request => !request.url.startsWith('https://server.example.test'))).toBe(true);
  });

  it('preflights a submitted owned draft on fresh package boot without mounting an engine or issuing another credential/write', async () => {
    const test = await fixture(); await initFormspecEngine();
    const first = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    await expect(first.resumeSubmitted!()).resolves.toBe('absent'); expect(test.requests.some(request => request.url.endsWith('/sessions/anonymous'))).toBe(false);
    const key = { formUrl: test.definition.url, formVersion: test.definition.version };
    const engine = createFormEngine(test.definition); first.localeDocuments.forEach(locale => engine.loadLocale(locale)); engine.setLocale('es-US');
    engine.setValue('declarationAcknowledged', true);
    engine.setValue('photo', { kind: 'attachment-ref', uri: 'attachment:fixture', filename: 'fixture.png', mimeType: 'image/png', contentType: 'image/png', size: 1, hash: `sha256:${'c'.repeat(64)}` });
    const response = engine.getResponse({ profile: 'on-submit', id: generateIdempotencyKey() }); engine.dispose();
    await first.composition.draftStore.save(key, response);
    const content = Object.values((test.definition.extensions!['x-formspec-signing-content'] as { entries: Record<string, SigningContent> }).entries).find(content => content.locale === 'es-US')!;
    const signed = await delegatedSignedResponseFixture({ response, content, actor: 'anon:fixture', draftId: 'fixture-draft', candidateVersion: 4, issuer: test.signing.expectedIssuer, keyId: test.signing.keyId });
    test.setDraft(signed, 'submitted', 6); first.host.dispose();
    const count = test.requests.length;
    const fresh = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    const configureForm = vi.spyOn(fresh.host, 'configureRuntime'); const configureSubmitted = vi.spyOn(fresh.host, 'configureSubmittedRuntime');
    await expect(Promise.all([fresh.resumeSubmitted!(), fresh.resumeSubmitted!()])).resolves.toEqual(['submitted', 'submitted']);
    expect(configureForm).not.toHaveBeenCalled(); expect(configureSubmitted).toHaveBeenCalledOnce();
    expect(configureSubmitted.mock.calls[0][0].state).toEqual({ kind: 'submitted', response: signed, draft: { id: 'fixture-draft', version: 6 },
      subjectRef: 'anon:fixture', formVersionId: 'actual-publication' });
    expect(fresh.host.getSnapshot().submitted).toEqual({ referenceNumber: signed.id, recordKind: 'response' });
    expect(fresh.host.getSnapshot().runtime).toBeUndefined(); expect(fresh.host.getSnapshot().controller).toBeUndefined();
    expect(fresh.host.getSnapshot().locale).toBe('es-US');
    const recovered = test.requests.slice(count); expect(recovered.every(request => request.method === 'GET')).toBe(true);
    const ownedRead = recovered.filter(request => request.url.endsWith('/drafts/fixture-draft')); expect(ownedRead).toHaveLength(1);
    expect(ownedRead[0].headers.get('authorization')).toBe('Bearer fixture-token');
    expect(ownedRead[0].headers.get('x-stack-scope-key')).toBe(testScopeKey); fresh.host.dispose();
  });
  it('reports a retained active draft separately from absent access without terminal initialization or writes', async () => {
    const test = await fixture();
    const initial = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    const response = { ...sampleFormResponse, id: generateIdempotencyKey(), definitionUrl: test.definition.url, definitionVersion: test.definition.version,
      status: 'in-progress' as const };
    await initial.composition.draftStore.save({ formUrl: test.definition.url, formVersion: test.definition.version }, response); initial.host.dispose();
    const fresh = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    const configureSubmitted = vi.spyOn(fresh.host, 'configureSubmittedRuntime'); const count = test.requests.length;
    await expect(Promise.all([fresh.resumeSubmitted!(), fresh.resumeSubmitted!()])).resolves.toEqual(['active', 'active']);
    expect(configureSubmitted).not.toHaveBeenCalled(); expect(fresh.host.getSnapshot().submitted).toBeUndefined();
    expect(test.requests.slice(count)).toHaveLength(1); expect(test.requests[count].method).toBe('GET'); fresh.host.dispose();
  });
  it('retains a refused preflight failure instead of reporting absent or active access', async () => {
    const test = await fixture();
    const initial = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    const response = { ...sampleFormResponse, id: generateIdempotencyKey(), definitionUrl: test.definition.url, definitionVersion: test.definition.version };
    await initial.composition.draftStore.save({ formUrl: test.definition.url, formVersion: test.definition.version }, response); initial.host.dispose();
    test.setDraft(response, 'unknown', 1);
    const fresh = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    const count = test.requests.length; const first = fresh.resumeSubmitted!();
    await expect(first).rejects.toThrow(/qualified publication/);
    expect(fresh.resumeSubmitted!()).toBe(first); await expect(fresh.resumeSubmitted!()).rejects.toThrow();
    expect(test.requests.slice(count)).toHaveLength(1); expect(fresh.host.getSnapshot().submitted).toBeUndefined(); fresh.host.dispose();
  });
  it('requires config and explicit package URL, leaving ordinary preview unsigned', async () => {
    const test = await fixture();
    expect(() => createDefaultComposition(test.config)).toThrow('explicit package URL');
    const ordinary = createDefaultComposition(resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'https://server.example.test', scopeKey: testScopeKey }),
      { packageUrl: '/package.json', initialDefinitionUrl });
    expect(ordinary.nativePackageRespondent).toBeUndefined(); expect(ordinary.responseSigning).toBeUndefined();
    expect(test.requests).toEqual([]);
  });

  it('qualifies the actual r5 package before returning one owned HTTP cohort and caches boot', async () => {
    const test = await fixture();
    // Observe the real production producer; keep its maintained props compiler intact.
    const producer = vi.spyOn(appGraphModule, 'produceAppGraphValidationReport');
    const deferred = createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl });
    expect(test.requests).toEqual([]);
    await expect(deferred.draftStore.load({ formUrl: test.definition.url })).rejects.toThrow('admission has not completed');
    await expect(deferred.definitionSource.getDefinition(initialDefinitionUrl)).rejects.toThrow('admission has not completed');
    expect(test.requests).toEqual([]);
    const [boot, sameBoot] = await Promise.all([deferred.nativePackageRespondent!.load(), deferred.nativePackageRespondent!.load()]);
    expect(boot).toBe(sameBoot); expect(boot.componentDocument).toEqual(test.component);
    expect(await boot.composition.definitionSource.getDefinition(initialDefinitionUrl)).toEqual(test.definition);
    const source = boot.composition.definitionSource;
    const packageReadCount = test.requests.length;
    expect(initialDefinitionUrl).not.toBe(test.definition.url);
    for (const url of [initialDefinitionUrl, test.definition.url]) {
      expect(await source.getDefinition(url, test.definition.version)).toEqual(test.definition);
      expect(await source.getComponentDocument!(url, test.definition.version)).toEqual(test.component);
      expect(await source.getLocaleDocuments!(url, test.definition.version)).toEqual(
        Object.values(test.bundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document));
      expect(await source.getThemeDocument!(url, test.definition.version)).toBeNull();
      expect(await source.getResponseActionsDocument!(url, test.definition.version)).toBeNull();
    }
    const packageReads: Array<(url: string, version?: string) => Promise<unknown>> = [
      source.getDefinition, source.getThemeDocument!, source.getResponseActionsDocument!,
      source.getLocaleDocuments!, source.getComponentDocument!,
    ];
    for (const read of packageReads) {
      await expect(read('https://server.example.test/runtime/forms/foreign-form', test.definition.version)).rejects.toThrow('selection mismatch');
      await expect(read(initialDefinitionUrl, '99.0.0')).rejects.toThrow('selection mismatch');
      await expect(read(test.definition.url, '99.0.0')).rejects.toThrow('selection mismatch');
    }
    expect(test.requests).toHaveLength(packageReadCount);
    expect(boot.moduleId).toBe(test.signing.module.id); expect(boot.initialLocale).toBe('en');
    expect(boot.host.getSnapshot().locale).toBe('en');
    expect(producer).toHaveBeenCalledTimes(1);
    const admission = producer.mock.calls[0][0];
    expect(admission.moduleAdmission).toEqual({ allowedModules: [test.signing.module] });
    expect(admission.moduleSupport?.payloadSchemaResources).toEqual(await loadCanonicalModulePayloadSchemaResources());
    expect(admission.moduleSupport?.payloadValidators).toBeUndefined();
    expect((await producer.mock.results[0].value).moduleResolutionReport.ok).toBe(true);
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    expect(test.requests.some(request => request.url.includes('sessions/anonymous'))).toBe(false);
    const response = { ...sampleFormResponse, id: generateIdempotencyKey(), definitionUrl: test.definition.url, definitionVersion: test.definition.version, status: 'in-progress' as const };
    const saveAction = test.document.actions.find(action => action.id === test.signing.roles.saveInitial.actionRef)!;
    const saveGuard = vi.fn();
    await boot.composition.responseSigning!.saveDraft({ formId: test.publication.form_id,
      draftKey: { formUrl: test.definition.url, formVersion: test.definition.version }, definition: test.definition,
      formVersionId: test.publication.form_version_id, response, operationId: generateIdempotencyKey(),
      action: { ...test.signing.roles.saveInitial, document: test.document, artifactDigest: await computeJcsSha256Digest(test.document),
        requestRef: (saveAction.effects[0] as { requestRef: string }).requestRef } }, { assertBeforeDispatch: saveGuard });
    expect(saveGuard).toHaveBeenCalledTimes(2);
    const creates = test.requests.filter(request => request.method === 'POST' && request.url.endsWith('/drafts'));
    expect(creates).toHaveLength(1); expect((creates[0].body as { canonical_response: FormResponse }).canonical_response.id).toBe(response.id);
    expect(await boot.composition.draftStore.load({ formUrl: test.definition.url, formVersion: test.definition.version })).toEqual(response);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prepareAction = test.document.actions.find(action => action.id === test.signing.roles.prepare.actionRef)!;
    await expect(boot.composition.responseSigning!.prepare({
      draftKey: { formUrl: test.definition.url, formVersion: test.definition.version }, definition: test.definition,
      formVersionId: test.publication.form_version_id, response, source: { ref: 'unused', version: 'unused' }, locale: 'en',
      action: { ...test.signing.roles.prepare, document: test.document, artifactDigest: await computeJcsSha256Digest(test.document),
        requestRef: (prepareAction.effects[0] as { requestRef: string }).requestRef },
    })).rejects.toThrow('Preparation requires a completed unsigned pinned Response');
    expect(warn).toHaveBeenCalledExactlyOnceWith('Native form action failed',
      JSON.stringify({ stage: 'prepare-port', reason: 'candidate-invalid' }));
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

  it.each(['qualified', 'wrong-publication', 'anonymous'] as const)('qualifies lifecycle capabilities through the native loader: %s', async mode => {
    const test = await fixture('oidc:fixture', true);
    if (mode === 'wrong-publication') test.capabilities.formVersionId = 'different';
    const claim = { provider: 'https://idp.test', adapter: 'oidc-client-ts', subjectRef: 'oidc:fixture',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L2' as const };
    const provider = { discover: async () => [], authenticate: async () => claim, revoke: async () => {}, subscribe: () => () => {} };
    const config = { ...test.config, ports: { ...test.config.ports, identityProvider: 'oidc' as const }, identity: { mode: 'oidc-required' as const,
      oidc: { issuer: claim.provider, clientId: 'fixture', redirectUri: '/callback', minAssurance: 'L2' as const } } };
    const session = { issuer: claim.provider, subject: 'fixture', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
    const browserAuthSession = { getSession: async () => session, begin: async () => {}, completeCallback: async () => session,
      completeSilentCallback: async () => {}, renew: async () => session, logout: async () => {}, completeLogoutCallback: async () => {},
      accessToken: async () => 'oidc-bearer', subscribe: () => () => {}, dispose: () => {} };
    const composition = createDefaultComposition(mode === 'anonymous' ? test.config : config, { packageUrl: '/package.json', initialDefinitionUrl,
      ...(mode !== 'anonymous' ? { identityBinding: { provider, accessToken: async () => 'oidc-bearer', browserAuthSession } } : {}) });
    if (mode === 'qualified') {
      const boot = await composition.nativePackageRespondent!.load();
      expect(boot.host.applicationCapabilities).toEqual(test.capabilities); boot.host.dispose();
    } else await expect(composition.nativePackageRespondent!.load()).rejects.toThrow();
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    const request = test.requests.find(request => request.url.endsWith('/application-lifecycle'));
    if (mode !== 'anonymous') {
      expect(request?.headers.get('authorization')).toBe('Bearer oidc-bearer');
      expect(request?.headers.get('x-stack-scope-key')).toBe(testScopeKey);
    }
  });
  it.each(['read-failure', 'newer-subscription'] as const)('reconciles native auth setup with %s', async mode => {
    // The complete studio package: a native Screener is admitted only with a screener slot on its entry Surface.
    const test = await completeStudioFixture(true, 'oidc:fixture');
    const selected = await hydrationFixture();
    const release = vi.fn();
    const session = { issuer: 'https://idp.test', subject: 'fixture', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
    let onSession!: (state: BrowserAuthSessionState | null) => void;
    const browserAuthSession = { getSession: vi.fn(async () => {
      if (mode === 'read-failure') throw new Error('session read failed');
      onSession({ ...session, revision: 2 });
      return { ...session, issuer: 'https://stale-issuer.test', revision: 1 };
    }), begin: async () => {},
      completeCallback: async () => session, completeSilentCallback: async () => {}, renew: async () => session,
      logout: async () => {}, completeLogoutCallback: async () => {}, accessToken: async () => 'oidc-bearer',
      subscribe: vi.fn((listener: (state: BrowserAuthSessionState | null) => void) => { onSession = listener; return release; }), dispose: () => {} };
    const provider = { discover: vi.fn(async () => []), authenticate: vi.fn(), revoke: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) };
    const config = { ...test.config, ports: { ...test.config.ports, identityProvider: 'oidc' as const }, identity: {
      mode: 'oidc-required' as const, oidc: { issuer: session.issuer, clientId: 'fixture', redirectUri: '/callback', minAssurance: 'L2' as const } } };
    const composition = createDefaultComposition(config, { ...test.options,
      identityBinding: { provider, accessToken: async () => 'oidc-bearer', browserAuthSession } });
    if (mode === 'read-failure') await expect(composition.nativePackageRespondent!.load()).rejects.toThrow('session read failed');
    else {
      const boot = await composition.nativePackageRespondent!.load();
      // A stale initial read has a different issuer and would fail before retained-run lookup.
      await expect(boot.host.preSignCandidate!({ saved: selected.input.saved, operationId: 'act', assertCurrent() {} })).rejects.toThrow('retained run unavailable');
      const retire = vi.spyOn(boot.host, 'retireCandidateAuthority');
      onSession({ ...session, revision: 3 });
      expect(retire).toHaveBeenCalledOnce();
      expect(boot.host.getSnapshot().nativeReadiness).toBe('pending');
      boot.host.dispose();
    }
    expect(browserAuthSession.subscribe).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
  });

  it.each(['current', 'disposed', 'account-change'] as const)('preserves selected OIDC identity and resumes a known owned native checkpoint with %s boot lifetime', async lifetime => {
    const test = await fixture('oidc:fixture');
    const nativePolicy = vi.spyOn(nativeHostModule, 'createNativePackageSigningHost');
    const claim = { provider: 'https://idp.test', adapter: 'oidc-client-ts', subjectRef: 'oidc:fixture',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L2' as const };
    const provider = { discover: vi.fn(async () => [{ kind: 'oidc' as const, issuer: claim.provider, displayName: 'Sign in', minAssurance: 'L2' as const }]),
      authenticate: vi.fn(async () => claim), revoke: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) };
    const session = { issuer: claim.provider, subject: 'fixture', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
    let authListener: ((state: BrowserAuthSessionState | null) => void) | undefined;
    const browserAuthSession = { getSession: vi.fn(async () => session), begin: async () => {},
      completeCallback: async () => session, completeSilentCallback: async () => {}, renew: async () => session,
      logout: async () => {}, completeLogoutCallback: async () => {}, accessToken: async () => 'oidc-bearer',
      subscribe: (listener: (state: BrowserAuthSessionState | null) => void) => { authListener = listener; return () => { authListener = undefined; }; }, dispose: () => {} };
    const identityBinding: IdentityBinding = { provider, accessToken: vi.fn(async () => 'oidc-bearer'), browserAuthSession };
    const config = { ...test.config, scopeKey: otherScopeKey, ports: { ...test.config.ports, identityProvider: 'oidc' as const }, identity: { mode: 'oidc-required' as const, oidc: {
      issuer: claim.provider, clientId: 'fixture', redirectUri: '/callback', minAssurance: 'L2' as const,
    } } };
    const options = { packageUrl: '/package.json', initialDefinitionUrl, identityBinding };
    const boot = await createDefaultComposition(config, options).nativePackageRespondent!.load();
    const runtime = test.requests.find(request => request.url.endsWith('/runtime/forms/actual-form'))!;
    expect(runtime.headers.get('authorization')).toBe('Bearer oidc-bearer');
    expect(runtime.headers.get('x-stack-scope-key')).toBe(otherScopeKey);
    expect(boot.composition.identityProvider).toBe(provider); expect(boot.composition.browserAuthSession).toBe(browserAuthSession);
    const key = { formUrl: test.definition.url, formVersion: test.definition.version, subjectRef: claim.subjectRef };
    const response = { ...sampleFormResponse, id: generateIdempotencyKey(), definitionUrl: test.definition.url, definitionVersion: test.definition.version };
    await boot.composition.draftStore.save(key, response); boot.host.dispose();
    const create = test.requests.find(request => request.method === 'POST' && request.url.endsWith('/drafts'))!;
    expect(create.headers.get('authorization')).toBe('Bearer oidc-bearer');
    expect(create.body).toMatchObject({ respondent_subject_ref: claim.subjectRef });
    test.values.clear(); test.setDraft(response, 'in_progress', 7);
    const count = test.requests.length;
    const fresh = await createDefaultComposition(config, { ...options, ownedDraftResume: { draftId: 'fixture-draft', expectedResponseId: response.id! } }).nativePackageRespondent!.load();
    if (lifetime !== 'current') {
      let release!: () => void; test.setDraftReadGate(new Promise<void>(resolve => { release = resolve; }));
      const pending = fresh.resumeSubmitted!();
      await vi.waitFor(() => expect(test.requests.slice(count).some(request => request.url.endsWith('/drafts/fixture-draft'))).toBe(true));
      if (lifetime === 'disposed') fresh.host.dispose();
      else { expect(authListener).toBeTypeOf('function'); authListener!({ ...session, subject: 'another-owner', revision: 2 }); }
      release();
      await expect(pending).rejects.toThrow();
      expect([...test.values.keys()].some(key => key.includes('draft-handles'))).toBe(false);
      expect(test.requests.slice(count).every(request => request.method === 'GET')).toBe(true);
      fresh.host.dispose(); return;
    }
    await expect(fresh.resumeSubmitted!()).resolves.toBe('active');
    const restored = await fresh.composition.draftStore.readState!(key);
    expect(restored?.kind).toBe('active');
    if (restored?.kind !== 'active' || !restored.savedDraft) throw new Error('Expected owned native checkpoint');
    expect(restored.savedDraft.draft).toMatchObject({ id: 'fixture-draft', version: 7 });
    expect(restored.response).toEqual(response);
    const policy = nativePolicy.mock.calls.at(-1)![0];
    expect(() => policy.assertOwner(key, claim.subjectRef)).not.toThrow();
    expect(() => policy.assertOwner(key, 'another-owner')).toThrow();
    const engine = createFormEngine(test.definition); engine.loadResponseData(restored.response.data as Parameters<typeof engine.loadResponseData>[0]);
    const lease = await fresh.host.configureRuntime({ engine, definition: test.definition, draftKey: key, claim, activeLocale: 'en',
      restoredResponse: restored.response, restoredSavedDraft: restored.savedDraft });
    expect(fresh.host.getSnapshot().controller).toMatchObject({ owned: true, saved: restored.savedDraft });
    expect(test.requests.slice(count).every(request => request.method === 'GET')).toBe(true);
    expect(test.requests.at(-1)!.headers.get('authorization')).toBe('Bearer oidc-bearer');
    lease.dispose(); engine.dispose();
    expect(test.requests.some(request => request.url.endsWith('/sessions/anonymous'))).toBe(false);
    fresh.host.dispose();
  });

  it.each(['definition', 'bundle', 'publication'] as const)('refuses %s pin/content mismatch before credentials or writes', async field => {
    const test = await fixture();
    if (field === 'publication') test.publication.definition.title = 'Altered';
    const config = field === 'publication' ? test.config : resolveActiveConfig(test.config, { nativePackageSigning: nativePackageSigningConfig({
      ...test.signing, [field]: { ...test.signing[field], version: 'wrong' },
    }) });
    const composition = createDefaultComposition(config, { packageUrl: '/package.json', initialDefinitionUrl });
    await expect(composition.nativePackageRespondent!.load()).rejects.toThrow();
    await expect(composition.nativePackageRespondent!.load()).rejects.toMatchObject({ stage: field === 'publication' ? 'publication' : 'package' });
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    expect(test.requests.some(request => request.url.includes('sessions/anonymous'))).toBe(false);
  });
});


describe('trusted native Screener completion DI', () => {
  it('snapshots the explicit policy across default composition and deferred package admission', async () => {
    const test = await fixture();
    const complete = vi.fn(() => ({ status: 'refused' as const, reason: 'not-ready' }));
    const policy = { mode: 'host-required' as const, selectionKey: 'original-selection', complete };
    const composition = createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl, screenerCompletion: policy });
    policy.selectionKey = 'changed-selection';
    policy.complete = vi.fn(() => ({ status: 'refused' as const, reason: 'changed-callback' }));
    const boot = await composition.nativePackageRespondent!.load();
    expect(boot.screenerCompletion).toEqual({ mode: 'host-required', selectionKey: 'original-selection', complete });
    expect(Object.isFrozen(boot.screenerCompletion)).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });

  it('preserves omitted completion policy through normal package admission', async () => {
    const test = await fixture();
    const boot = await createDefaultComposition(test.config, { packageUrl: '/package.json', initialDefinitionUrl }).nativePackageRespondent!.load();
    expect(boot.screenerCompletion).toBeUndefined();
  });
});

async function correctionFixture(taskRequest = true) {
  const test = await fixture('oidc:task');
  const state = { issuer: 'https://idp.test', subject: 'task-owner', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
  let listener!: (value: BrowserAuthSessionState | null) => void;
  const release = vi.fn();
  const browserAuthSession = { getSession: vi.fn(async () => state), begin: async () => {}, completeCallback: async () => state,
    completeSilentCallback: async () => {}, renew: async () => state, logout: async () => {}, completeLogoutCallback: async () => {},
    accessToken: async () => 'task-token', subscribe: vi.fn((next: typeof listener) => { listener = next; return release; }), dispose: () => {} };
  const provider = { discover: vi.fn(async () => []), authenticate: vi.fn(), revoke: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) };
  const config = { ...test.config, ports: { ...test.config.ports, identityProvider: 'oidc' as const }, identity: {
    mode: 'oidc-required' as const, oidc: { issuer: state.issuer, clientId: 'task-client', redirectUri: '/callback', minAssurance: 'L2' as const } } };
  const processId = 'urn:wos:default_process_01hw7rm71vfay8vvw14d2pf2db';
  const taskId = `${processId}/tasks/correction`;
  if (taskRequest) {
    const submit = test.document.actions.find(action => action.id === 'submit')!;
    const effect = submit.effects![0];
    if (effect.type !== 'serviceRequest') throw new Error('Expected fixture submit request');
    const request = test.document['x-formspec-runtime']!.requests.find(request => request.id === effect.requestRef)!;
    request.request = { method: 'POST', pathTemplate: '/api/v1/tasks/{taskId}/response',
      pathBindings: { taskId: { from: 'input', path: 'taskId' } },
      bodyDefaults: { definitionUrl: test.definition.url, definitionVersion: test.definition.version },
      bodyBindings: { '/response': { from: 'input', path: 'frozenResponse' }, '/signedDraft': { from: 'input', path: 'signedDraft' } } };
    request.outputs = { task: { path: '/taskId', exposure: 'transition' }, status: { path: '/newStatus', exposure: 'internal' } };
    test.texts['native.json'] = JSON.stringify(test.bundle);
    test.files.nativeBundle.sha256 = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(test.texts['native.json'])))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const response = { ...sampleFormResponse, id: generateIdempotencyKey(), definitionUrl: test.definition.url,
    definitionVersion: test.definition.version, status: 'in-progress' as const, data: {} };
  const launched = { draft_id: 'task-draft', draft_version: 1, subject_ref: 'oidc:task', form_version_id: test.publication.form_version_id,
    canonical_response: response, draft_state: response.data, status: 'in_progress',
    taskDraft: { version: 1, associationHash: `sha256:${'b'.repeat(64)}`, taskBindingHash: `sha256:${'c'.repeat(64)}` } };
  const ordinaryFetch = test.fetch.getMockImplementation()!;
  test.fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/runtime/task-drafts') {
      test.requests.push({ url: url.href, method: init?.method ?? 'GET', body: JSON.parse(init!.body as string), headers: new Headers(init?.headers) });
      return Response.json(launched);
    }
    return ordinaryFetch(input, init);
  });
  const options = { packageUrl: '/package.json', initialDefinitionUrl, identityBinding: { provider, accessToken: async () => 'task-token', browserAuthSession },
    nativeTask: { launch: { version: 1 as const, taskId, expectedTaskRevision: 'actual-task-revision',
      formVersionId: test.publication.form_version_id, formVersionHash: `sha256:${'a'.repeat(64)}` },
      completion: { taskId, processId, definitionUrl: test.definition.url, definitionVersion: test.definition.version },
      launchOperationId: 'stable-task-launch', subjectRef: 'oidc:task',
      wos: { scopeKey: otherScopeKey, baseUrl: 'https://wos.test', accessToken: 'wos-token' }, assertCurrentWos: vi.fn(),
      hydration: { selection: { scope: testScopeKey,
        formId: test.publication.form_id, formVersionId: test.publication.form_version_id, definitionUrl: test.definition.url,
        definitionVersion: test.definition.version, definitionHash: test.publication.definition_hash,
        requiredSources: Object.values(test.definition.instances ?? {}).flatMap(instance => typeof instance.source === 'string' ? [instance.source] : []) },
        identity: { issuer: state.issuer, subject: state.subject, clientId: 'task-client' } },
      attachmentFieldPaths: { photo: '/photo' } } };
  return { test, config, options, launched, release, retire: () => listener({ ...state, revision: 2 }) };
}

describe('explicit correction host through the maintained native loader', () => {
  it.each(['after-construction', 'during-signing-options', 'during-session-callback', 'during-wos-settings-accessor'] as const)(
    'retains independent Source and WOS requests with mutation %s', async mode => {
      const f = await correctionFixture();
      const host = vi.spyOn(nativeHostModule, 'createNativePackageSigningHost');
      const fetch = f.test.fetch.getMockImplementation()!;
      f.test.fetch.mockImplementation(async (input, init) => {
        if (new URL(String(input)).pathname === '/drafts/task-draft') {
          f.test.requests.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers) });
          return Response.json(f.launched);
        }
        return fetch(input, init);
      });
      const wosRequests: RequestInit[] = [];
      Object.assign(f.options.nativeTask.wos, { fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
        wosRequests.push(init!);
        return Response.json({ taskId: f.options.nativeTask.completion.taskId, processId: f.options.nativeTask.completion.processId,
          outcome: 'completed', newStatus: 'submitted', occurredAt: '2026-10-18T12:00:00Z' });
      } });
      const mutate = () => { f.config.scopeKey = otherScopeKey; f.options.nativeTask.wos.scopeKey = testScopeKey; };
      if (mode === 'during-wos-settings-accessor') Object.defineProperty(f.options.nativeTask.wos, 'accessToken', {
        enumerable: true, get() { mutate(); return 'wos-token'; } });
      let composition;
      if (mode === 'during-signing-options') {
        const options = { ...f.options, signing: f.test.signing };
        Object.defineProperty(options, 'signing', { enumerable: true, get() { mutate(); return f.test.signing; } });
        composition = createNativePackageComposition(f.config, options);
      } else {
        if (mode === 'during-session-callback') {
          const subscribe = f.options.identityBinding.browserAuthSession.subscribe.getMockImplementation()!;
          f.options.identityBinding.browserAuthSession.subscribe.mockImplementation(listener => { mutate(); return subscribe(listener); });
        }
        composition = createDefaultComposition(f.config, f.options);
      }
      mutate();
      const boot = await composition.nativePackageRespondent!.load();
      try {
        await boot.composition.draftStore.load({ formUrl: f.test.definition.url, formVersion: f.test.definition.version, subjectRef: 'oidc:task' });
        const completion = host.mock.calls.at(-1)![0].controller.completion!;
        const lifetime = { signal: new AbortController().signal, assertCurrent() {} };
        const input = taskCompletionFixture({ ...sampleFormResponse, definitionUrl: f.test.definition.url, definitionVersion: f.test.definition.version });
        const prepared = await completion.capture(input, lifetime);
        await completion.complete(prepared, 'independent-native-completion', lifetime);
        const requests = f.test.requests.filter(request => new URL(request.url).origin === 'https://server.example.test');
        expect(requests.length).toBeGreaterThan(1);
        for (const request of requests) expect(request.headers.get('x-stack-scope-key')).toBe(testScopeKey);
        expect(wosRequests).toHaveLength(1);
        expect(new Headers(wosRequests[0].headers).get('x-stack-scope-key')).toBe(otherScopeKey);
      } finally { boot.host.dispose(); }
    });

  it.each(['source', 'wos'] as const)('refuses missing or malformed native %s scope before package I/O', async service => {
    for (const scopeKey of [undefined, null, '', 'A'.repeat(64), 'a'.repeat(63), 17]) {
      const f = await correctionFixture();
      Object.assign(service === 'source' ? f.config : f.options.nativeTask.wos, { scopeKey });
      expect(() => createDefaultComposition(f.config, f.options)).toThrow('scope key');
      expect(f.test.requests).toHaveLength(0);
      expect(f.options.identityBinding.browserAuthSession.getSession).not.toHaveBeenCalled();
      expect(f.options.identityBinding.browserAuthSession.subscribe).not.toHaveBeenCalled();
    }
  });

  it.each(['unmount', 'session-retirement'] as const)('keeps the latest task hydration alive across asynchronous renderer restoration until %s', async retirement => {
    const f = await correctionFixture();
    f.test.definition.instances!.facts = { source: 'urn:test:external', readonly: true };
    f.test.texts['definition.json'] = JSON.stringify(f.test.definition);
    f.test.files.definition.sha256 = await rawDigest(f.test.texts['definition.json']);
    f.test.texts['native.json'] = JSON.stringify(f.test.bundle);
    f.test.files.nativeBundle.sha256 = await rawDigest(f.test.texts['native.json']);
    f.test.publication.definition = structuredClone(f.test.definition);
    f.test.publication.definition_hash = await computeJcsSha256Digest(f.test.definition);
    f.options.nativeTask.hydration.selection.definitionHash = f.test.publication.definition_hash;
    f.options.nativeTask.hydration.selection.requiredSources = ['urn:test:external'];
    const seed = createFormEngine(f.test.definition);
    seed.setValue('fullName', 'Retained task respondent');
    const response = seed.getResponse({ profile: 'off', id: f.launched.canonical_response.id }); seed.dispose();
    // Missing saved Locale makes the configured Locale settle during restoration.
    expect(response.displayedLocale).toBeUndefined();
    Object.assign(f.launched, { canonical_response: response, draft_state: response.data });
    const claim = { provider: 'https://idp.test', adapter: 'oidc-client-ts', subjectRef: 'oidc:task',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L2' as const };
    Object.assign(f.options.identityBinding.provider, {
      discover: async () => [{ kind: 'oidc' as const, issuer: claim.provider, displayName: 'Sign in', minAssurance: 'L2' as const }],
      authenticate: async () => claim,
      subscribe: (listener: (value: typeof claim) => void) => { listener(claim); return () => {}; },
    });
    const sessionListeners = new Set<(value: BrowserAuthSessionState | null) => void>();
    f.options.identityBinding.browserAuthSession.subscribe.mockImplementation(next => {
      sessionListeners.add(next); return vi.fn(() => { sessionListeners.delete(next); });
    });
    const previousFetch = f.test.fetch.getMockImplementation()!;
    const evaluations: AbortSignal[] = [];
    f.test.fetch.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/drafts/task-draft' && (init?.method ?? 'GET') === 'GET') return Response.json(f.launched);
      if (path === '/drafts/task-draft/evaluation-instances') {
        evaluations.push(init!.signal!);
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
        });
      }
      if ((init?.method ?? 'GET') !== 'GET' && path !== '/runtime/task-drafts') throw new Error('Unexpected business write');
      return previousFetch(input, init);
    });
    const { HttpTaskCandidateHydration } = await import('../../src/adapters/http/task-candidate-hydration.ts');
    const qualify = vi.spyOn(HttpTaskCandidateHydration.prototype, 'qualifySaved');
    const composition = createDefaultComposition(f.config, f.options);
    const route = dereferenceBundleExport(f.test.bundle).surfaces.flatMap(surface => surface.routes)
      .find(route => route.slots?.some(slot => slot.slotType === 'definition-form'))!;
    window.history.replaceState(null, '', route.path!);
    const mounted = render(createElement(NativePackageRuntime, { composition, config: f.config }));
    let boot: Awaited<ReturnType<NonNullable<typeof composition.nativePackageRespondent>['load']>> | undefined;
    try {
      boot = await composition.nativePackageRespondent!.load();
      await screen.findByRole('textbox', { name: /full legal name/i });
      await vi.waitFor(() => expect(evaluations.length).toBeGreaterThan(0));
      // The superseded-renderer race would abort the latest hydration once the second configureRuntime
      // retires runtime 1; both qualification passes having dispatched means that point has passed.
      await vi.waitFor(() => {
        expect(qualify.mock.calls.length).toBeGreaterThan(1);
        expect(evaluations.filter(signal => !signal.aborted)).toHaveLength(1);
      });
      expect(evaluations.at(-1)!.aborted).toBe(false);
      expect(boot.host.getSnapshot().controller?.saved?.response.data).toEqual(response.data);
      expect(boot.host.getSnapshot().nativeReadiness).toBe('pending');
      expect(boot.host.getSnapshot().controller?.prepared).toBeUndefined();
      if (retirement === 'unmount') mounted.unmount(); else for (const listener of [...sessionListeners]) listener(null);
      await vi.waitFor(() => expect(evaluations.every(signal => signal.aborted)).toBe(true));
    } finally { mounted.unmount(); boot?.host.dispose(); window.history.replaceState(null, '', '/'); }
  });

  it('saves a task checkpoint with no displayed Locale through the real Save control', async () => {
    const f = await correctionFixture();
    f.test.definition.instances!.facts = { source: 'urn:test:external', readonly: true };
    f.test.texts['definition.json'] = JSON.stringify(f.test.definition);
    f.test.files.definition.sha256 = await rawDigest(f.test.texts['definition.json']);
    f.test.texts['native.json'] = JSON.stringify(f.test.bundle);
    f.test.files.nativeBundle.sha256 = await rawDigest(f.test.texts['native.json']);
    f.test.publication.definition = structuredClone(f.test.definition);
    f.test.publication.definition_hash = await computeJcsSha256Digest(f.test.definition);
    f.options.nativeTask.hydration.selection.definitionHash = f.test.publication.definition_hash;
    f.options.nativeTask.hydration.selection.requiredSources = ['urn:test:external'];
    const seed = createFormEngine(f.test.definition);
    seed.setValue('fullName', 'Retained task respondent');
    const response = seed.getResponse({ profile: 'off', id: f.launched.canonical_response.id }); seed.dispose();
    // Missing saved Locale makes the configured Locale settle during restoration.
    expect(response.displayedLocale).toBeUndefined();
    Object.assign(f.launched, { canonical_response: response, draft_state: response.data });
    const claim = { provider: 'https://idp.test', adapter: 'oidc-client-ts', subjectRef: 'oidc:task',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L2' as const };
    Object.assign(f.options.identityBinding.provider, {
      discover: async () => [{ kind: 'oidc' as const, issuer: claim.provider, displayName: 'Sign in', minAssurance: 'L2' as const }],
      authenticate: async () => claim,
      subscribe: (listener: (value: typeof claim) => void) => { listener(claim); return () => {}; },
    });
    const sessionListeners = new Set<(value: BrowserAuthSessionState | null) => void>();
    f.options.identityBinding.browserAuthSession.subscribe.mockImplementation(next => {
      sessionListeners.add(next); return vi.fn(() => { sessionListeners.delete(next); });
    });
    const previousFetch = f.test.fetch.getMockImplementation()!;
    const evaluations: AbortSignal[] = [];
    const patches: { draft_state: unknown; canonical_response: FormResponse; expected_draft_version: number }[] = [];
    f.test.fetch.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/drafts/task-draft' && init?.method === 'PATCH') {
        const patch = JSON.parse(init.body as string); patches.push(patch);
        Object.assign(f.launched, { draft_version: f.launched.draft_version + 1, canonical_response: patch.canonical_response, draft_state: patch.draft_state });
        return Response.json(f.launched);
      }
      if (path === '/drafts/task-draft' && (init?.method ?? 'GET') === 'GET') return Response.json(f.launched);
      if (path === '/drafts/task-draft/evaluation-instances') {
        evaluations.push(init!.signal!);
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
        });
      }
      if ((init?.method ?? 'GET') !== 'GET' && path !== '/runtime/task-drafts') throw new Error('Unexpected business write');
      return previousFetch(input, init);
    });
    const { HttpTaskCandidateHydration } = await import('../../src/adapters/http/task-candidate-hydration.ts');
    const qualify = vi.spyOn(HttpTaskCandidateHydration.prototype, 'qualifySaved');
    const composition = createDefaultComposition(f.config, f.options);
    const route = dereferenceBundleExport(f.test.bundle).surfaces.flatMap(surface => surface.routes)
      .find(route => route.slots?.some(slot => slot.slotType === 'definition-form'))!;
    window.history.replaceState(null, '', route.path!);
    const boot = await composition.nativePackageRespondent!.load();
    const configured = vi.spyOn(boot.host, 'configureRuntime');
    const mounted = render(createElement(NativePackageRuntime, { composition, config: f.config }));
    try {
      await screen.findByRole('textbox', { name: /full legal name/i });
      await vi.waitFor(() => expect(evaluations.length).toBeGreaterThan(0));
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(evaluations.at(-1)!.aborted).toBe(false);
      const photo = { kind: 'attachment-ref', uri: 'urn:formspec:attachment:staged-neutral-photo', filename: 'neutral.png',
        contentType: 'image/png', mimeType: 'image/png', size: 1, hash: `sha256:${'d'.repeat(64)}` };
      configured.mock.calls.at(-1)![0].engine.setValue('photo', photo);
      expect(boot.host.getSnapshot().locale).toBe('');
      const savedBefore = structuredClone(response.data);
      // The missing Locale leaves authored labels empty; the first admitted ActionButton is SaveOwned.
      const save = mounted.container.querySelector<HTMLButtonElement>('button.formspec-action')!;
      expect(save).not.toBeNull();
      fireEvent.click(save);
      await vi.waitFor(() => expect(boot.host.getSnapshot().controller?.phase).toBe('saved'));
      await vi.waitFor(() => expect(patches).toHaveLength(1));
      expect(patches[0].expected_draft_version).toBe(1);
      expect(patches[0].draft_state).toEqual({ ...savedBefore, photo });
      expect(patches[0].canonical_response.data).toEqual({ ...savedBefore, photo });
      expect(f.launched.draft_version).toBe(2);
      expect(boot.host.getSnapshot().controller?.saved?.draft.version).toBe(2);
      expect(boot.host.getSnapshot().controller?.saved?.response.data).toEqual({ ...savedBefore, photo });
      expect(boot.host.getSnapshot().controller?.prepared).toBeUndefined();
      expect(boot.host.getSnapshot().controller?.signed).toBeUndefined();
      expect(qualify).toHaveBeenCalled();
    } finally { mounted.unmount(); boot?.host.dispose(); window.history.replaceState(null, '', '/'); }
  });

  it.each(['pending', 'qualified'] as const)('preserves declared task prefill through Save with %s correction facts', async mode => {
    const f = await correctionFixture();
    const { hydrationFixture } = await import('../adapters/http/screener-hydration-fixture.ts');
    const hydration = await hydrationFixture();
    Object.assign(f.options.nativeTask.hydration, { receiptVerifier: { verify: async () => ({ validForMilliseconds: 60_000 }) } });
    f.test.definition.binds!.push({ path: 'protectedRef', readonly: 'true', relevant: "@instance('facts').posture = 'correction'" });
    f.test.definition.items.push({ key: 'protectedRef', type: 'field', dataType: 'uri', label: 'Protected reference' });
    f.test.definition.instances!.facts = { source: 'urn:test:external', readonly: true };
    f.test.texts['definition.json'] = JSON.stringify(f.test.definition);
    f.test.files.definition.sha256 = await rawDigest(f.test.texts['definition.json']);
    f.test.texts['native.json'] = JSON.stringify(f.test.bundle);
    f.test.files.nativeBundle.sha256 = await rawDigest(f.test.texts['native.json']);
    f.test.publication.definition = structuredClone(f.test.definition);
    f.test.publication.definition_hash = await computeJcsSha256Digest(f.test.definition);
    f.options.nativeTask.hydration.selection.definitionHash = f.test.publication.definition_hash;
    f.options.nativeTask.hydration.selection.requiredSources = ['urn:test:external'];
    const seed = createFormEngine(f.test.definition);
    if (mode === 'qualified') {
      for (const document of Object.values(f.test.bundle.documents)) if (document && typeof document === 'object' && '$formspecLocale' in document) seed.loadLocale(document as LocaleDocument);
      seed.setLocale('en');
      for (const [key, value] of Object.entries({ renewalEligible: true, fullName: 'Neutral respondent', dateOfBirth: '1990-01-01', placeOfBirth: 'Neutral place', email: 'neutral@example.test', mailingAddress: 'Neutral address', priorPassportNumber: '000000000', priorPassportIssueDate: '2020-01-01', ssnIssued: false, neverIssuedStatement: 'Never issued', declarationAcknowledged: true })) seed.setValue(key, value);
    } else seed.setValue('fullName', 'Retained task respondent');
    const response = seed.getResponse({ profile: 'off', id: f.launched.canonical_response.id }); seed.dispose();
    response.data.protectedRef = 'urn:test:protected';
    Object.assign(f.launched.taskDraft, { taskPrefill: { version: 1, editableDataPaths: ['/photo'], readOnlyDataPaths: f.test.definition.items.filter(item => item.type === 'field' && item.key !== 'photo').map(item => '/' + item.key) } });
    // Missing saved Locale makes the configured Locale settle during restoration.
    if (mode === 'pending') expect(response.displayedLocale).toBeUndefined();
    Object.assign(f.launched, { canonical_response: response, draft_state: response.data });
    const claim = { provider: 'https://idp.test', adapter: 'oidc-client-ts', subjectRef: 'oidc:task',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L2' as const };
    Object.assign(f.options.identityBinding.provider, {
      discover: async () => [{ kind: 'oidc' as const, issuer: claim.provider, displayName: 'Sign in', minAssurance: 'L2' as const }],
      authenticate: async () => claim,
      subscribe: (listener: (value: typeof claim) => void) => { listener(claim); return () => {}; },
    });
    const sessionListeners = new Set<(value: BrowserAuthSessionState | null) => void>();
    f.options.identityBinding.browserAuthSession.subscribe.mockImplementation(next => {
      sessionListeners.add(next); return vi.fn(() => { sessionListeners.delete(next); });
    });
    const previousFetch = f.test.fetch.getMockImplementation()!;
    const evaluations: AbortSignal[] = [];
    const patches: { draft_state: unknown; canonical_response: FormResponse; expected_draft_version: number }[] = [];
    f.test.fetch.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/drafts/task-draft' && init?.method === 'PATCH') {
        const patch = JSON.parse(init.body as string); patches.push(patch);
        if (patch.canonical_response.data.protectedRef !== response.data.protectedRef) return Response.json({ detail: 'Protected task prefill differs' }, { status: 409 });
        Object.assign(f.launched, { draft_version: f.launched.draft_version + 1, canonical_response: patch.canonical_response, draft_state: patch.draft_state });
        return Response.json(f.launched);
      }
      if (path === '/drafts/task-draft' && (init?.method ?? 'GET') === 'GET') return Response.json(f.launched);
      if (path === '/drafts/task-draft/evaluation-instances') {
        evaluations.push(init!.signal!);
        if (mode === 'qualified') {
          const selection = f.options.nativeTask.hydration.selection;
          const owner = { ...hydration.view.owner, subjectRef: 'oidc:task', authenticated: { ...hydration.view.owner.authenticated!, subjectRef: 'oidc:task', issuer: 'https://idp.test', subject: 'task-owner', clientId: 'task-client' } };
          const request = { operation: 'hydrate', scope: selection.scope, owner, selection, formVersionHash: f.options.nativeTask.launch.formVersionHash, draftId: f.launched.draft_id, draftVersion: f.launched.draft_version, candidateHash: await computeJcsSha256Digest(f.launched.canonical_response), sources: { facts: 'urn:test:external' } };
          const data = { posture: 'correction' };
          return Response.json({ ...hydration.view, ...request, requestHash: await computeJcsSha256Digest(request), providerReceipt: f.launched.draft_version > 1 ? hydration.view.providerReceipt : null, results: f.launched.draft_version > 1 ? [{ ...hydration.view.results[0], status: 'qualified', instanceName: 'facts', sourceRef: 'urn:test:external', data, dataHash: await computeJcsSha256Digest(data) }] : [{ status: 'pending', instanceName: 'facts', sourceRef: 'urn:test:external', reason: 'task-origin-unavailable' }] }, { headers: { 'cache-control': 'no-store' } });
        }
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
        });
      }
      if ((init?.method ?? 'GET') !== 'GET' && path !== '/runtime/task-drafts') throw new Error('Unexpected business write');
      return previousFetch(input, init);
    });
    const { HttpTaskCandidateHydration } = await import('../../src/adapters/http/task-candidate-hydration.ts');
    const qualify = vi.spyOn(HttpTaskCandidateHydration.prototype, 'qualifySaved');
    const composition = createDefaultComposition(f.config, f.options);
    const route = dereferenceBundleExport(f.test.bundle).surfaces.flatMap(surface => surface.routes)
      .find(route => route.slots?.some(slot => slot.slotType === 'definition-form'))!;
    window.history.replaceState(null, '', route.path!);
    const boot = await composition.nativePackageRespondent!.load();
    let currentEngine!: Parameters<typeof boot.host.configureRuntime>[0]['engine'];
    const configureRuntime = boot.host.configureRuntime.bind(boot.host);
    const configured = vi.spyOn(boot.host, 'configureRuntime').mockImplementation(next => {
      currentEngine = next.engine;
      return configureRuntime({ ...next, exchangeEngine: next.exchangeEngine ? async replacement => {
        const result = await next.exchangeEngine!(replacement); currentEngine = replacement.engine; return result;
      } : undefined });
    });
    const mounted = render(createElement(NativePackageRuntime, { composition, config: f.config }));
    try {
      await vi.waitFor(() => expect(configured).toHaveBeenCalled());
      await screen.findByRole('textbox', { name: /full legal name/i });
      await vi.waitFor(() => expect(evaluations.length).toBeGreaterThan(0));
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(evaluations.at(-1)!.aborted).toBe(false);
      const photo = { kind: 'attachment-ref', uri: 'urn:formspec:attachment:staged-neutral-photo', filename: 'neutral.png',
        contentType: 'image/png', mimeType: 'image/png', size: 1, hash: `sha256:${'d'.repeat(64)}` };
      currentEngine.setValue('photo', photo);
      expect(boot.host.getSnapshot().locale).toBe(mode === 'qualified' ? 'en' : '');
      const savedBefore = structuredClone(response.data);
      // The missing Locale leaves authored labels empty; the first admitted ActionButton is SaveOwned.
      const save = mounted.container.querySelector<HTMLButtonElement>('button.formspec-action')!;
      expect(save).not.toBeNull();
      fireEvent.click(save);
      await vi.waitFor(() => expect(boot.host.getSnapshot().controller?.phase).toBe('saved'));
      await vi.waitFor(() => expect(patches).toHaveLength(1));
      expect(patches[0].expected_draft_version).toBe(1);
      expect(patches[0].draft_state).toEqual({ ...savedBefore, photo });
      expect(patches[0].canonical_response.data).toEqual({ ...savedBefore, photo });
      expect(f.launched.draft_version).toBe(2);
      expect(boot.host.getSnapshot().controller?.saved?.draft.version).toBe(2);
      expect(boot.host.getSnapshot().controller?.saved?.response.data).toEqual({ ...savedBefore, photo });
      expect(boot.host.getSnapshot().controller?.prepared).toBeUndefined();
      expect(boot.host.getSnapshot().controller?.signed).toBeUndefined();
      expect(qualify).toHaveBeenCalled();
      // Real adapter binding checks and engine replacement run; transport and
      // original receipt verification are fixture-owned, not live Source proof.
      if (mode === 'pending') {
        const saved = boot.host.getSnapshot().controller!.saved!;
        await expect(boot.host.prePrepareCandidate!({ saved, response: saved.response, assertCurrent: () => {} })).rejects.toThrow();
        return;
      }
      await vi.waitFor(() => expect(boot.host.getSnapshot().nativeReadiness).toBe('ready'));
      const saved = boot.host.getSnapshot().controller!.saved!;
      await expect(boot.host.prePrepareCandidate!({ saved, response: saved.response, assertCurrent: () => {} })).resolves.toHaveProperty('assertCurrent');
      expect(currentEngine.getResponse({ profile: 'off' }).data.protectedRef).toBe('urn:test:protected');
      fireEvent.click(screen.getByRole('button', { name: /prepare/i }));
      await vi.waitFor(() => expect(boot.host.getSnapshot().controller?.prepared).toBeDefined());
      expect(boot.host.getSnapshot().controller!.prepared!.response.data).toEqual({ ...savedBefore, photo });
      expect(patches).toHaveLength(2);
      const firstPrepared = boot.host.getSnapshot().controller!.prepared!;
      const { draftKey, response: preparedResponse, draft, actor, evidence } = firstPrepared;
      const readback = { draftKey, response: preparedResponse, draft, actor, evidence };
      // Return through the maintained route lifecycle before preparing again.
      // The first Prepare navigates to /review-sign a tick later; wait for it before returning, or it retires the visit.
      await vi.waitFor(() => expect(window.location.pathname).not.toBe(route.path));
      window.history.replaceState(null, '', route.path!);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await screen.findByRole('textbox', { name: /full legal name/i });
      // HTTP readback is a SavedResponseDraft; preparation additionally owns content.
      await vi.waitFor(async () => {
        expect(boot.host.getSnapshot().nativeReadiness).toBe('ready');
        await expect(boot.host.prePrepareCandidate!({ saved: readback, response: preparedResponse, assertCurrent() {} }))
          .resolves.toHaveProperty('assertCurrent');
      });
      fireEvent.click(screen.getByRole('button', { name: /prepare/i }));
      await vi.waitFor(() => expect(boot.host.getSnapshot().controller?.prepared?.draft.version).toBe(firstPrepared.draft.version + 1));
      expect(patches).toHaveLength(3);
      expect(boot.host.getSnapshot().controller!.prepared!.response.data).toEqual(firstPrepared.response.data);
      expect(firstPrepared.content).toBeDefined();
    } finally { mounted.unmount(); boot?.host.dispose(); window.history.replaceState(null, '', '/'); }
  }, 30000);

  it('selects a native-only task without external hydration or initial draft creation', async () => {
    const f = await correctionFixture();
    const boot = await createDefaultComposition(f.config, f.options).nativePackageRespondent!.load();
    expect(boot.host.preSignCandidate).toBeUndefined();
    expect(boot.host.screenerCompletion).toBeUndefined();
    expect(boot.host.getSnapshot().nativeReadiness).not.toBe('pending');
    expect(f.test.requests.some(request => new URL(request.url).pathname.includes('/evaluation-instances'))).toBe(false);
    const launch = f.test.requests.find(request => new URL(request.url).pathname === '/runtime/task-drafts')!;
    expect(launch.body).toEqual(f.options.nativeTask.launch);
    expect(launch.headers.get('authorization')).toBe('Bearer task-token');
    expect(launch.headers.get('idempotency-key')).toBe('stable-task-launch');
    // Source retains its own deployment selection when the WOS namespace differs.
    expect(launch.headers.get('x-stack-scope-key')).toBe(testScopeKey);
    expect(f.test.requests.some(request => request.method === 'POST' && /forms\/.*\/(drafts|sessions\/anonymous)$/.test(new URL(request.url).pathname))).toBe(false);
    f.retire();
    await expect(boot.composition.draftStore.load({ formUrl: f.test.definition.url, formVersion: f.test.definition.version, subjectRef: 'oidc:task' })).rejects.toThrow();
    boot.host.dispose();
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('retains the candidate hydration host for an authored external source', async () => {
    const f = await correctionFixture();
    f.test.definition.instances!.facts = { source: 'urn:test:external', readonly: true };
    f.test.texts['definition.json'] = JSON.stringify(f.test.definition);
    f.test.files.definition.sha256 = await rawDigest(f.test.texts['definition.json']);
    f.test.texts['native.json'] = JSON.stringify(f.test.bundle);
    f.test.files.nativeBundle.sha256 = await rawDigest(f.test.texts['native.json']);
    f.test.publication.definition = structuredClone(f.test.definition);
    f.test.publication.definition_hash = await computeJcsSha256Digest(f.test.definition);
    f.options.nativeTask.hydration.selection.definitionHash = f.test.publication.definition_hash;
    f.options.nativeTask.hydration.selection.requiredSources = ['urn:test:external'];
    const boot = await createDefaultComposition(f.config, f.options).nativePackageRespondent!.load();
    expect(boot.host.preSignCandidate).toBeTypeOf('function');
    expect(boot.host.getSnapshot().nativeReadiness).toBe('pending');
    boot.host.dispose();
  });
  it('boots a native-only task with an explicitly empty attachment map', async () => {
    const f = await correctionFixture();
    f.options.nativeTask.attachmentFieldPaths = {} as { photo: string };
    const boot = await createDefaultComposition(f.config, f.options).nativePackageRespondent!.load();
    expect(boot.host.preSignCandidate).toBeUndefined();
    boot.host.dispose();
  });
  it('refuses an external source selection on a native-only Definition before launch', async () => {
    const f = await correctionFixture();
    f.options.nativeTask.hydration.selection.requiredSources = ['urn:test:unselected'];
    await expect(createDefaultComposition(f.config, f.options).nativePackageRespondent!.load()).rejects.toThrow();
    expect(f.test.requests.some(request => request.method === 'POST')).toBe(false);
  });
  it('refuses a task publication mismatch before task launch', async () => {
    const f = await correctionFixture();
    f.options.nativeTask.hydration.selection.formVersionId = 'different-publication';
    await expect(createDefaultComposition(f.config, f.options).nativePackageRespondent!.load()).rejects.toThrow('publication pins mismatch');
    expect(f.test.requests.some(request => request.method === 'POST')).toBe(false);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('refuses an intake Submit request before launching a task draft', async () => {
    const f = await correctionFixture(false);
    await expect(createDefaultComposition(f.config, f.options).nativePackageRespondent!.load()).rejects.toThrow('action-unadmitted');
    expect(f.test.requests.some(request => request.method === 'POST')).toBe(false);
  });
  it('refuses task selection without native signing configuration', async () => {
    const f = await correctionFixture();
    const formspecStack = { ...f.config.referenceAdapters!.formspecStack! };
    Reflect.deleteProperty(formspecStack, 'nativePackageSigning');
    const config = { ...f.config, referenceAdapters: { ...f.config.referenceAdapters, formspecStack } };
    expect(() => createDefaultComposition(config, f.options)).toThrow('explicit native signing configuration');
    expect(f.test.requests).toHaveLength(0);
  });
  it('accepts a selected initial-data factory for the complete native correction candidate before any effect', async () => {
    const f = await correctionFixture();
    const bundle = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/task-initial-data-complete-v1.bundle.json'), 'utf8')) as BundleExport;
    const resolved = dereferenceBundleExport(bundle);
    expect(resolved.surfaces.some(surface => surface.routes.some(route => route.slots.some(slot =>
      slot.slotType === 'definition-form' && 'initialData' in slot.binding)))).toBe(true);
    const signing = { ...f.config.referenceAdapters!.formspecStack!.nativePackageSigning!,
      definition: { url: 'urn:formspec:demo:d1:passport-renewal', version: '0.3.7' },
      bundle: { id: bundle.manifest.id!, version: bundle.manifest.version! },
      modules: bundle.manifest.modules,
      component: { handle: 'submit_correction', url: 'urn:formspec:demo:d1:passport-renewal:component:task', version: '0.3.9' },
    };
    const config = { ...f.config, referenceAdapters: { formspecStack: {
      ...f.config.referenceAdapters!.formspecStack!, nativePackageSigning: signing,
    } } };
    const factory = vi.fn(() => { throw new Error('Provider requires the actual protected task visit'); });
    expect(() => createDefaultComposition(config, { ...f.options, initialDataSources: factory })).not.toThrow();
    expect(factory).not.toHaveBeenCalled();
    expect(f.test.requests).toHaveLength(0);
  });
  it('continues to refuse initial application lifecycle mixed with a correction task', async () => {
    const f = await correctionFixture();
    const signing = { ...f.config.referenceAdapters!.formspecStack!.nativePackageSigning!,
      applicationLifecycle: { instance: 'draftReadiness', canStartPath: 'canStart', startedPath: 'started', persistentSavingPath: 'persistentSaving' },
      roles: { ...f.config.referenceAdapters!.formspecStack!.nativePackageSigning!.roles,
        startApplication: { artifactRef: 'urn:test:actions', actionRef: 'start-application' } },
    };
    const config = { ...f.config, referenceAdapters: { formspecStack: { ...f.config.referenceAdapters!.formspecStack!, nativePackageSigning: signing } } };
    expect(() => createDefaultComposition(config, f.options)).toThrow('initial application capabilities');
    expect(f.test.requests).toHaveLength(0);
  });
});


it.each([null, false])('refuses a malformed explicit resume option outside native composition', ownedDraftResume => {
  expect(() => Reflect.apply(createDefaultComposition, undefined, [publicPortalProfile, { ownedDraftResume }])).toThrow('Owned draft resume requires native package admission');
});

// Studio's distribution runner supplies the exact exported public files. This
// exercises maintained package/task admission and Surface, without a live launch.
it.skipIf(!process.env.FORMSPEC_TASK_PACKAGE_PUBLIC_ROOT)('admits exported correction task package through maintained host and actual task route', async () => {
  const publicRoot = process.env.FORMSPEC_TASK_PACKAGE_PUBLIC_ROOT!;
  const manifest = JSON.parse(readFileSync(resolve(publicRoot, 'correction-package-manifest.json'), 'utf8'));
  const selections = JSON.parse(readFileSync(resolve(publicRoot, 'task-role-selections.json'), 'utf8')) as { signing: NativePackageSigningConfig; deployment: { publication: { definitionHash: string } } }[];
  const matches = selections.filter(selection => selection.signing.component?.handle === 'submit_correction');
  expect(matches).toHaveLength(1);
  const signing = matches[0].signing;
  const definition = JSON.parse(readFileSync(resolve(publicRoot, manifest.files.definition.path), 'utf8'));
  expect(await computeJcsSha256Digest(definition) === matches[0].deployment.publication.definitionHash).toBe(true);
  const publication = JSON.parse(readFileSync(resolve(publicRoot, 'source-publication.json'), 'utf8'));
  expect(await computeJcsSha256Digest(definition) === publication.definition_hash).toBe(true);
  const f = await correctionFixture(false);
  Object.assign(f.test.publication, { definition_url: definition.url, definition_version: definition.version,
    definition_hash: await computeJcsSha256Digest(definition), definition });
  Object.assign(f.options.nativeTask.completion, { definitionUrl: definition.url, definitionVersion: definition.version });
  Object.assign(f.options.nativeTask.hydration.selection, { definitionUrl: definition.url, definitionVersion: definition.version,
    definitionHash: f.test.publication.definition_hash,
    requiredSources: Object.values(definition.instances ?? {}).flatMap((instance: unknown) => {
      const source = (instance as { source?: string }).source; return typeof source === 'string' ? [source] : [];
    }) });
  const retainedEngine = createFormEngine(definition);
  retainedEngine.setValue('fullName', 'Retained task respondent');
  retainedEngine.setValue('photo', { kind: 'attachment-ref', uri: 'urn:formspec:attachment:retained-task-photo', filename: 'retained.png', contentType: 'image/png', mimeType: 'image/png', size: 1, hash: `sha256:${'a'.repeat(64)}` });
  const response = retainedEngine.getResponse({ profile: 'off', id: f.launched.canonical_response.id }); retainedEngine.dispose();
  Object.assign(f.launched, { canonical_response: response, draft_state: response.data });
  const previousFetch = f.test.fetch.getMockImplementation()!;
  const transports: { path: string; method: string }[] = [];
  f.test.fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    transports.push({ path: url.pathname, method: init?.method ?? 'GET' });
    if (url.origin === window.location.origin) return new Response(readFileSync(resolve(publicRoot, '.' + url.pathname)));
    if (url.origin === 'https://server.example.test' && url.pathname === '/drafts/task-draft' && (init?.method ?? 'GET') === 'GET') return Response.json(f.launched);
    throwIfBusinessWrite(url, init);
    return previousFetch(input, init);
  });
  const claim = { provider: 'https://idp.test', adapter: 'oidc-client-ts', subjectRef: 'oidc:task',
    credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L2' as const };
  Object.assign(f.options.identityBinding.provider, {
    discover: async () => [{ kind: 'oidc' as const, issuer: claim.provider, displayName: 'Sign in', minAssurance: 'L2' as const }],
    authenticate: async () => claim,
    subscribe: (listener: (value: typeof claim) => void) => { listener(claim); return () => {}; },
  });
  const { HttpTaskCandidateHydration } = await import('../../src/adapters/http/task-candidate-hydration.ts');
  const qualification = vi.spyOn(HttpTaskCandidateHydration.prototype, 'qualifySaved').mockRejectedValue(new Error('Offline admission does not qualify Source evidence'));
  const hostPolicy = vi.spyOn(nativeHostModule, 'createNativePackageSigningHost');
  const deployment = JSON.parse(readFileSync(resolve(publicRoot, 'browser-host-deployment.json'), 'utf8')) as {
    taskHostEvents: { definition: { url: string; version: string }; bindings: { artifactRef: string; actionRef: string; eventName: string }[] }[];
  };
  const bindings = deployment.taskHostEvents.find(row => row.definition.url === signing.definition.url
    && row.definition.version === signing.definition.version)?.bindings ?? [];
  // Same maintained savedFactsHostEvents handler selected by browser-task-signing.
  const hostEvents: NonNullable<NativePackageCompositionOptions['hostEvents']> = bindings.map(binding => ({ ...binding,
    async handle({ signal, assertCurrent, refreshSavedFacts }) {
      signal.throwIfAborted(); assertCurrent();
      await refreshSavedFacts();
      signal.throwIfAborted(); assertCurrent();
    },
  }));
  const config = resolveActiveConfig(f.config, { nativePackageSigning: signing });
  const composition = createDefaultComposition(config, { ...f.options, hostEvents, packageUrl: '/correction-package-manifest.json' });
  window.history.replaceState(null, '', '/task-response');
  const mounted = render(createElement(NativePackageRuntime, { composition, config }));
  let boot: Awaited<ReturnType<NonNullable<typeof composition.nativePackageRespondent>['load']>> | undefined;
  try {
    boot = await composition.nativePackageRespondent!.load();
    expect(hostPolicy.mock.calls.at(-1)![0].candidateHydration).toBeDefined();
    expect(hostPolicy.mock.calls.at(-1)![0].initialDataSources).toBeUndefined();
    await screen.findByRole('textbox', { name: /full legal name/i });
    expect((screen.getByRole('textbox', { name: /full legal name/i }) as HTMLInputElement).value).toBe('Retained task respondent');
    expect(JSON.stringify(boot.host.getSnapshot().controller?.saved?.response.data) === JSON.stringify(response.data)).toBe(true);
    expect(boot.host.getSnapshot().controller?.prepared).toBeUndefined();
    expect(boot.host.getSnapshot().controller?.signed).toBeUndefined();
    await vi.waitFor(() => expect(qualification).toHaveBeenCalled());
    // The maintained fixture resolves one retained task launch; no application
    // writes, upload, Save, Sign or task submission reach the transport.
    expect(transports.filter(request => request.method !== 'GET')).toEqual([{ path: '/runtime/task-drafts', method: 'POST' }]);
  } finally { mounted.unmount(); boot?.host.dispose(); window.history.replaceState(null, '', '/'); }
});
function throwIfBusinessWrite(url: URL, init?: RequestInit) {
  if ((init?.method ?? 'GET') !== 'GET' && url.pathname !== '/runtime/task-drafts') throw new Error('Offline package admission prohibits business writes');
}
