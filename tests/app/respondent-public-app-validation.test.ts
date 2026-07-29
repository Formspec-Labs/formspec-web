import { describe, expect, it } from 'vitest';
import {
  SURFACE_LOCALE_KEY_PREFIX,
  SURFACE_STRING_KEYS,
} from '@formspec-org/surface';
import type {
  AppGraphContext,
  ResolvedArtifactHandle,
} from '@formspec-org/app-graph';
import {
  createRespondentPublicAppValidator,
} from '../../src/verifying-surface/respondent/public-app-validation.ts';

const APP = 'https://example.gov/apps/respondent';
const DEFINITION = 'https://example.gov/definitions/intake';
const SURFACE = 'https://example.gov/surfaces/respondent';
const SECOND_SURFACE = 'https://example.gov/surfaces/static';
const DATA = 'https://example.gov/data/respondent';
const ACTIONS = 'https://example.gov/actions/respondent';
const REGISTRY = 'https://example.gov/registries/respondent';
const LOCALE_EN = 'https://example.gov/locales/respondent/en';
const LOCALE_ES = 'https://example.gov/locales/respondent/es';
const RESOURCE = 'https://runtime.example.gov/respondent/receipt';
const MODULE = 'x-respondent';

const validate = createRespondentPublicAppValidator({
  appId: APP,
  starterModuleId: MODULE,
  receiptResourceUrl: RESOURCE,
});

describe('public respondent AppGraph actor gate', () => {
  it('admits the selected intake form, exact submit edge, receipt binding, and same-target locale fallback', () => {
    expect(validate(validContext())).toEqual([]);
  });

  it.each([
    ['renamed receipt path', (context: AppGraphContext) => {
      proofRoute(context).path = '/done/{caseRef}';
    }, 'RESPONDENT-RECEIPT-ROUTE-PARAM'],
    ['missing caseRef declaration', (context: AppGraphContext) => {
      proofRoute(context).params = [];
    }, 'RESPONDENT-RECEIPT-ROUTE-PARAM'],
    ['wrong transition binding', (context: AppGraphContext) => {
      intakeTransition(context).params = { caseRef: 'wrongBinding' };
    }, 'RESPONDENT-SUBMIT-RECEIPT-TRANSITION'],
    ['non-submit trigger', (context: AppGraphContext) => {
      intakeTransition(context).trigger = 'review';
    }, 'RESPONDENT-SUBMIT-RECEIPT-TRANSITION'],
    ['unevaluable submit transition condition', (context: AppGraphContext) => {
      intakeTransition(context).when = { expression: 'data.ready' };
    }, 'RESPONDENT-TRANSITION-WHEN-UNSUPPORTED'],
    ['wrong submit host event', (context: AppGraphContext) => {
      submitAction(context).effects = [{
        type: 'hostEvent',
        eventName: 'formspec-wrong',
      }];
    }, 'RESPONDENT-SUBMIT-HOST-EVENT'],
    ['duplicate submit host event', (context: AppGraphContext) => {
      submitAction(context).effects = [
        { type: 'hostEvent', eventName: 'formspec-submit' },
        { type: 'hostEvent', eventName: 'formspec-submit' },
      ];
    }, 'RESPONDENT-SUBMIT-HOST-EVENT'],
    ['signer effect before submit host event', (context: AppGraphContext) => {
      submitAction(context).effects = [
        { type: 'hostEvent', eventName: 'x-sign' },
        { type: 'hostEvent', eventName: 'formspec-submit' },
      ];
    }, 'RESPONDENT-SUBMIT-HOST-EVENT'],
    ['submit host event before another effect', (context: AppGraphContext) => {
      submitAction(context).effects = [
        { type: 'hostEvent', eventName: 'formspec-submit' },
        { type: 'hostEvent', eventName: 'formspec-after-submit' },
      ];
    }, 'RESPONDENT-SUBMIT-HOST-EVENT'],
    ['non-blocking submit validation override', (context: AppGraphContext) => {
      submitAction(context).validation = {
        profile: 'off',
        blocking: 'non-blocking',
        persistence: 'none',
      };
    }, 'RESPONDENT-SUBMIT-VALIDATION'],
    ['unevaluable submit precondition', (context: AppGraphContext) => {
      submitAction(context).preconditions = [{ expression: 'data.ready' }];
    }, 'RESPONDENT-SUBMIT-PRECONDITIONS-UNSUPPORTED'],
    ['missing receipt widget', (context: AppGraphContext) => {
      proofRoute(context).slots = [];
    }, 'RESPONDENT-RECEIPT-WIDGET-COUNT'],
    ['renamed receipt input', (context: AppGraphContext) => {
      receiptBinding(context).dataBindings = {
        other: { catalogRef: DATA, sourceRef: 'resource:receipt' },
      };
    }, 'RESPONDENT-RECEIPT-BINDING'],
    ['misbound receipt source', (context: AppGraphContext) => {
      receiptBinding(context).dataBindings = {
        receipt: { catalogRef: DATA, sourceRef: 'resource:other' },
      };
    }, 'RESPONDENT-RECEIPT-BINDING'],
    ['missing form', (context: AppGraphContext) => {
      intakeRoute(context).slots = [];
    }, 'RESPONDENT-DEFINITION-FORM-COUNT'],
    ['duplicate form', (context: AppGraphContext) => {
      intakeRoute(context).slots = [
        ...records(intakeRoute(context).slots),
        structuredClone(records(intakeRoute(context).slots)[0]),
      ];
    }, 'RESPONDENT-DEFINITION-FORM-COUNT'],
    ['second intake with another form', (context: AppGraphContext) => {
      surfaceDocument(context).routes = [
        ...records(surfaceDocument(context).routes),
        {
          id: 'alternate-apply',
          path: '/alternate-apply',
          routeClass: 'intake',
          slots: [{
            id: 'alternate-form',
            slotType: 'definition-form',
            binding: { definitionRef: DEFINITION },
          }],
        },
      ];
    }, 'RESPONDENT-INTAKE-ROUTE-COUNT'],
    ['wrong Definition binding', (context: AppGraphContext) => {
      definitionBinding(context).definitionRef = 'https://example.gov/definitions/other';
    }, 'RESPONDENT-DEFINITION-BINDING'],
    ['staff operation route', (context: AppGraphContext) => {
      surfaceDocument(context).routes = [
        ...records(surfaceDocument(context).routes),
        {
          id: 'queue',
          path: '/queue',
          routeClass: 'operation',
          slots: [{ id: 'copy', slotType: 'static-content', binding: { kind: 'text', content: 'Queue' } }],
        },
      ];
    }, 'RESPONDENT-ACTOR-ROUTE-REFUSED'],
    ['signer ceremony route', (context: AppGraphContext) => {
      surfaceDocument(context).routes = [
        ...records(surfaceDocument(context).routes),
        {
          id: 'sign',
          path: '/sign',
          routeClass: 'ceremony',
          slots: [{ id: 'copy', slotType: 'static-content', binding: { kind: 'text', content: 'Sign' } }],
        },
      ];
    }, 'RESPONDENT-ACTOR-ROUTE-REFUSED'],
    ['proof route embeds the intake', (context: AppGraphContext) => {
      proofRoute(context).slots = [
        ...records(proofRoute(context).slots),
        {
          id: 'embedded-intake',
          slotType: 'embed-route',
          binding: { routeRef: 'apply' },
        },
      ];
    }, 'RESPONDENT-EMBED-ROUTE-REFUSED'],
    ['unused signer ceremony action', (context: AppGraphContext) => {
      responseActionsDocument(context).actions = [
        ...records(responseActionsDocument(context).actions),
        {
          id: 'advance-after-signature',
          intent: 'custom',
          effects: [{
            type: 'hostEvent',
            eventName: 'x-sign',
          }],
        },
      ];
    }, 'RESPONDENT-SUBMIT-ACTION'],
    ['staff queue source', (context: AppGraphContext) => {
      dataDocument(context).sources = [
        ...records(dataDocument(context).sources),
        {
          id: 'query:queue',
          kind: 'query-result',
          owner: 'host',
          scope: 'route',
          availability: { level: 'route', surfaceRef: SURFACE, routeRef: 'receipt' },
          runtime: {
            delivery: 'snapshot',
            cache: { mode: 'none' },
            authorizationBoundary: 'host',
            failureMode: 'block-render',
            provenance: { kind: 'query-result', source: 'queue' },
          },
        },
      ];
    }, 'RESPONDENT-ACTOR-DATA-SOURCE-REFUSED'],
    ['degraded receipt source', (context: AppGraphContext) => {
      record(records(dataDocument(context).sources)[0]?.runtime).failureMode =
        'degraded-widget';
    }, 'RESPONDENT-ACTOR-DATA-SOURCE-REFUSED'],
    ['optional receipt widget input', (context: AppGraphContext) => {
      records(record(receiptWidgetRegistryEntry(context).widgetShape).dataInputs)[0]!.required =
        false;
    }, 'RESPONDENT-RECEIPT-WIDGET-INPUT'],
    ['receipt widget action output', (context: AppGraphContext) => {
      record(receiptWidgetRegistryEntry(context).widgetShape).actionOutputs = [{
        name: 'sign',
      }];
    }, 'RESPONDENT-WIDGET-ACTIONS-UNSUPPORTED'],
    ['receipt widget action binding', (context: AppGraphContext) => {
      receiptBinding(context).actionBindings = {
        sign: { actionId: 'submit-intake' },
      };
    }, 'RESPONDENT-WIDGET-ACTIONS-UNSUPPORTED'],
    ['extra signer module in the App Manifest', (context: AppGraphContext) => {
      const manifest = record(context.manifest.document);
      manifest.modules = [
        ...records(manifest.modules),
        { id: 'x-signer', version: '1.0.0' },
      ];
    }, 'RESPONDENT-ACTOR-MODULES'],
    ['second public Surface', (context: AppGraphContext) => {
      const manifest = context.manifest.document as Record<string, unknown>;
      manifest.surfaces = [
        ...(manifest.surfaces as unknown[]),
        { url: SECOND_SURFACE, version: '1.0.0' },
      ];
      context.handles.push({
        slot: 'surfaces[1]',
        artifactKind: 'surface',
        status: 'loaded',
        ref: { url: SECOND_SURFACE, version: '1.0.0' },
        document: {
          $formspecSurface: '0.2',
          id: 'static',
          entry: 'info',
          routes: [{
            id: 'info',
            path: '/info',
            routeClass: 'intake',
            slots: [{ id: 'copy', slotType: 'static-content', binding: { kind: 'text', content: 'Info' } }],
          }],
        },
      });
    }, 'RESPONDENT-ENTRY-SURFACE'],
  ])('refuses %s', (_name, mutate, expectedCode) => {
    const context = validContext();
    mutate(context);
    expect(validate(context).map((entry) => entry.code)).toContain(expectedCode);
  });
});

function validContext(): AppGraphContext {
  const manifest = {
    $formspecBundle: '2.4',
    id: APP,
    version: '1.0.0',
    definitions: [{ url: DEFINITION, version: '1.0.0' }],
    responseActions: { url: ACTIONS, version: '1.0.0' },
    surfaces: [{ url: SURFACE, version: '1.0.0' }],
    entrySurface: SURFACE,
    dataSources: [{ url: DATA, version: '1.0.0' }],
    registries: [{ url: REGISTRY, version: '1.0.0' }],
    locales: [
      { url: LOCALE_EN, version: '1.0.0', locale: 'en' },
      { url: LOCALE_ES, version: '1.0.0', locale: 'es' },
    ],
    modules: [{ id: MODULE, version: '1.0.0' }],
  };
  const handles: ResolvedArtifactHandle[] = [
    handle('definitions[0]', 'definition', DEFINITION, {
      $formspec: '1.0',
      url: DEFINITION,
      version: '1.0.0',
      status: 'active',
      title: 'Intake',
      items: [],
    }),
    handle('responseActions', 'responseActions', ACTIONS, {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION },
      actions: [{
        id: 'submit-intake',
        intent: 'submit',
        effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
      }],
    }),
    handle('surfaces[0]', 'surface', SURFACE, {
      $formspecSurface: '0.2',
      id: 'respondent',
      entry: 'apply',
      routes: [
        {
          id: 'apply',
          path: '/apply',
          routeClass: 'intake',
          slots: [{
            id: 'form',
            slotType: 'definition-form',
            binding: { definitionRef: DEFINITION },
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
          routeClass: 'proof',
          slots: [{
            id: 'receipt-panel',
            slotType: 'module-widget',
            binding: {
              moduleId: MODULE,
              widgetName: 'ReceiptPanel',
              dataBindings: {
                receipt: {
                  catalogRef: DATA,
                  sourceRef: 'resource:receipt',
                },
              },
            },
          }],
        },
      ],
    }),
    handle('dataSources[0]', 'dataSources', DATA, {
      $formspecDataSources: '1.0',
      id: DATA,
      version: '1.0.0',
      sources: [{
        id: 'resource:receipt',
        kind: 'document-resource',
        owner: 'host',
        scope: 'route',
        availability: {
          level: 'slot',
          surfaceRef: SURFACE,
          routeRef: 'receipt',
          slotId: 'receipt-panel',
        },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'none' },
          authorizationBoundary: 'host',
          failureMode: 'block-render',
          provenance: { kind: 'document-resource', source: RESOURCE },
        },
        schema: { type: 'object' },
      }],
    }),
    handle('registries[0]', 'registry', REGISTRY, {
      $formspecRegistry: '1.1',
      publisher: { name: 'Example Benefits Agency' },
      published: '2026-07-28T00:00:00.000Z',
      entries: [
        {
          name: MODULE,
          category: 'module',
          version: '1.0.0',
          status: 'stable',
          description: 'Public respondent widgets.',
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
    }),
    handle('locales[0]', 'locale', LOCALE_EN, localeDocument(
      LOCALE_EN,
      'en',
      undefined,
      completeShellStrings('English'),
    )),
    handle('locales[1]', 'locale', LOCALE_ES, localeDocument(
      LOCALE_ES,
      'es',
      'en',
      {
        [`${SURFACE_LOCALE_KEY_PREFIX}navigationLabel`]: 'Navegacion',
      },
    )),
  ];
  return {
    manifest: {
      slot: 'app',
      artifactKind: 'appManifest',
      status: 'loaded',
      document: manifest,
    },
    handles,
    schemaResults: [],
    evidenceResults: [],
  };
}

function handle(
  slot: string,
  artifactKind: string,
  url: string,
  document: unknown,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    ref: { url, version: '1.0.0' },
    document,
  };
}

function localeDocument(
  url: string,
  locale: string,
  fallback: string | undefined,
  strings: Record<string, string>,
) {
  return {
    $formspecLocale: '2.0',
    url,
    version: '1.0.0',
    locale,
    ...(fallback ? { fallback } : {}),
    target: { kind: 'app', url: APP },
    strings,
  };
}

function completeShellStrings(prefix: string): Record<string, string> {
  return Object.fromEntries(SURFACE_STRING_KEYS.map((key) => [
    `${SURFACE_LOCALE_KEY_PREFIX}${key}`,
    key === 'transitionContinue' ? `${prefix} {{$target}}` : `${prefix} ${key}`,
  ]));
}

function surfaceDocument(context: AppGraphContext): Record<string, unknown> {
  return context.handles.find((handle) => handle.artifactKind === 'surface')
    ?.document as Record<string, unknown>;
}

function dataDocument(context: AppGraphContext): Record<string, unknown> {
  return context.handles.find((handle) => handle.artifactKind === 'dataSources')
    ?.document as Record<string, unknown>;
}

function responseActionsDocument(context: AppGraphContext): Record<string, unknown> {
  return context.handles.find((handle) => handle.artifactKind === 'responseActions')
    ?.document as Record<string, unknown>;
}

function receiptWidgetRegistryEntry(context: AppGraphContext): Record<string, unknown> {
  const registry = context.handles.find((handle) => handle.artifactKind === 'registry')
    ?.document as Record<string, unknown>;
  return records(registry.entries).find((entry) => {
    const shape = entry.widgetShape;
    return (
      typeof shape === 'object'
      && shape !== null
      && !Array.isArray(shape)
      && (shape as Record<string, unknown>).widgetName === 'ReceiptPanel'
    );
  })!;
}

function submitAction(context: AppGraphContext): Record<string, unknown> {
  return records(responseActionsDocument(context).actions)[0]!;
}

function intakeRoute(context: AppGraphContext): Record<string, unknown> {
  return records(surfaceDocument(context).routes).find((route) => route.id === 'apply')!;
}

function proofRoute(context: AppGraphContext): Record<string, unknown> {
  return records(surfaceDocument(context).routes).find((route) => route.id === 'receipt')!;
}

function intakeTransition(context: AppGraphContext): Record<string, unknown> {
  return records(intakeRoute(context).transitions)[0]!;
}

function definitionBinding(context: AppGraphContext): Record<string, unknown> {
  return record(records(intakeRoute(context).slots)[0]?.binding);
}

function receiptBinding(context: AppGraphContext): Record<string, unknown> {
  return record(records(proofRoute(context).slots)[0]?.binding);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : [];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected record fixture');
  }
  return value as Record<string, unknown>;
}
