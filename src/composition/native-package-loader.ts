import canonicalize from 'canonicalize';
import { canonicalResponseHandoffBytes as handoffBytes } from '@formspec-org/integrity-canonical';
import { resolveAuthoredSigningContent, resolveResponseAction } from '@formspec-org/engine/render';
import { createSemanticControlRegistry } from '@formspec-org/react';
import { dereferenceBundleExport, flattenRegistryEntries, type BundleExport } from '@formspec-org/surface';
import { SIGNING_CEREMONY_WIDGET_SHAPE } from '@formspec-org/surface-react';
import type { NativePackageSigningConfig } from '../config/native-package-signing.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { PinnedPackageDefinitionSource } from '../adapters/http/pinned-package-definition-source.ts';
import { HttpDefinitionSource } from '../adapters/http/definition-source.ts';
import { createHttpAdapterCohort } from '../adapters/http/cohort.ts';
import { AnonymousSessionBridge } from '../adapters/http/anonymous-session.ts';
import { HttpAttachmentStore } from '../adapters/http/attachment-store.ts';
import { createBrowserDraftResumeMetadataStore } from '../adapters/browser/draft-resume-metadata.ts';
import { computeJcsSha256Digest } from '../adapters/http/response-action-ledger.ts';
import { responseSigningDigest } from '../adapters/integrity/response-signing-digest.ts';
import { createSigningDataSourcePayloadValidator, loadCanonicalSigningContentValidator, validateCanonicalFormResponse } from '../adapters/schema/surface-bundle-schema-validators.ts';
import { createNativePackageSigningHost } from '../shared/native-package-signing-host.ts';
import type { QualifiedResponseActionRole, ResponseActionRole } from '../shared/response-action-controller.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import { buildIntakeHandoff, responseHash } from '../app/respondent-flow.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { ResponseSigning, SavedResponseDraft } from '../ports/response-signing.ts';
import { freezeComposition } from '../policy/index.ts';
import type { Composition } from './types.ts';

import type { NativePackageBoot, NativePackageCompositionOptions } from './native-package.ts';

/** Called only by the explicit native boot load; all admission precedes credentials. */
export async function loadNativePackage(config: FormspecWebConfig, options: NativePackageCompositionOptions, deferred: Composition): Promise<NativePackageBoot> {
  const adapter = config.referenceAdapters!.formspecStack!;
  const base = { baseUrl: adapter.formspecServerUrl!, tenantBinding: config.tenantBinding };
  const source = new PinnedPackageDefinitionSource(options.packageUrl, {
    moduleAdmission: { allowedModules: [options.signing.module] }, moduleSupport: {},
  });
  const [definition, bundle, componentDocument, localeDocuments] = await Promise.all([
    source.getDefinition(), source.getNativeBundleExport(), source.getComponentDocument(), source.getLocaleDocuments(),
  ]);
  const pins = options.signing;
  if (!bundle || !componentDocument || definition.url !== pins.definition.url || definition.version !== pins.definition.version
    || bundle.manifest.id !== pins.bundle.id || bundle.manifest.version !== pins.bundle.version
    || bundle.manifest.modules?.length !== 1 || !same(bundle.manifest.modules[0], pins.module)) throw new Error('Native package differs from its explicit deployment pins');
  const resolved = dereferenceBundleExport(bundle);
  const localeFor = (locale: string) => {
    const matches = localeDocuments.filter(document => document.locale === locale);
    if (matches.length !== 1) throw new Error('Native package Locale pin is unavailable or ambiguous');
    return matches[0];
  };
  localeFor(pins.initialLocale);
  const roles = await qualifyRoles(bundle, pins);
  for (const [name, binding] of Object.entries(pins.bindings)) {
    const authored = resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => (route.slots ?? []).flatMap(slot => {
      if (slot.slotType !== 'module-widget') return [];
      const source = record(record(record(slot.binding)?.dataBindings)?.[name]);
      return source ? [{ catalogRef: source.catalogRef, sourceRef: source.sourceRef }] : [];
    })));
    if (!authored.length || authored.some(source => !same(source, binding))) throw new Error('Native source binding differs from the authored Surface');
  }
  const validateContent = await loadCanonicalSigningContentValidator();
  const ceremonies = resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => route.slots ?? []))
    .filter(slot => slot.slotType === 'module-widget' && record(slot.binding)?.moduleId === pins.module.id
      && record(slot.binding)?.widgetName === SIGNING_CEREMONY_WIDGET_SHAPE.widgetName);
  if (ceremonies.length !== 1) throw new Error('Native signing ceremony is ambiguous');
  const contentRefs = record(record(ceremonies[0].binding)?.config)?.contentRefs;
  const signingContext = (locale: string) => {
    localeFor(locale);
    const entry = record(record(contentRefs)?.[locale]);
    if (!entry || typeof entry.ref !== 'string' || typeof entry.version !== 'string') throw new Error('Authored signing content is unavailable for this Locale');
    const source = { ref: entry.ref, version: entry.version };
    resolveAuthoredSigningContent({ definition, response: { definitionUrl: definition.url, definitionVersion: definition.version },
      source, locale, validateContent });
    return { source, locale };
  };
  signingContext(pins.initialLocale);
  const actionLabels = (locale: string) => {
    const document = localeFor(locale);
    return Object.fromEntries((['sign', 'submit', 'paper'] as const).map(name => {
      const action = resolveResponseAction(roles[name].document, roles[name].actionRef).action;
      const ref = action?.label && 'ref' in action.label ? action.label.ref : undefined;
      const value = ref ? document.strings[ref] : undefined;
      if (typeof value !== 'string' || !value.trim()) throw new Error('Authored action label is unavailable for this Locale');
      return [ref!, value];
    }));
  };
  actionLabels(pins.initialLocale);
  const publication = await new HttpDefinitionSource(base).getPublishedDefinition(options.initialDefinitionUrl, definition);
  const formIdResolver = (url: string, version?: string) => {
    if ((url !== options.initialDefinitionUrl && url !== definition.url) || (version !== undefined && version !== definition.version)) throw new Error('Native package form scope differs from its qualified publication');
    return publication.form_id;
  };
  const resumeMetadata = createBrowserDraftResumeMetadataStore(base);
  const anonymousSessions = new AnonymousSessionBridge({ ...base, resumeMetadata, formIdResolver,
    validateFormContext: async (url, version) => { formIdResolver(url, version); } });
  const cohort = createHttpAdapterCohort({ ...base, resumeMetadata, formIdResolver, anonymousSessions,
    qualifiedDraftState: { definition, formVersionId: publication.form_version_id, localeDocuments },
    responseSigning: { keyId: pins.keyId, validateResponse: validateCanonicalFormResponse,
      validateContent, signingProfileDigest: responseSigningDigest } });
  let owner: { key: DraftKey; actor: string } | undefined;
  const remember = <T extends SavedResponseDraft>(result: T): T => {
    owner = { key: structuredClone(result.draftKey), actor: result.actor.id }; return result;
  };
  const signing: ResponseSigning = {
    saveDraft: input => cohort.responseSigning!.saveDraft(input).then(remember),
    prepare: input => cohort.responseSigning!.prepare(input).then(remember),
    sign: input => cohort.responseSigning!.sign(input).then(remember),
  };
  const attachmentStore = new HttpAttachmentStore({ ...base, formId: publication.form_id,
    maxUploadBytes: adapter!.attachments?.maxUploadBytes,
    accessToken: async () => (await anonymousSessions.sessionForForm(definition.url, definition.version)).sessionToken });
  const composition = freezeComposition({ ...deferred, nativePackageRespondent: undefined, definitionSource: source,
    draftStore: cohort.draftStore, submitTransport: cohort.submitTransport, responseSigning: signing, attachmentStore,
    instanceCapabilities: { ...deferred.instanceCapabilities, fileUpload: 'available' as const } });
  const registryEntries = flattenRegistryEntries(resolved.registries);
  if (registryEntries.diagnostics.length) throw new Error('Native Registry entries are ambiguous');
  const semantics = createSemanticControlRegistry();
  const definitionDigest = await computeJcsSha256Digest(definition);
  const host = createNativePackageSigningHost({ bundle, definition, moduleId: pins.module.id, registryEntries: registryEntries.entries,
    locales: localeDocuments, initialLocale: pins.initialLocale,
    clearDraftAccess: async key => { formIdResolver(key.formUrl, key.formVersion); await cohort.draftStore.delete(key); owner = undefined; }, publication: { formId: publication.form_id, formVersionId: publication.form_version_id },
    controller: { roles, signing, submitTransport: cohort.submitTransport, validateResponse: validateCanonicalFormResponse, hashResponse: handoffHash },
    buildHandoff: (response, report, context) => buildIntakeHandoff({ definition, response, validationReport: report,
      draftKey: context.draftKey, claim: context.claim, idempotencyKey: generateIdempotencyKey() }),
    semanticScope: (responseId, renderInstance) => ({ registry: semantics, renderInstanceId: `native:${renderInstance}`,
      definitionArtifact: { artifactRef: definition.url, artifactDigest: definitionDigest },
      responseActionsArtifact: { artifactRef: roles.saveInitial.artifactRef, artifactDigest: roles.saveInitial.artifactDigest }, responseId }),
    readiness: pins.readiness, bindings: pins.bindings, actionLabels, signingContext,
    validatePayload: createSigningDataSourcePayloadValidator(), attachmentStore,
    assertOwner: (key, actor) => { if (!owner || !same(owner.key, key) || owner.actor !== actor) throw new Error('Native private draft owner is unavailable or differs'); },
    invalidateAuthority: (_reason, key) => { if (key) cohort.invalidateResponseSigningScope!(key); },
    reviewResponseDigest: handoffHash, canonicalResponseHandoffBytes: handoffBytes,
  });
  let resuming: ReturnType<NonNullable<NativePackageBoot['resumeSubmitted']>> | undefined;
  return { composition, host, componentDocument, localeDocuments, moduleId: pins.module.id, initialLocale: pins.initialLocale,
    resumeSubmitted: () => resuming ??= (async () => {
      // Validate retained credentials through the bridge; recovery never issues an owner.
      if (resumeMetadata.read(`grant:${publication.form_id}`) !== undefined) {
        await anonymousSessions.sessionForForm(definition.url, definition.version, true);
      }
      const draftKey = { formUrl: definition.url, formVersion: definition.version };
      const state = await cohort.draftStore.readState!(draftKey);
      if (state?.kind === 'submitted') await host.configureSubmittedRuntime({ definition, draftKey, claim: null, state });
      return state?.kind ?? 'absent';
    })() };
}
async function qualifyRoles(bundle: BundleExport, pins: NativePackageSigningConfig): Promise<Record<ResponseActionRole, QualifiedResponseActionRole>> {
  const resolved = dereferenceBundleExport(bundle);
  const result = {} as Record<ResponseActionRole, QualifiedResponseActionRole>;
  for (const [name, selected] of Object.entries(pins.roles) as [ResponseActionRole, NativePackageSigningConfig['roles'][ResponseActionRole]][]) {
    const document = resolved.responseActions.find(document => same(document, bundle.documents[selected.artifactRef]));
    if (!document || resolved.responseActions.filter(document => document.actions.some(action => action.id === selected.actionRef)).length !== 1) throw new Error('Native mapped action is unavailable or ambiguous');
    const action = resolveResponseAction(document, selected.actionRef).action;
    if (!action) throw new Error('Native mapped action is unavailable');
    const effect = action.effects?.length === 1 ? action.effects[0] : undefined;
    if (name !== 'paper' && effect?.type !== 'serviceRequest') throw new Error('Native role requires one declared service request');
    const role: QualifiedResponseActionRole = { ...selected, document, artifactDigest: await computeJcsSha256Digest(document),
      ...(effect?.type === 'serviceRequest' ? { requestRef: effect.requestRef } : {}) };
    const mapped = resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => (route.slots ?? []).flatMap(slot => {
      if (slot.slotType !== 'module-widget') return [];
      const binding = record(slot.binding)!;
      return Object.entries(record(binding.actionBindings) ?? {}).filter(([, mapping]) => record(mapping)?.actionRef === selected.actionRef)
        .map(([outputName, mapping]) => ({ surface, route, slot, outputName, mapping: record(mapping)! }));
    })));
    if (['sign', 'submit', 'paper'].includes(name) && mapped.length !== 1) throw new Error('Native role requires one exact widget mapping');
    if (mapped.length) {
      if (mapped.length !== 1) throw new Error('Native widget action mapping is ambiguous');
      const { surface, route, slot, outputName, mapping } = mapped[0];
      const inputName = mapping.responseInput;
      const source = typeof inputName === 'string' ? record(record(record(slot.binding)?.dataBindings)?.[inputName]) : undefined;
      if (!source || !same({ catalogRef: source.catalogRef, sourceRef: source.sourceRef }, pins.bindings[inputName as string])) throw new Error('Native widget Response source differs from the admitted binding');
      role.responseSource = { inputName: inputName as string, catalogRef: source.catalogRef as string, sourceRef: source.sourceRef as string };
      role.widgetSource = { moduleId: record(slot.binding)?.moduleId as string, widgetName: record(slot.binding)?.widgetName as string,
        slotId: slot.id, outputName, route: { surfaceId: surface.id, surfaceRef: resolved.surfaceRefs?.get(surface),
          routeId: route.id, routeClass: route.routeClass, params: {} } };
    }
    result[name] = role;
  }
  // One Definition renderer publishes one exact Response Actions owner identity.
  if (Object.values(result).some(role => role.artifactRef !== result.saveInitial.artifactRef)) throw new Error('Native Definition controls require one Response Actions artifact');
  return result;
}
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function same(a: unknown, b: unknown) { return canonicalize(a) === canonicalize(b); }

async function handoffHash(response: Parameters<typeof responseHash>[0]): Promise<string> {
  return (await responseHash(response)).slice('sha256:'.length);
}
