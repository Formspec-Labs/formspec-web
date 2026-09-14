import type { Page, Route } from '@playwright/test';
import {
  SURFACE_LOCALE_KEY_PREFIX,
  SURFACE_STRING_KEYS,
} from '@formspec-org/surface';
import {
  buildSurfaceBundlePreimage,
  type SurfaceBundleSignedPayloadV1,
} from '@formspec-org/surface-bundle-signing';
import {
  detachedSignatureProtectedHeader,
  encodeCoseSign1,
  sigStructureBytes,
} from '@integrity-stack/cose';
import sampleForm from '../../../src/demo/sample-form.json' with { type: 'json' };
import type { FormDefinition } from '@formspec-org/types';
import type {
  RespondentSurfaceBundleConfig,
  RuntimeConfig,
} from '../../../src/config/types.ts';

export const APP_ID = 'https://example.gov/apps/respondent-e2e';
export const BUNDLE_URL = 'https://bundles.example.test/respondent.cose';
export const FORMSPEC_SERVER_URL = 'https://formspec-server.example.test';
export const METHOD_ED25519 =
  'urn:formspec:sig-method:ed25519-cose-sign1@1';
export const METHOD_UNSUPPORTED =
  'urn:formspec:sig-method:ml-dsa-65-cose-sign1@1';
export const PUBLISHER_ID = 'https://publisher.example.gov/';
export const SURFACE_URL = 'https://example.gov/surfaces/respondent-e2e';
export const RESPONSE_ACTIONS_URL =
  'https://example.gov/actions/respondent-e2e';
export const DATA_SOURCES_URL =
  'https://example.gov/data/respondent-e2e';
export const REGISTRY_URL =
  'https://example.gov/registries/respondent-e2e';
export const THEME_URL = 'https://example.gov/themes/respondent-e2e';
export const RECEIPT_RESOURCE_URL =
  `${FORMSPEC_SERVER_URL}/runtime/respondent/receipt`;
export const MODULE_ID = 'x-respondent-e2e';
export const TENANT_COLOR = '#7A1F3D';
export const BUNDLE_TITLE = 'Verified respondent E2E sentinel';
export const INTAKE_TITLE = 'Apply for benefits E2E sentinel';
export const STAFF_SENTINEL = 'Staff Queue E2E sentinel';
export const CEREMONY_SENTINEL = 'Signing Ceremony E2E sentinel';

const TRUSTED_KID = new TextEncoder().encode('respondent-e2e-key');
const ATTACKER_KID = new TextEncoder().encode('attacker-e2e-key');
const RELEASE_ID = 'respondent-e2e-2026-07-28';
const APP_LOCALE_EN = 'https://example.gov/locales/respondent-e2e/en';
const APP_LOCALE_ES = 'https://example.gov/locales/respondent-e2e/es';
const DEFINITION_LOCALE_EN =
  'https://demo.formspec.org/locales/demo-intake/en';
const DEFINITION_LOCALE_ES =
  'https://demo.formspec.org/locales/demo-intake/es';
const CHECKED_AT = '2026-07-28T20:00:00.000Z';
const DEMO_FORM = sampleForm as FormDefinition;

export type AdmissionCase =
  | 'unsigned'
  | 'unsupported-method'
  | 'unknown-key'
  | 'wrong-publisher'
  | 'wrong-app'
  | 'expired'
  | 'revoked'
  | 'stale-release'
  | 'signed-staff-route'
  | 'invalid-entry-surface'
  | 'ambiguous-entry-surface'
  | 'signed-metadata-tamper'
  | 'document-tamper'
  | 'replacement-sidecar-key';

export interface SignedRespondentFixture {
  readonly candidate: Uint8Array;
  readonly runtimeConfig: RuntimeConfig;
  readonly trustedDigest: string;
}

export interface RespondentHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
  readonly headers: Record<string, string>;
}

export interface RespondentRoutes {
  readonly requests: RespondentHttpRequest[];
  readonly releaseBundle: () => void;
}

export async function createSignedRespondentFixture(
  admissionCase?: AdmissionCase,
): Promise<SignedRespondentFixture> {
  const trustedPair = await generateKeyPair();
  const attackerPair = await generateKeyPair();
  const trustedPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', trustedPair.publicKey),
  );
  const basePayload = respondentPayload();
  let payload = structuredClone(basePayload);
  let privateKey = trustedPair.privateKey;
  let kid = TRUSTED_KID;
  let methodUri = METHOD_ED25519;
  const authorityPublisherId = PUBLISHER_ID;
  let authorityValidUntil = '2027-01-01T00:00:00.000Z';
  let authorityRevoked = false;

  switch (admissionCase) {
    case 'unsupported-method':
      methodUri = METHOD_UNSUPPORTED;
      break;
    case 'unknown-key':
      privateKey = attackerPair.privateKey;
      kid = ATTACKER_KID;
      break;
    case 'wrong-publisher':
      payload = respondentPayload({
        publisherId: 'https://attacker.example/',
      });
      break;
    case 'wrong-app':
      payload = respondentPayload({
        appId: 'https://example.gov/apps/not-this-deployment',
      });
      break;
    case 'expired':
      authorityValidUntil = CHECKED_AT;
      break;
    case 'revoked':
      authorityRevoked = true;
      break;
    case 'signed-staff-route': {
      const surface = payload.documents[SURFACE_URL] as {
        routes: Array<Record<string, unknown>>;
      };
      surface.routes.push({
        id: 'queue',
        path: '/queue',
        title: STAFF_SENTINEL,
        routeClass: 'operation',
        slots: [{
          id: 'staff-copy',
          slotType: 'static-content',
          binding: { kind: 'text', content: STAFF_SENTINEL },
        }],
      });
      break;
    }
    case 'invalid-entry-surface':
      (payload.manifest as { entrySurface?: string }).entrySurface =
        'https://example.gov/surfaces/missing';
      break;
    case 'ambiguous-entry-surface': {
      const secondSurface =
        'https://example.gov/surfaces/respondent-e2e-second';
      const manifest = payload.manifest as unknown as {
        surfaces: Array<{ url: string; version: string }>;
        entrySurface?: string;
      };
      manifest.surfaces.push({ url: secondSurface, version: '1.0.0' });
      delete manifest.entrySurface;
      (payload.documents as Record<string, unknown>)[secondSurface] = {
        $formspecSurface: '0.2',
        id: 'respondent-e2e-second',
        entry: 'second-intake',
        routes: [{
          id: 'second-intake',
          path: '/second-intake',
          title: 'Second unsigned-choice sentinel',
          routeClass: 'intake',
          slots: [{
            id: 'second-copy',
            slotType: 'static-content',
            binding: { kind: 'text', content: 'Second unsigned-choice sentinel' },
          }],
        }],
      };
      break;
    }
    default:
      break;
  }

  const trustedDigest = await signedPayloadDigest(
    admissionCase === 'stale-release' ? basePayload : payload,
  );
  let candidate = admissionCase === 'unsigned'
    ? encodeCandidate({ signedPayload: payload })
    : await signCandidate(payload, { privateKey, kid, methodUri });

  if (admissionCase === 'stale-release') {
    const stalePayload = respondentPayload({
      releaseId: 'respondent-e2e-2026-07-27',
      releaseSequence: 1,
    });
    candidate = await signCandidate(stalePayload, {
      privateKey: trustedPair.privateKey,
      kid: TRUSTED_KID,
      methodUri: METHOD_ED25519,
    });
  } else if (admissionCase === 'signed-metadata-tamper') {
    const changed = decodeCandidate(candidate);
    changed.signedPayload.release.id = 'tampered-release-sentinel';
    candidate = encodeCandidate(changed);
  } else if (admissionCase === 'document-tamper') {
    const changed = decodeCandidate(candidate);
    const surface = changed.signedPayload.documents[SURFACE_URL] as {
      routes: Array<{ title?: string }>;
    };
    surface.routes[0]!.title = 'Tampered document sentinel';
    candidate = encodeCandidate(changed);
  } else if (admissionCase === 'replacement-sidecar-key') {
    const changed = decodeCandidate(candidate) as CandidateJson & {
      publicKey?: string;
    };
    changed.publicKey = encodeBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', attackerPair.publicKey)),
    );
    candidate = encodeCandidate(changed);
  }

  const surfaceBundle: RespondentSurfaceBundleConfig = {
    locator: BUNDLE_URL,
    allowedOrigins: [new URL(BUNDLE_URL).origin],
    maxBytes: 1_000_000,
    timeoutMs: 15_000,
    redirectPolicy: 'refuse',
    starterModuleId: MODULE_ID,
    receiptResourceUrl: RECEIPT_RESOURCE_URL,
    verification: {
      expectedAppId: APP_ID,
      methodRegistry: {
        version: '1.1.0',
        entries: [
          {
            id: METHOD_ED25519,
            suite: 'Ed25519',
            wire: 'COSE_Sign1 with alg = -8',
            alg: -8,
            status: 'registered',
          },
          {
            id: METHOD_UNSUPPORTED,
            suite: 'ML-DSA-65',
            wire: 'COSE_Sign1',
            alg: null,
            status: 'registered',
          },
        ],
      },
      keys: [{
        kid: encodeBase64Url(TRUSTED_KID),
        publicKey: encodeBase64Url(trustedPublicKey),
      }],
      authorities: [{
        kid: encodeBase64Url(TRUSTED_KID),
        publisherId: authorityPublisherId,
        publisherDisplayName: 'Example Benefits Publisher',
        appIds: [APP_ID],
        methods: [METHOD_ED25519, METHOD_UNSUPPORTED],
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: authorityValidUntil,
        revoked: authorityRevoked,
      }],
      pinnedReleases: [{
        digest: trustedDigest,
        releaseId: admissionCase === 'stale-release'
          ? RELEASE_ID
          : payload.release.id,
      }],
    },
  };

  return {
    candidate,
    trustedDigest,
    runtimeConfig: {
      profileName: 'publicPortal',
      formspecServerUrl: FORMSPEC_SERVER_URL,
      surfaceBundle,
    },
  };
}

export async function installRespondentRoutes(
  page: Page,
  fixture: SignedRespondentFixture,
  options: { holdBundle?: boolean } = {},
): Promise<RespondentRoutes> {
  const requests: RespondentHttpRequest[] = [];
  let releaseBundle: () => void = () => {};
  const bundleGate = options.holdBundle
    ? new Promise<void>((resolve) => {
      releaseBundle = () => resolve();
    })
    : Promise.resolve();

  await page.route('**/formspec-runtime-config.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.__FORMSPEC_RUNTIME_CONFIG__ = ${JSON.stringify(
        fixture.runtimeConfig,
      )};`,
    });
  });
  await page.route(BUNDLE_URL, async (route) => {
    await bundleGate;
    await route.fulfill({
      status: 200,
      headers: corsHeaders('application/octet-stream'),
      body: Buffer.from(fixture.candidate),
    });
  });
  await page.route(`${FORMSPEC_SERVER_URL}/**`, async (route) => {
    await fulfillFormspecServerRoute(route, requests);
  });

  return { requests, releaseBundle };
}

function respondentPayload(
  overrides: {
    appId?: string;
    publisherId?: string;
    releaseId?: string;
    releaseSequence?: number;
  } = {},
): SurfaceBundleSignedPayloadV1 {
  const definition = definitionWithoutLegacyPresentation(DEMO_FORM);
  const appId = overrides.appId ?? APP_ID;
  const englishStrings = shellStrings('English respondent');
  const spanishStrings = shellStrings('Espanol respondent');
  spanishStrings[
    `${SURFACE_LOCALE_KEY_PREFIX}navigationLabel`
  ] = 'Paginas verificadas E2E';
  const documents = {
    [definition.url]: definition,
    [RESPONSE_ACTIONS_URL]: {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: definition.url },
      actions: [{
        id: 'submit-intake',
        intent: 'submit',
        label: { literal: 'Submit' },
        validation: {
          profile: 'on-submit',
          blocking: 'block-on-error',
          persistence: 'complete-response',
        },
        effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
      }],
    },
    [THEME_URL]: {
      $formspecTheme: '1.0',
      url: THEME_URL,
      version: '1.0.0',
      name: 'respondent-e2e-tenant',
      targetDefinition: { url: definition.url },
      tokens: { 'color.primary': TENANT_COLOR },
    },
    [REGISTRY_URL]: {
      $formspecRegistry: '1.1',
      publisher: { name: 'Example Benefits Agency' },
      published: '2026-07-28T00:00:00.000Z',
      entries: [
        {
          name: MODULE_ID,
          category: 'module',
          version: '1.0.0',
          status: 'stable',
          description: 'Public respondent widgets only.',
          compatibility: { formspecVersion: '>=1.0.0 <2.0.0' },
          contributes: ['x-receipt-panel'],
        },
        {
          name: 'x-receipt-panel',
          category: 'widget',
          version: '1.0.0',
          status: 'stable',
          description: 'Shows the authenticated submission receipt.',
          compatibility: { formspecVersion: '>=1.0.0 <2.0.0' },
          widgetShape: {
            widgetName: 'ReceiptPanel',
            dataInputs: [{ name: 'receipt', required: true }],
          },
        },
      ],
    },
    [SURFACE_URL]: {
      $formspecSurface: '0.2',
      id: 'respondent-e2e',
      modules: [{ id: MODULE_ID, version: '1.0.0' }],
      entry: 'apply',
      routes: [
        {
          id: 'apply',
          path: '/apply',
          title: INTAKE_TITLE,
          routeClass: 'intake',
          slots: [{
            id: 'form',
            slotType: 'definition-form',
            binding: { definitionRef: definition.url },
          }],
          transitions: [{
            trigger: 'submit-intake',
            to: 'receipt',
            params: { caseRef: 'caseRef' },
          }],
        },
        {
          id: 'receipt',
          path: '/receipt/{caseRef}',
          params: [{ name: 'caseRef', type: 'string' }],
          title: 'Your receipt',
          routeClass: 'proof',
          slots: [{
            id: 'receipt-panel',
            title: 'Submission receipt',
            slotType: 'module-widget',
            binding: {
              moduleId: MODULE_ID,
              widgetName: 'ReceiptPanel',
              dataBindings: {
                receipt: {
                  catalogRef: DATA_SOURCES_URL,
                  sourceRef: 'resource:receipt',
                },
              },
            },
          }],
        },
      ],
    },
    [DATA_SOURCES_URL]: {
      $formspecDataSources: '1.0',
      id: DATA_SOURCES_URL,
      version: '1.0.0',
      sources: [{
        id: 'resource:receipt',
        kind: 'document-resource',
        owner: 'host',
        scope: 'route',
        availability: {
          level: 'slot',
          surfaceRef: SURFACE_URL,
          routeRef: 'receipt',
          slotId: 'receipt-panel',
        },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'none' },
          authorizationBoundary: 'host',
          failureMode: 'block-render',
          provenance: {
            kind: 'document-resource',
            source: RECEIPT_RESOURCE_URL,
          },
        },
        schema: {
          type: 'object',
          required: ['caseRef', 'submittedAt', 'facts'],
          additionalProperties: false,
          properties: {
            caseRef: { type: 'string' },
            submittedAt: { type: 'string' },
            facts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['label', 'value'],
                additionalProperties: false,
                properties: {
                  label: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
        },
      }],
    },
    [APP_LOCALE_EN]: {
      $formspecLocale: '2.0',
      url: APP_LOCALE_EN,
      version: '1.0.0',
      locale: 'en',
      target: { kind: 'app', url: appId },
      strings: englishStrings,
    },
    [APP_LOCALE_ES]: {
      $formspecLocale: '2.0',
      url: APP_LOCALE_ES,
      version: '1.0.0',
      locale: 'es',
      fallback: 'en',
      target: { kind: 'app', url: appId },
      strings: spanishStrings,
    },
    [DEFINITION_LOCALE_EN]: definitionLocaleDocument(
      DEFINITION_LOCALE_EN,
      'en',
      {
        '$form.title': 'Demo Benefits Intake',
        '$form.description': 'A compact public-intake form used by the zero-config Formspec Web demo.',
        'applicant.label': 'Applicant',
        'fullName.label': 'Full name',
        'email.label': 'Email address',
        'preferredContact.label': 'Preferred contact method',
        'household.label': 'Household members',
        'memberName.label': 'Member name',
        '$optionSet.contactMethods.email.label': 'Email',
        '$optionSet.contactMethods.phone.label': 'Phone',
        '$optionSet.contactMethods.mail.label': 'Mail',
      },
    ),
    [DEFINITION_LOCALE_ES]: definitionLocaleDocument(
      DEFINITION_LOCALE_ES,
      'es',
      {
        '$form.title': 'Solicitud de beneficios de demostracion',
        '$form.description': 'Un formulario publico breve para la demostracion sin configuracion de Formspec Web.',
        'applicant.label': 'Solicitante',
        'fullName.label': 'Nombre completo',
        'email.label': 'Correo electronico',
        'preferredContact.label': 'Metodo de contacto preferido',
        'household.label': 'Miembros del hogar',
        'memberName.label': 'Nombre del miembro',
        '$optionSet.contactMethods.email.label': 'Correo electronico',
        '$optionSet.contactMethods.phone.label': 'Telefono',
        '$optionSet.contactMethods.mail.label': 'Correo postal',
      },
      'en',
    ),
  };

  return {
    profile: 'formspec-surface-bundle-signing-v1',
    publisher: { id: overrides.publisherId ?? PUBLISHER_ID },
    release: {
      id: overrides.releaseId ?? RELEASE_ID,
      sequence: overrides.releaseSequence ?? 2,
    },
    manifest: {
      $formspecBundle: '2.4',
      id: appId,
      version: '1.0.0',
      title: BUNDLE_TITLE,
      definitions: [{ url: definition.url, version: definition.version }],
      responseActions: { url: RESPONSE_ACTIONS_URL, version: '1.0.0' },
      theme: { url: THEME_URL, version: '1.0.0' },
      registries: [{ url: REGISTRY_URL, version: '1.0.0' }],
      surfaces: [{ url: SURFACE_URL, version: '1.0.0' }],
      entrySurface: SURFACE_URL,
      dataSources: [{ url: DATA_SOURCES_URL, version: '1.0.0' }],
      locales: [
        { url: APP_LOCALE_EN, version: '1.0.0', locale: 'en' },
        { url: APP_LOCALE_ES, version: '1.0.0', locale: 'es' },
        { url: DEFINITION_LOCALE_EN, version: '1.0.0', locale: 'en' },
        { url: DEFINITION_LOCALE_ES, version: '1.0.0', locale: 'es' },
      ],
      modules: [{ id: MODULE_ID, version: '1.0.0' }],
    },
    documents,
  } as unknown as SurfaceBundleSignedPayloadV1;
}

function shellStrings(prefix: string): Record<string, string> {
  return Object.fromEntries(SURFACE_STRING_KEYS.map((key) => [
    `${SURFACE_LOCALE_KEY_PREFIX}${key}`,
    `${prefix} ${key}`,
  ]));
}

function definitionLocaleDocument(
  url: string,
  locale: string,
  strings: Record<string, string>,
  fallback?: string,
): Record<string, unknown> {
  return {
    $formspecLocale: '2.0',
    url,
    version: '1.0.0',
    locale,
    ...(fallback ? { fallback } : {}),
    target: { kind: 'definition', url: DEMO_FORM.url },
    strings,
  };
}

async function signCandidate(
  signedPayload: SurfaceBundleSignedPayloadV1,
  options: {
    privateKey: CryptoKey;
    kid: Uint8Array;
    methodUri: string;
  },
): Promise<Uint8Array> {
  const protectedHeader = detachedSignatureProtectedHeader(
    -8,
    options.kid,
    options.methodUri,
  );
  const preimage = buildSurfaceBundlePreimage(signedPayload);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      options.privateKey,
      sigStructureBytes(protectedHeader, preimage) as BufferSource,
    ),
  );
  return encodeCandidate({
    signedPayload: structuredClone(signedPayload),
    signature: {
      format: 'COSE_Sign1',
      value: encodeBase64Url(
        encodeCoseSign1(protectedHeader, null, signature),
      ),
    },
  });
}

async function signedPayloadDigest(
  payload: SurfaceBundleSignedPayloadV1,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      buildSurfaceBundlePreimage(payload) as BufferSource,
    ),
  );
  return Array.from(
    digest,
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;
}

async function fulfillFormspecServerRoute(
  route: Route,
  requests: RespondentHttpRequest[],
): Promise<void> {
  const request = route.request();
  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: corsHeaders() });
    return;
  }
  const bodyText = request.postData();
  requests.push({
    method: request.method(),
    url: request.url(),
    headers: request.headers(),
    ...(bodyText ? { body: JSON.parse(bodyText) as unknown } : {}),
  });
  const path = new URL(request.url()).pathname;
  if (
    request.method() === 'POST'
    && /\/runtime\/forms\/demo-intake\/sessions\/anonymous$/u.test(path)
  ) {
    await json(route, {
      session_token: 'anonymous-session-token-e2e',
      subject_ref: 'anon:respondent-e2e',
      form_id: 'demo-intake',
      expires_at: '2027-01-01T00:00:00.000Z',
    });
    return;
  }
  if (
    request.method() === 'POST'
    && /\/runtime\/forms\/demo-intake\/drafts$/u.test(path)
  ) {
    await json(route, { draft_id: 'DRAFT-301', draft_version: 1 });
    return;
  }
  if (
    request.method() === 'POST'
    && /\/drafts\/DRAFT-301\/submit$/u.test(path)
  ) {
    await json(route, { response_id: 'CASE-301', status: 'accepted' });
    return;
  }
  if (
    request.method() === 'PATCH'
    && /\/drafts\/DRAFT-301$/u.test(path)
  ) {
    await json(route, { draft_id: 'DRAFT-301', draft_version: 2 });
    return;
  }
  if (
    request.method() === 'GET'
    && /\/drafts\/DRAFT-301$/u.test(path)
  ) {
    await json(route, { draft_id: 'DRAFT-301', draft_version: 1 });
    return;
  }
  await json(route, { title: 'Unexpected E2E route' }, 404);
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    headers: corsHeaders('application/json'),
    body: JSON.stringify(body),
  });
}

function corsHeaders(contentType?: string): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    ...(contentType ? { 'content-type': contentType } : {}),
  };
}

interface CandidateJson {
  signedPayload: {
    release: { id: string; sequence: number };
    documents: Record<string, unknown>;
  };
  signature: { format: string; value: string };
}

function decodeCandidate(bytes: Uint8Array): CandidateJson {
  return JSON.parse(new TextDecoder().decode(bytes)) as CandidateJson;
}

function encodeCandidate(candidate: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(candidate));
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function definitionWithoutLegacyPresentation(
  source: FormDefinition,
): FormDefinition {
  const copy = structuredClone(source);
  const strip = (items: unknown[]): unknown[] => {
    return items.flatMap((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [value];
      }
      const item = value as Record<string, unknown>;
      if (item.dataType === 'attachment') return [];
      delete item.presentation;
      if (Array.isArray(item.children)) item.children = strip(item.children);
      return [item];
    });
  };
  copy.items = strip(copy.items as unknown[]) as FormDefinition['items'];
  return copy;
}
