import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import type {
  ComponentDocument,
  ComponentGraphProjectionContext,
  FormDefinition,
  LayoutHostEvidence,
} from '../../src/ports/index.ts';

const liveServerBaseUrl = process.env.FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL?.replace(/\/+$/, '');
const liveServerSecret =
  process.env.FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_APPLICATION_SECRET
  ?? process.env.FORMSPEC_SERVER_APPLICATION_SECRET
  ?? 'replace-with-32-byte-minimum-production-secret';

const defaultScope = {
  'x-formspec-tenant-id': process.env.FORMSPEC_WEB_LIVE_FORMSPEC_TENANT ?? 'tenant_managed_single_cell',
  'x-formspec-workspace-id':
    process.env.FORMSPEC_WEB_LIVE_FORMSPEC_WORKSPACE ?? 'workspace_managed_single_cell',
  'x-formspec-environment-id':
    process.env.FORMSPEC_WEB_LIVE_FORMSPEC_ENVIRONMENT ?? 'environment_production',
  'x-formspec-cell-id': process.env.FORMSPEC_WEB_LIVE_FORMSPEC_CELL ?? 'cell_primary',
} as const;

const DEMO_FORM_ID = 'demo-intake';
const SELECTED_FORM_ID = 'selected-demo-intake';
const LEDGER_MINT_AUTHORITY_DOMAIN = 'formspec-runtime-ledger-mint-authority-v1';
const RESPONSE_ACTION_LEDGER_APPEND_ROUTE =
  '/runtime/response-actions/ledger/session-op-batches';
const RESPONSE_ACTION_LEDGER_CAPABILITY_HEADER =
  'x-formspec-runtime-ledger-capability';
const RESPONSE_ACTION_LEDGER_MINT_AUTHORITY_HEADER =
  'x-formspec-runtime-ledger-mint-authority';
const TEST_CAPABILITY_PATH = '/__test/response-actions/ledger/capability';
const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';
const COMPONENT_GRAPH_CONTEXT_SCHEMA_ID =
  'https://formspec.org/schemas/componentGraphProjectionContext/0.1';
const RUNTIME_COMPONENT_URL = 'https://components.example.test/respondent-live';
const RUNTIME_SURFACE_URL = 'https://surfaces.example.test/intake-live';

type ScopeHeaders = typeof defaultScope;

type CapabilityCommandRequest = {
  formId: string;
  runtimeDefinitionUrl: string;
  definitionVersion?: string;
  anonymousSessionToken: string;
  appendCommand: ResponseActionSessionOpBatchAppendCommand;
};

type ResponseActionSessionOpBatchAppendCommand = {
  ledgerScope: string;
  sessionRef: Record<string, unknown>;
  branchId: string;
  opBatch: {
    sessionRef?: Record<string, unknown>;
    actor?: Record<string, unknown>;
    semanticOps?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  opBatchHash: string;
  idempotencyKey: string;
  mode: 'require-anchored';
};

type ResponseActionLedgerAppendReceipt = {
  ledgerScope: string;
  priorEventHash: string | null;
  eventHash: string;
  idempotencyKey: string;
  status: 'anchored';
  substrateEventId: string;
  sequence: number;
  checkpointReference: string;
  bundleRef: string;
  verificationReceipt: {
    verified: boolean;
    artifactType: string;
    eventType: string;
  };
};

type AnonymousSessionView = {
  session_token: string;
  subject_ref: string;
  form_id: string;
  expires_at: string;
};

type LedgerCapabilityView = {
  ledgerScope: string;
  capability: string;
};

type CapturedForward = {
  url: string;
  body: unknown;
  headers: Record<string, string>;
  response: unknown;
};

type LiveRouteCaptures = {
  capabilities: CapturedForward[];
  sessions: CapturedForward[];
  drafts: CapturedForward[];
  submits: CapturedForward[];
  appends: Array<CapturedForward & {
    body: ResponseActionSessionOpBatchAppendCommand;
    response: ResponseActionLedgerAppendReceipt;
  }>;
};

let publishCounter = 0;

test.describe.serial('live Response Actions browser ledger path', () => {
  test.skip(
    !liveServerBaseUrl,
    'set FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL to run the managed-single-cell browser ledger proof',
  );

  test('public RespondentRuntime submit appends through the live Response Actions ledger', async ({
    page,
    request,
  }) => {
    if (!liveServerBaseUrl) {
      test.fail(true, 'FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL is required');
      return;
    }
    const defaultRuntimeDefinitionUrl = `${liveServerBaseUrl}/runtime/forms/${DEMO_FORM_ID}`;
    await publishDemoIntake(request, {
      serverBaseUrl: liveServerBaseUrl,
      runtimeDefinitionUrl: defaultRuntimeDefinitionUrl,
      title: 'Browser Response Actions Default',
    });
    const runtimeDefinitionUrl = `${liveServerBaseUrl}/runtime/forms/${SELECTED_FORM_ID}`;
    const definitionVersion = await publishDemoIntake(request, {
      formId: SELECTED_FORM_ID,
      serverBaseUrl: liveServerBaseUrl,
      runtimeDefinitionUrl,
      title: 'Browser Response Actions Ledger',
    });
    const captures = await routeLiveServerThroughTestBff(page, request, {
      serverBaseUrl: liveServerBaseUrl,
    });
    await routeRuntimeConfig(page, { serverBaseUrl: liveServerBaseUrl });

    const selectedRoute = selectedFormRoute(runtimeDefinitionUrl);
    await page.goto(selectedRoute);
    await expect(page.getByRole('heading', { name: 'Browser Response Actions Ledger' })).toBeVisible();
    await expectApplyRouteMetadata(page);
    await expect(page.locator('.formspec-field[data-name="name"]')).toHaveAttribute(
      'data-formspec-component-node-id',
      'name-node',
    );
    await page.getByLabel('Name').fill('Ada Lovelace');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();
    expect(pathAndSearch(page)).toBe(selectedRoute);
    await expect.poll(() => captures.appends.length, { timeout: 30_000 }).toBe(1);
    expect(captures.sessions).toHaveLength(1);
    expect(captures.capabilities).toHaveLength(1);
    expect(captures.submits).toHaveLength(1);
    expect(captures.appends).toHaveLength(1);
    expect(captures.drafts.length).toBeGreaterThan(0);

    const session = responseJson<AnonymousSessionView>(captures.sessions[0]);
    const append = captures.appends[0]!;
    const capability = captures.capabilities[0]!;
    const capabilityResponse = responseJson<LedgerCapabilityView>(capability);
    expect(session.form_id).toBe(SELECTED_FORM_ID);
    expect(session.subject_ref).toMatch(/^anon:/);
    expect(append.body).toMatchObject({
      ledgerScope: `urn:formspec:session:${requestJson<{ session_id: string }>(captures.sessions[0]).session_id}`,
      branchId: 'branch-main',
      mode: 'require-anchored',
    });
    expect(append.body.opBatch).toMatchObject({
      sessionRef: {
        id: append.body.ledgerScope,
        actors: [`urn:formspec:actor:human:${session.subject_ref}`],
      },
      actor: {
        id: `urn:formspec:actor:human:${session.subject_ref}`,
        kind: 'human',
        actChannel: 'human',
      },
      semanticOps: expect.arrayContaining([
        expect.objectContaining({
          op: 'responseAction.invocation',
          actionId: 'submit',
          status: 'completed',
        }),
      ]),
    });
    expect(requestJson<CapabilityCommandRequest>(capability)).toMatchObject({
      formId: SELECTED_FORM_ID,
      runtimeDefinitionUrl,
      definitionVersion,
      anonymousSessionToken: session.session_token,
      appendCommand: append.body,
    });
    for (const draft of captures.drafts) {
      expect(requestJson<{ anonymous_session_token: string }>(draft).anonymous_session_token).toBe(
        session.session_token,
      );
    }
    expect(requestJson<{ anonymous_session_token: string }>(captures.submits[0]).anonymous_session_token).toBe(
      session.session_token,
    );
    expect(capabilityResponse.ledgerScope).toBe(append.body.ledgerScope);
    expect(append.headers[RESPONSE_ACTION_LEDGER_CAPABILITY_HEADER]).toBe(
      capabilityResponse.capability,
    );
    for (const browserRequest of [
      ...captures.sessions,
      ...captures.drafts,
      ...captures.submits,
      ...captures.capabilities,
      ...captures.appends,
    ]) {
      expect(browserRequest.headers[RESPONSE_ACTION_LEDGER_MINT_AUTHORITY_HEADER]).toBeUndefined();
    }
    expect(append.response).toMatchObject({
      ledgerScope: append.body.ledgerScope,
      idempotencyKey: append.body.idempotencyKey,
      status: 'anchored',
    });
    expectTrellisBackedReceipt(append.response);
  });

  test('public RespondentRuntime does not infer a route transition from denied Response Action ledger work', async ({
    page,
    request,
  }) => {
    if (!liveServerBaseUrl) {
      test.fail(true, 'FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL is required');
      return;
    }
    const runtimeDefinitionUrl = `${liveServerBaseUrl}/runtime/forms/${SELECTED_FORM_ID}`;
    await publishDemoIntake(request, {
      formId: SELECTED_FORM_ID,
      serverBaseUrl: liveServerBaseUrl,
      runtimeDefinitionUrl,
      title: 'Browser Response Actions Route Guard',
    });
    const captures = await routeLiveServerThroughTestBff(page, request, {
      serverBaseUrl: liveServerBaseUrl,
      denyCapability: true,
    });
    await routeRuntimeConfig(page, { serverBaseUrl: liveServerBaseUrl });

    const selectedRoute = selectedFormRoute(runtimeDefinitionUrl);
    await page.goto(selectedRoute);
    await expect(page.getByRole('heading', { name: 'Browser Response Actions Route Guard' })).toBeVisible();
    await expectApplyRouteMetadata(page);

    await page.getByLabel('Name').fill('Ada Lovelace');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect.poll(() => captures.capabilities.length, { timeout: 30_000 }).toBe(1);
    await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(pathAndSearch(page)).toBe(selectedRoute);

    expect(captures.sessions).toHaveLength(1);
    expect(captures.drafts.length).toBeGreaterThan(0);
    expect(captures.submits).toHaveLength(1);
    expect(captures.capabilities).toHaveLength(1);
    expect(captures.appends).toHaveLength(0);
  });

  test('public RespondentRuntime rejects hidden route-local Definition state before draft and action work', async ({
    page,
    request,
  }) => {
    if (!liveServerBaseUrl) {
      test.fail(true, 'FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL is required');
      return;
    }
    const runtimeDefinitionUrl = `${liveServerBaseUrl}/runtime/forms/${DEMO_FORM_ID}`;
    await publishDemoIntake(request, {
      serverBaseUrl: liveServerBaseUrl,
      runtimeDefinitionUrl,
      title: 'Browser Response Actions Hidden State',
      hiddenOnActiveRoute: true,
    });
    const captures = await routeLiveServerThroughTestBff(page, request, {
      serverBaseUrl: liveServerBaseUrl,
    });
    await routeRuntimeConfig(page, { serverBaseUrl: liveServerBaseUrl });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'This form cannot be loaded.' })).toBeVisible();
    await expect(page.getByText(/This form is not available on this route/)).toBeVisible();

    expect(captures.sessions).toHaveLength(1);
    expect(captures.drafts).toHaveLength(0);
    expect(captures.submits).toHaveLength(0);
    expect(captures.capabilities).toHaveLength(0);
    expect(captures.appends).toHaveLength(0);
  });

  test('public RespondentRuntime rejects ambiguous multi-form routes before runtime state work', async ({
    page,
    request,
  }) => {
    if (!liveServerBaseUrl) {
      test.fail(true, 'FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL is required');
      return;
    }
    const defaultRuntimeDefinitionUrl = `${liveServerBaseUrl}/runtime/forms/${DEMO_FORM_ID}`;
    const selectedRuntimeDefinitionUrl = `${liveServerBaseUrl}/runtime/forms/${SELECTED_FORM_ID}`;
    await publishDemoIntake(request, {
      serverBaseUrl: liveServerBaseUrl,
      runtimeDefinitionUrl: defaultRuntimeDefinitionUrl,
      title: 'Browser Response Actions Default',
    });
    await publishDemoIntake(request, {
      formId: SELECTED_FORM_ID,
      serverBaseUrl: liveServerBaseUrl,
      runtimeDefinitionUrl: selectedRuntimeDefinitionUrl,
      title: 'Browser Response Actions Selected',
    });
    const captures = await routeLiveServerThroughTestBff(page, request, {
      serverBaseUrl: liveServerBaseUrl,
    });
    await routeRuntimeConfig(page, { serverBaseUrl: liveServerBaseUrl });

    await page.goto(
      `/?form=${encodeURIComponent(defaultRuntimeDefinitionUrl)}&form=${encodeURIComponent(selectedRuntimeDefinitionUrl)}`,
    );
    await expect(page.getByRole('heading', { name: 'This form cannot be loaded.' })).toBeVisible();
    await expect(page.getByText(/names more than one form/)).toBeVisible();

    expect(captures.sessions).toHaveLength(0);
    expect(captures.drafts).toHaveLength(0);
    expect(captures.submits).toHaveLength(0);
    expect(captures.capabilities).toHaveLength(0);
    expect(captures.appends).toHaveLength(0);
  });
});

async function publishDemoIntake(
  request: APIRequestContext,
  input: {
    formId?: string;
    serverBaseUrl: string;
    runtimeDefinitionUrl: string;
    title?: string;
    hiddenOnActiveRoute?: boolean;
  },
): Promise<string> {
  const formId = input.formId ?? DEMO_FORM_ID;
  const title = input.title ?? 'Browser Response Actions Ledger';
  const create = await request.post(`${input.serverBaseUrl}/forms`, {
    headers: defaultScope,
    data: {
      form_id: formId,
      slug: formId,
      display_name: title,
      created_by: 'principal_playwright_web_admin',
    },
  });
  if (!create.ok() && create.status() !== 409) {
    throw new Error(`creating ${formId} returned ${create.status()}: ${await create.text()}`);
  }

  const definitionVersion = `999999.${Date.now()}.${process.pid}.${++publishCounter}`;
  const definition: FormDefinition = {
    $formspec: '1.0',
    url: input.runtimeDefinitionUrl,
    version: definitionVersion,
    title,
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
    binds: [{ path: 'name', required: 'true' }],
  };
  const sidecars = runtimeOwnershipSidecars(definition, {
    hiddenOnActiveRoute: input.hiddenOnActiveRoute ?? false,
  });
  const publish = await request.post(`${input.serverBaseUrl}/forms/${formId}/versions/publish`, {
    headers: defaultScope,
    data: {
      form_version_id: `form_version_web_response_actions_${formId.replace(/[^a-zA-Z0-9_]/g, '_')}_${Date.now()}_${process.pid}_${publishCounter}`,
      definition_url: input.runtimeDefinitionUrl,
      definition_version: definitionVersion,
      definition,
      definition_hash: `sha256:browser-response-actions-ledger-${definitionVersion}`,
      theme_ref: 'theme:playwright-web',
      locale_refs: ['en-US'],
      references: [{ url: 'https://example.test/formspec-web/response-actions-ledger' }],
      ontology: { concepts: ['formspec-web-response-actions-ledger'] },
      component_document: sidecars.componentDocument,
      runtime_config: {
        mode: 'published',
        component_graph: sidecars.componentGraph,
        host_evidence: sidecars.hostEvidence,
      },
      created_by: 'principal_playwright_web_admin',
    },
  });
  if (!publish.ok()) {
    throw new Error(`publishing ${DEMO_FORM_ID} returned ${publish.status()}: ${await publish.text()}`);
  }
  return definitionVersion;
}

async function routeRuntimeConfig(
  page: Page,
  input: { serverBaseUrl: string },
): Promise<void> {
  await page.route('**/formspec-runtime-config.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: [
        'window.__FORMSPEC_RUNTIME_CONFIG__ = {',
        '  profileName: "publicPortal",',
        `  formspecServerUrl: ${JSON.stringify(input.serverBaseUrl)},`,
        `  responseActionLedgerCapabilityUrl: ${JSON.stringify(`${input.serverBaseUrl}${TEST_CAPABILITY_PATH}`)}`,
        '};',
      ].join('\n'),
    });
  });
}

function selectedFormRoute(runtimeDefinitionUrl: string): string {
  return `/?form=${encodeURIComponent(runtimeDefinitionUrl)}`;
}

function pathAndSearch(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

async function expectApplyRouteMetadata(page: Page): Promise<void> {
  await expect(page.locator('.formspec-stack')).toHaveAttribute(
    'data-formspec-component-handle',
    'respondent',
  );
  await expect(page.locator('.formspec-stack')).toHaveAttribute('data-formspec-route', 'apply');
  await expect(page.locator('.formspec-stack')).toHaveAttribute(
    'data-formspec-ui-policy-route',
    'apply',
  );
}

function runtimeOwnershipSidecars(
  definition: FormDefinition,
  options: { hiddenOnActiveRoute: boolean },
): {
  componentDocument: ComponentDocument;
  componentGraph: ComponentGraphProjectionContext;
  hostEvidence: LayoutHostEvidence;
} {
  const componentDocument = componentDocumentForRuntime();
  const componentGraph: ComponentGraphProjectionContext = {
    component: {
      handle: 'respondent',
      url: componentDocument.url,
      version: componentDocument.version,
    },
    surface: {
      url: RUNTIME_SURFACE_URL,
      version: '1.0.0',
    },
    route: 'apply',
  };
  return {
    componentDocument,
    componentGraph,
    hostEvidence: layoutHostEvidenceForRuntime(definition, componentGraph, options),
  };
}

function componentDocumentForRuntime(): ComponentDocument {
  return {
    $formspecComponent: '1.2',
    url: RUNTIME_COMPONENT_URL,
    version: '1.0.0',
    targetSurfaceRoutes: [
      {
        surface: {
          url: RUNTIME_SURFACE_URL,
          version: '1.0.0',
        },
        route: 'apply',
      },
    ],
    tree: {
      component: 'Stack',
      id: 'root-stack',
      children: [
        {
          component: 'TextInput',
          bind: 'name',
          id: 'name-node',
        },
      ],
    },
  } as unknown as ComponentDocument;
}

function layoutHostEvidenceForRuntime(
  definition: FormDefinition,
  componentGraph: ComponentGraphProjectionContext,
  options: { hiddenOnActiveRoute: boolean },
): LayoutHostEvidence {
  const uiPolicySource = 'host://policy/respondent-runtime-ownership';
  const componentGraphSource = 'host://component-graph/respondent-runtime-ownership';
  const hiddenDefinitionRefs = options.hiddenOnActiveRoute
    ? [{ url: definition.url, version: definition.version }]
    : [{ url: 'https://forms.example.test/internal-notes', version: '1.0.0' }];
  return {
    appGraphReport: {
      ok: true,
      summary: {
        artifacts: 0,
        loadedArtifacts: 0,
        schemaFailures: 0,
        unvalidatedArtifacts: 0,
        graphErrors: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        importedDiagnostics: 0,
        unsupportedFeatures: 0,
        skippedPhases: 0,
      },
      schemaResults: [],
      evidenceResults: [
        {
          evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
          schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
          source: uiPolicySource,
          status: 'completed',
          ok: true,
          diagnostics: [],
        },
        {
          evidenceSlot: 'hostEvidence.componentGraphContexts[0]',
          schemaId: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
          source: componentGraphSource,
          status: 'completed',
          ok: true,
          diagnostics: [],
        },
      ],
      diagnostics: [],
      phases: [
        { phase: 'schema', status: 'completed' },
        { phase: 'cross-artifact', status: 'completed' },
      ],
    },
    uiGraphPolicies: [
      {
        schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
        source: uiPolicySource,
        document: {
          $formspecUiGraphPolicy: '0.1',
          version: '1.0.0',
          targetSurface: {
            url: RUNTIME_SURFACE_URL,
            version: '1.0.0',
          },
          routePolicies: [
            {
              routeId: 'apply',
              a11y: {
                landmark: 'main',
                keyboardNavigation: true,
              },
              responsive: {
                minColumns: 1,
                collapseOrder: ['summary', 'details'],
              },
              definitionVisibility: {
                hiddenDefinitionRefs,
              },
            },
          ],
        },
      },
    ],
    componentGraphContexts: [
      {
        schemaId: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
        source: componentGraphSource,
        document: componentGraph,
      },
    ],
  };
}

async function routeLiveServerThroughTestBff(
  page: Page,
  request: APIRequestContext,
  input: { serverBaseUrl: string; denyCapability?: boolean },
): Promise<LiveRouteCaptures> {
  const captures: LiveRouteCaptures = {
    capabilities: [],
    sessions: [],
    drafts: [],
    submits: [],
    appends: [],
  };

  await page.route(`${input.serverBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === TEST_CAPABILITY_PATH) {
      const body = postJson<CapabilityCommandRequest>(route);
      if (input.denyCapability) {
        const response = { error: 'capability denied by test route' };
        captures.capabilities.push({
          url: route.request().url(),
          body,
          headers: normalizedHeaders(route.request().headers()),
          response,
        });
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify(response),
        });
        return;
      }
      const sessionId = sessionIdFromLedgerScope(body.appendCommand.ledgerScope);
      const response = await request.post(
        `${input.serverBaseUrl}/runtime/forms/${body.formId}/response-actions/ledger/capability`,
        {
          headers: {
            ...headersForServer(route),
            ...defaultScope,
            [RESPONSE_ACTION_LEDGER_MINT_AUTHORITY_HEADER]: responseActionLedgerMintAuthority(
              defaultScope,
              body.formId,
              body.appendCommand,
              sessionId,
            ),
          },
          data: {
            anonymousSessionToken: body.anonymousSessionToken,
            appendCommand: body.appendCommand,
          },
        },
      );
      await fulfillAndCapture(route, response, captures.capabilities, body);
      return;
    }

    const response = await forwardBrowserRequest(request, route, defaultScope);
    if (url.pathname === RESPONSE_ACTION_LEDGER_APPEND_ROUTE) {
      await fulfillAndCaptureAppend(route, response, captures.appends);
      return;
    }
    const captureTarget = captureTargetFor(url.pathname, captures);
    await fulfillAndCapture(route, response, captureTarget, postJsonOrNull(route));
  });

  return captures;
}

async function forwardBrowserRequest(
  request: APIRequestContext,
  route: Route,
  scope: ScopeHeaders,
) {
  const method = route.request().method();
  const data = route.request().postData();
  return request.fetch(route.request().url(), {
    method,
    headers: {
      ...headersForServer(route),
      ...scope,
    },
    data: data ?? undefined,
  });
}

async function fulfillAndCapture(
  route: Route,
  response: Awaited<ReturnType<APIRequestContext['fetch']>>,
  target: CapturedForward[],
  requestBody: unknown,
): Promise<void> {
  const text = await response.text();
  const responseBody = parseJsonOrText(text);
  target.push({
    url: route.request().url(),
    body: requestBody,
    headers: normalizedHeaders(route.request().headers()),
    response: responseBody,
  });
  await route.fulfill({
    status: response.status(),
    headers: headersForFulfill(response.headers()),
    body: text,
  });
}

async function fulfillAndCaptureAppend(
  route: Route,
  response: Awaited<ReturnType<APIRequestContext['fetch']>>,
  target: LiveRouteCaptures['appends'],
): Promise<void> {
  const text = await response.text();
  target.push({
    url: route.request().url(),
    body: postJson<ResponseActionSessionOpBatchAppendCommand>(route),
    headers: normalizedHeaders(route.request().headers()),
    response: parseJsonOrText(text) as ResponseActionLedgerAppendReceipt,
  });
  await route.fulfill({
    status: response.status(),
    headers: headersForFulfill(response.headers()),
    body: text,
  });
}

function captureTargetFor(pathname: string, captures: LiveRouteCaptures): CapturedForward[] {
  if (pathname.endsWith('/sessions/anonymous')) return captures.sessions;
  if (pathname.endsWith('/drafts')) return captures.drafts;
  if (pathname.endsWith('/submit')) return captures.submits;
  return [];
}

function headersForServer(route: Route): Record<string, string> {
  const headers = normalizedHeaders(route.request().headers());
  delete headers.host;
  delete headers['content-length'];
  delete headers.origin;
  delete headers.referer;
  return headers;
}

function headersForFulfill(headers: Record<string, string>): Record<string, string> {
  const filtered = normalizedHeaders(headers);
  delete filtered['content-encoding'];
  delete filtered['content-length'];
  delete filtered['transfer-encoding'];
  delete filtered.connection;
  return filtered;
}

function postJsonOrNull(route: Route): unknown {
  const body = route.request().postData();
  return body ? parseJsonOrText(body) : null;
}

function postJson<T>(route: Route): T {
  const body = route.request().postData();
  if (!body) {
    throw new Error(`Expected JSON body for ${route.request().url()}`);
  }
  return JSON.parse(body) as T;
}

function requestJson<T>(capture: CapturedForward | undefined): T {
  if (!capture || !isRecord(capture.body)) {
    throw new Error('Expected captured JSON request body.');
  }
  return capture.body as T;
}

function responseJson<T>(capture: CapturedForward | undefined): T {
  if (!capture || !isRecord(capture.response)) {
    throw new Error('Expected captured JSON response body.');
  }
  return capture.response as T;
}

function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizedHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function responseActionLedgerMintAuthority(
  scope: ScopeHeaders,
  formId: string,
  command: ResponseActionSessionOpBatchAppendCommand,
  sessionId: string,
): string {
  const hmac = createHmac('sha256', liveServerSecret);
  for (const part of [
    LEDGER_MINT_AUTHORITY_DOMAIN,
    scope['x-formspec-tenant-id'],
    scope['x-formspec-workspace-id'],
    scope['x-formspec-environment-id'],
    scope['x-formspec-cell-id'],
    formId,
    sessionId,
    command.ledgerScope,
    command.branchId,
    command.opBatchHash,
    command.idempotencyKey,
  ]) {
    hmac.update(part, 'utf8');
    hmac.update('\0', 'utf8');
  }
  return hmac.digest('hex');
}

function sessionIdFromLedgerScope(ledgerScope: string): string {
  const prefix = 'urn:formspec:session:';
  if (!ledgerScope.startsWith(prefix)) {
    throw new Error(`Unexpected Response Actions ledger scope: ${ledgerScope}`);
  }
  return ledgerScope.slice(prefix.length);
}

function expectTrellisBackedReceipt(receipt: ResponseActionLedgerAppendReceipt): void {
  expect(receipt.substrateEventId).toMatch(/^evt_[0-9a-f]{16}$/);
  expect(receipt.substrateEventId).not.toContain('noop://');
  expect(receipt.checkpointReference).toContain('checkpoints/');
  expect(receipt.checkpointReference).not.toContain('noop://');
  expect(receipt.bundleRef).toBeTruthy();
  expect(receipt.bundleRef).not.toMatch(/^proof-bundles\//);
  expect(receipt.verificationReceipt).toMatchObject({
    verified: true,
    eventType: 'substrate.append.response_action_session_op_batch',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
