// @vitest-environment node
/**
 * @filedesc Live-HTTP conformance suite (`fs-yvfo`) executing `@formspec-org/surface`'s
 * `draftPortConformance` (all 11 checks) + `checkMintedDraftStart` + live `HttpResponseSelector`
 * + repeated-group tracker expansion + live WOS disposition join + WOS outage degradation
 * directly against a live loopback `formspec-server` binary (zero mocks).
 */
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from '@formspec-org/integrity-canonical';
import {
  catalogResponseDigest,
  responseSourceLoader,
  type DataSourceDescriptor,
  type DraftKey,
} from '@formspec-org/surface';
import {
  checkMintedDraftStart,
  draftPortConformance,
  type DraftPortFixture,
} from '@formspec-org/surface/draft-port-conformance';
import type { DataSourcesDocument, ResponseSelectionDelivery } from '@formspec-org/types';
import {
  HttpDraftPort,
  HttpResponseSelector,
  extractJsonObjectMember,
  type ResolvedFormTarget,
} from '../../../src/adapters/http/index.ts';
import type { ScopeKey } from '../../../src/shared/scope-key.ts';

const SUBJECT_TYPE = 'urn:example:subject:org-filing';
const WOS_TOKEN = 'live-conformance-wos-token';
const PIN_UPSTREAM_URL = 'https://example.test/live/pin-upstream';
const PIN_CATALOG_URL = 'https://example.test/live/catalog';
const TRACKER_FORM_URL = 'https://example.test/live/tracker-unit';

function deriveSubjectId(type: string, keys: Record<string, string | number>): string {
  const canonical = canonicalJsonBytes({ type, keys });
  const domain = Buffer.from('formspec.subject.id.v1\0', 'utf8');
  return createHash('sha256').update(domain).update(canonical).digest('hex');
}

function makeSubject(orgId: string, period: number) {
  const keys = { org_id: orgId, period };
  return { id: deriveSubjectId(SUBJECT_TYPE, keys), type: SUBJECT_TYPE, keys };
}

interface WosDispositionEntry {
  readonly mappingStatus: 'mapped' | 'unmapped';
  readonly reviewState: 'returned' | 'accepted' | 'closed-without-acceptance' | 'reopened' | null;
  readonly rawOutcome?: string | null;
  readonly comments?: readonly { readonly text: string; readonly provenanceRecordRef: string }[];
}

interface LoopbackWosServer {
  readonly endpoint: string;
  readonly dispositions: Map<string, WosDispositionEntry>;
  setOutage(down: boolean): void;
  close(): Promise<void>;
}

async function startLoopbackWosServer(): Promise<LoopbackWosServer> {
  const dispositions = new Map<string, WosDispositionEntry>();
  let outage = false;

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (outage) {
        res.writeHead(503, { 'content-type': 'application/problem+json' });
        res.end(JSON.stringify({ title: 'Service Unavailable', status: 503 }));
        return;
      }
      if (req.method !== 'POST' || req.url !== '/api/v1/review-dispositions/query') {
        res.writeHead(404, { 'content-type': 'application/problem+json' });
        res.end(JSON.stringify({ title: 'Not Found', status: 404 }));
        return;
      }
      if (req.headers.authorization !== `Bearer ${WOS_TOKEN}`) {
        res.writeHead(401, { 'content-type': 'application/problem+json' });
        res.end(JSON.stringify({ title: 'Unauthorized', status: 401 }));
        return;
      }
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        includeComments?: boolean;
        filings: readonly { responseId: string; responseHash: string }[];
      };
      const items = parsed.filings.flatMap((filing) => {
        const entry = dispositions.get(`${filing.responseId}::${filing.responseHash}`);
        if (!entry) {
          return [];
        }
        const outcomeSuffix = entry.rawOutcome ?? entry.reviewState ?? 'pending';
        return [
          {
            responseId: filing.responseId,
            responseHash: filing.responseHash,
            outcomeUri: `urn:example:outcome:${outcomeSuffix}`,
            mappingStatus: entry.mappingStatus,
            ...(entry.reviewState ? { state: entry.reviewState } : {}),
            sourceKind: 'decision-record',
            decidedAt: '2026-01-10T00:00:00Z',
            comments: parsed.includeComments
              ? (entry.comments ?? []).map((comment, idx) => ({
                  id: `comment-${filing.responseId}-${idx}`,
                  body: comment.text,
                  recordedAt: '2026-01-10T00:00:00Z',
                  ...(comment.provenanceRecordRef
                    ? { provenanceRecordRef: comment.provenanceRecordRef }
                    : {}),
                }))
              : [],
          },
        ];
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items }));
    });
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind loopback WOS server');
  }
  return {
    endpoint: `http://127.0.0.1:${addr.port}`,
    dispositions,
    setOutage(down: boolean) {
      outage = down;
    },
    close() {
      return new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      });
    },
  };
}

function buildCatalogDocument(): DataSourcesDocument {
  return {
    $formspecDataSources: '1.0',
    version: '1.0.0',
    id: PIN_CATALOG_URL,
    title: 'Live Conformance Catalog',
    sources: [
      {
        id: 'response:prior-filing',
        kind: 'definition-response',
        owner: 'formspec',
        scope: 'definition',
        availability: { level: 'app' },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'none' },
          authorizationBoundary: 'formspec-session',
          failureMode: 'empty-state',
          provenance: { kind: 'definition-response', source: 'formspec-server' },
        },
        schema: {
          type: 'object',
          properties: {
            carried: { type: 'string' },
          },
        },
        responseSelection: {
          definition: { url: PIN_UPSTREAM_URL, compatibleVersions: '^1.0.0' },
          subject: [
            { key: 'org_id', op: 'eq', from: { subject: 'org_id' } },
            { key: 'period', op: 'eq', from: { subject: 'period' }, offset: -1 },
          ],
          status: 'completed',
          cardinality: 'latest',
          pin: 'at-open',
          whenNone: 'unavailable',
        },
      },
      {
        id: 'response:prior-filing-empty',
        kind: 'definition-response',
        owner: 'formspec',
        scope: 'definition',
        availability: { level: 'app' },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'none' },
          authorizationBoundary: 'formspec-session',
          failureMode: 'empty-state',
          provenance: { kind: 'definition-response', source: 'formspec-server' },
        },
        schema: {
          type: 'object',
          properties: {
            carried: { type: 'string' },
          },
        },
        responseSelection: {
          definition: { url: PIN_UPSTREAM_URL, compatibleVersions: '^1.0.0' },
          subject: [
            { key: 'org_id', op: 'eq', from: { subject: 'org_id' } },
            { key: 'period', op: 'eq', from: { subject: 'period' }, offset: -1 },
          ],
          status: 'completed',
          cardinality: 'latest',
          pin: 'at-open',
          whenNone: 'empty',
        },
      },
      {
        id: 'response:tracker-roster',
        kind: 'definition-response',
        owner: 'formspec',
        scope: 'definition',
        availability: { level: 'app' },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'none' },
          authorizationBoundary: 'formspec-session',
          failureMode: 'empty-state',
          provenance: { kind: 'definition-response', source: 'formspec-server' },
        },
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              periodTag: { type: 'integer' },
            },
          },
        },
        responseSelection: {
          definition: { url: TRACKER_FORM_URL, compatibleVersions: '^1.0.0' },
          subject: [{ key: 'org_id', op: 'eq', from: { routeParam: 'org_id' } }],
          status: 'completed',
          cardinality: 'latest-per-subject',
          pin: 'none',
        },
      },
    ],
  } as unknown as DataSourcesDocument;
}

interface LiveServerHandle {
  readonly baseUrl: string;
  readonly issuer: string;
  readonly scopes: Readonly<Record<string, ScopeKey>>;
  readonly catalog: DataSourcesDocument;
  readonly catalogDigest: string;
  readonly wos: LoopbackWosServer;
  stop(): Promise<void>;
}

function findConformanceServerBinary(): string | undefined {
  const fromEnv = process.env.FORMSPEC_LIVE_CONFORMANCE_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const repoDir = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const candidates = [
    resolve(repoDir, '../target/debug/examples/live_conformance_server'),
    resolve(repoDir, '../formspec-server/target/debug/examples/live_conformance_server'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function startLiveServer(binaryPath: string): Promise<LiveServerHandle> {
  const wos = await startLoopbackWosServer();
  const catalog = buildCatalogDocument();
  const catalogDigest = await catalogResponseDigest(catalog);
  const workDir = mkdtempSync(join(tmpdir(), 'formspec-web-live-'));
  const catalogsPath = join(workDir, 'catalogs.json');
  writeFileSync(catalogsPath, JSON.stringify([catalog]), 'utf8');

  const child: ChildProcess = spawn(binaryPath, [], {
    env: {
      ...process.env,
      LIVE_CONFORMANCE_CATALOGS_ARRAY_FILE: catalogsPath,
      LIVE_CONFORMANCE_WOS_ENDPOINT: wos.endpoint,
      LIVE_CONFORMANCE_WOS_TOKEN: WOS_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  const banner = await new Promise<{
    baseUrl: string;
    issuer: string;
    scopes: Record<string, ScopeKey>;
  }>((resolveBanner, rejectBanner) => {
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectBanner(new Error(`live_conformance_server startup timed out. stderr:\n${stderr}`));
    }, 15_000);

    child.on('exit', (code) => {
      clearTimeout(timer);
      rejectBanner(
        new Error(`live_conformance_server exited prematurely (${code}). stderr:\n${stderr}`),
      );
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const nl = buffer.indexOf('\n');
      if (nl >= 0) {
        clearTimeout(timer);
        const line = buffer.slice(0, nl).trim();
        try {
          resolveBanner(JSON.parse(line) as {
            baseUrl: string;
            issuer: string;
            scopes: Record<string, ScopeKey>;
          });
        } catch (err) {
          rejectBanner(new Error(`invalid banner JSON "${line}": ${String(err)}`));
        }
      }
    });
  });

  return {
    baseUrl: banner.baseUrl,
    issuer: banner.issuer,
    scopes: banner.scopes,
    catalog,
    catalogDigest,
    wos,
    async stop() {
      child.kill('SIGTERM');
      await new Promise<void>((resolveExit) => {
        const killTimer = setTimeout(() => {
          child.kill('SIGKILL');
          resolveExit();
        }, 2_000);
        child.once('exit', () => {
          clearTimeout(killTimer);
          resolveExit();
        });
      });
      await wos.close();
      rmSync(workDir, { recursive: true, force: true });
    },
  };
}

async function serverJson(
  server: LiveServerHandle,
  scopeName: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  token: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'x-stack-scope-key': server.scopes[scopeName]!,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const response = await fetch(`${server.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function authorityChange(
  server: LiveServerHandle,
  scopeName: string,
  actor: string,
  change: 'grant' | 'revoke',
  subjectSub: string,
  relation: string,
  object: string,
  key: string,
): Promise<void> {
  const res = await serverJson(
    server,
    scopeName,
    'POST',
    `/authority/${change}`,
    actor,
    {
      subject: { kind: 'user', iss: server.issuer, sub: subjectSub },
      relation,
      object,
      reason: `live conformance ${change}`,
    },
    key,
  );
  if (res.status !== 200) {
    throw new Error(
      `authority ${change} (${relation} on ${object}) failed (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
}

async function publishForm(
  server: LiveServerHandle,
  scopeName: string,
  slug: string,
  definition: Record<string, unknown>,
): Promise<ResolvedFormTarget> {
  const created = await serverJson(
    server,
    scopeName,
    'POST',
    '/forms',
    'principal_test_admin',
    { slug, display_name: slug, created_by: 'principal_test_admin' },
    `form-${scopeName}-${slug}`,
  );
  if (created.status !== 200) {
    throw new Error(`create form ${slug} failed: ${JSON.stringify(created.body)}`);
  }
  const formId = String(created.body.form_id);
  const published = await serverJson(
    server,
    scopeName,
    'POST',
    `/forms/${encodeURIComponent(formId)}/versions/publish`,
    'principal_test_admin',
    { definition, runtime_config: {}, created_by: 'principal_test_admin' },
    `pub-${scopeName}-${slug}`,
  );
  if (published.status !== 200) {
    throw new Error(`publish ${slug} failed: ${JSON.stringify(published.body)}`);
  }
  return { formId, formVersionId: String(published.body.form_version_id) };
}

async function fileCompletedResponse(
  server: LiveServerHandle,
  scopeName: string,
  target: ResolvedFormTarget,
  definitionUrl: string,
  subject: ReturnType<typeof makeSubject>,
  responseId: string,
  authored: string,
  data: Record<string, unknown>,
  keyPrefix: string,
): Promise<{ responseId: string; responseHash: string }> {
  const opened = await serverJson(
    server,
    scopeName,
    'POST',
    `/runtime/forms/${encodeURIComponent(target.formId)}/drafts`,
    'staff-a',
    {
      form_version_id: target.formVersionId,
      subject: { type: subject.type, keys: subject.keys },
      resume_existing: false,
    },
    `${keyPrefix}-open`,
  );
  if (opened.status !== 200) {
    throw new Error(`open upstream draft failed: ${JSON.stringify(opened.body)}`);
  }
  const draftId = String(opened.body.draft_id);
  const draftVersion = Number(opened.body.draft_version);
  const candidate = {
    $formspecResponse: '1.0',
    id: responseId,
    definitionUrl,
    definitionVersion: '1.0.0',
    status: 'completed',
    authored,
    subject: opened.body.subject,
    data,
  };
  const saved = await serverJson(
    server,
    scopeName,
    'PATCH',
    `/drafts/${encodeURIComponent(draftId)}`,
    'staff-a',
    {
      draft_state: data,
      canonical_response: candidate,
      expected_draft_version: draftVersion,
    },
  );
  if (saved.status !== 200) {
    throw new Error(`save upstream draft failed: ${JSON.stringify(saved.body)}`);
  }
  const submitted = await serverJson(
    server,
    scopeName,
    'POST',
    `/drafts/${encodeURIComponent(draftId)}/submit`,
    'coord-a',
    {
      response_data: data,
      canonical_response: candidate,
    },
    `${keyPrefix}-submit`,
  );
  if (submitted.status !== 200) {
    throw new Error(`submit upstream draft failed: ${JSON.stringify(submitted.body)}`);
  }
  return {
    responseId: String(submitted.body.response_id),
    responseHash: String(submitted.body.response_hash),
  };
}

function standardUnitDefinition(
  url: string,
  options: {
    pinMode?: 'unavailable' | 'empty';
    minted?: boolean;
    extraItems?: readonly Record<string, unknown>[];
  } = {},
): Record<string, unknown> {
  const keys: Record<string, unknown> = {
    org_id: { dataType: 'string', authorizationParent: 'org' },
    ...(options.minted
      ? { item_id: { dataType: 'string', minted: true } }
      : { period: { dataType: 'integer' } }),
  };
  const items = [
    { key: 'answer', type: 'field', dataType: 'string', label: 'Answer' },
    { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount' },
    { key: 'carried', type: 'field', dataType: 'string', label: 'Carried' },
    { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
    ...(options.extraItems ?? []),
  ];
  const base: Record<string, unknown> = {
    $formspec: '1.0',
    status: 'active',
    url,
    version: '1.0.0',
    title: 'Live Conformance Unit',
    subject: { type: SUBJECT_TYPE, keys },
    items,
  };
  if (options.pinMode) {
    base.instances = {
      prior: {
        schema: { carried: 'string' },
        response: {
          definition: { url: PIN_UPSTREAM_URL, compatibleVersions: '^1.0.0' },
          subject: [
            { key: 'org_id', op: 'eq', from: { subject: 'org_id' } },
            { key: 'period', op: 'eq', from: { subject: 'period' }, offset: -1 },
          ],
          status: 'completed',
          cardinality: 'latest',
          pin: 'at-open',
          whenNone: options.pinMode,
        },
      },
    };
  }
  return base;
}

const binaryPath = findConformanceServerBinary();
const requireLive = process.env.FORMSPEC_REQUIRE_LIVE_CONFORMANCE === '1';

describe('live HTTP DraftPort, ResponseSelector, and WOS tracker conformance (fs-yvfo)', () => {
  if (!binaryPath) {
    if (requireLive) {
      throw new Error(
        'FORMSPEC_REQUIRE_LIVE_CONFORMANCE=1 but live_conformance_server binary was not found',
      );
    }
    it.skip('skipped when live_conformance_server binary is not built', () => {});
    return;
  }

  let server: LiveServerHandle;
  let pinUpstreamTarget: ResolvedFormTarget;
  let seq = 0;

  beforeAll(async () => {
    server = await startLiveServer(binaryPath);
    // Publish the shared upstream Definition for pin conformance tests in scope-a.
    pinUpstreamTarget = await publishForm(server, 'scope-a', 'pin-upstream', {
      $formspec: '1.0',
      status: 'active',
      url: PIN_UPSTREAM_URL,
      version: '1.0.0',
      title: 'Pin Upstream Unit',
      subject: {
        type: SUBJECT_TYPE,
        keys: {
          org_id: { dataType: 'string', authorizationParent: 'org' },
          period: { dataType: 'integer' },
        },
      },
      items: [{ key: 'carried', type: 'field', dataType: 'string', label: 'Carried' }],
    });
  }, 20_000);

  afterAll(async () => {
    await server?.stop();
  });

  async function grantOrg(scopeName: string, orgId: string): Promise<void> {
    const id = ++seq;
    await authorityChange(
      server,
      scopeName,
      'genesis-admin',
      'grant',
      'coord-a',
      'coordinator',
      `org:${orgId}`,
      `live-coord-${id}`,
    );
    await authorityChange(
      server,
      scopeName,
      'coord-a',
      'grant',
      'staff-a',
      'staff',
      `org:${orgId}`,
      `live-staff-${id}`,
    );
  }

  async function buildConformanceFixture(testName: string): Promise<DraftPortFixture> {
    const id = ++seq;
    const orgId = `org-conf-${id}`;
    await grantOrg('scope-a', orgId);

    const needsEmptyPin = testName.includes('empty at-open pin');
    const needsPin = testName.includes('at-open');
    const definitionUrl = `https://example.test/live/conf-${id}`;
    const otherDefUrl = `${definitionUrl}/other`;
    const pinMode = needsPin ? (needsEmptyPin ? 'empty' : 'unavailable') : undefined;

    const targets = new Map<string, ResolvedFormTarget>();
    const mainTarget = await publishForm(
      server,
      'scope-a',
      `conf-${id}`,
      standardUnitDefinition(definitionUrl, { pinMode }),
    );
    targets.set(`scope-a::${definitionUrl}`, mainTarget);

    let otherKeys: DraftKey[] | undefined;
    if (testName.includes('isolates scopes')) {
      await grantOrg('scope-a-other', orgId);
      const otherScopeTarget = await publishForm(
        server,
        'scope-a-other',
        `conf-${id}`,
        standardUnitDefinition(definitionUrl),
      );
      targets.set(`scope-a-other::${definitionUrl}`, otherScopeTarget);
      const otherDefTarget = await publishForm(
        server,
        'scope-a',
        `conf-${id}-other`,
        standardUnitDefinition(otherDefUrl),
      );
      targets.set(`scope-a::${otherDefUrl}`, otherDefTarget);
      otherKeys = [
        { scope: 'scope-a-other', definitionUrl, subject: makeSubject(orgId, 2025) },
        { scope: 'scope-a', definitionUrl: otherDefUrl, subject: makeSubject(orgId, 2025) },
        { scope: 'scope-a', definitionUrl, subject: makeSubject(orgId, 2026) },
      ];
    }

    const key: DraftKey = {
      scope: 'scope-a',
      definitionUrl,
      subject: makeSubject(orgId, 2025),
    };

    const port = new HttpDraftPort({
      baseUrl: server.baseUrl,
      scopeKeys: server.scopes,
      accessToken: 'staff-a',
      resolveForm: (scope, url) => {
        const found = targets.get(`${scope}::${url}`);
        if (!found) throw new Error(`Unregistered conformance target ${scope}::${url}`);
        return found;
      },
    });

    const deny = async () => {
      const revokeId = ++seq;
      await authorityChange(
        server,
        'scope-a',
        'coord-a',
        'revoke',
        'staff-a',
        'staff',
        `org:${orgId}`,
        `live-revoke-${revokeId}`,
      );
    };

    if (!needsPin) {
      return { port, deny, key, ...(otherKeys ? { otherKeys } : {}) };
    }

    const selector = new HttpResponseSelector({
      baseUrl: server.baseUrl,
      scopeKey: server.scopes['scope-a'],
      accessToken: 'staff-a',
    });
    const upstreamSubject = makeSubject(orgId, 2024);
    const catalogSourceRef = needsEmptyPin ? 'response:prior-filing-empty' : 'response:prior-filing';
    let initialResponseId = '';
    let newerResponseId = '';

    const pins: NonNullable<DraftPortFixture['pins']> = {
      instance: 'prior',
      get initialResponseId() {
        return initialResponseId;
      },
      get newerResponseId() {
        return newerResponseId;
      },
      async addInitial() {
        const filed = await fileCompletedResponse(
          server,
          'scope-a',
          pinUpstreamTarget,
          PIN_UPSTREAM_URL,
          upstreamSubject,
          `urn:live:pin-initial-${id}`,
          '2026-01-01T00:00:00Z',
          { carried: 'from-initial' },
          `pin-init-${id}`,
        );
        initialResponseId = filed.responseId;
      },
      async addNewer() {
        const filed = await fileCompletedResponse(
          server,
          'scope-a',
          pinUpstreamTarget,
          PIN_UPSTREAM_URL,
          upstreamSubject,
          `urn:live:pin-newer-${id}`,
          '2026-02-01T00:00:00Z',
          { carried: 'from-newer' },
          `pin-newer-${id}`,
        );
        newerResponseId = filed.responseId;
      },
      async select(pin?: ResponseSelectionDelivery) {
        const map = await selector.select([
          {
            key: 'prior',
            kind: 'catalog',
            catalogRef: PIN_CATALOG_URL,
            catalogDigest: server.catalogDigest,
            sourceRef: catalogSourceRef,
            consumerSubject: key.subject!.keys,
            ...(pin ? { pin } : {}),
          },
        ]);
        return map.get('prior') ?? { status: 'unavailable' };
      },
    };

    return { port, deny, key, pins };
  }

  it('extractJsonObjectMember preserves 18-digit exact decimal literals without float rounding', () => {
    const raw = '{"canonical_response":{"amount":1.234567890123456789,"nested":{"a":"b\\"c"}},"draft_snapshot":{"rows":[{}]}}';
    expect(extractJsonObjectMember(raw, 'canonical_response')).toBe(
      '{"amount":1.234567890123456789,"nested":{"a":"b\\"c"}}',
    );
    expect(extractJsonObjectMember(raw, 'draft_snapshot')).toBe('{"rows":[{}]}');
  });

  for (const [name, run] of Object.entries(draftPortConformance)) {
    it(`live draftPortConformance: ${name}`, async () => {
      const fixture = await buildConformanceFixture(name);
      await run(fixture);
    }, 15_000);
  }

  it('live checkMintedDraftStart creates, retries idempotently, resumes initialized, and edits minted child units', async () => {
    const id = ++seq;
    const orgId = `org-mint-${id}`;
    await grantOrg('scope-a', orgId);
    const definitionUrl = `https://example.test/live/minted-${id}`;
    const target = await publishForm(
      server,
      'scope-a',
      `minted-${id}`,
      standardUnitDefinition(definitionUrl, { minted: true }),
    );
    const port = new HttpDraftPort({
      baseUrl: server.baseUrl,
      scopeKeys: server.scopes,
      accessToken: 'staff-a',
      resolveForm: () => target,
    });
    await checkMintedDraftStart(port, {
      scope: 'scope-a',
      definitionUrl,
      definitionVersion: '1.0.0',
      subject: { type: SUBJECT_TYPE, keys: { org_id: orgId } },
    });
  }, 15_000);

  it('live ResponseSelector + repeated-group expansion + WOS disposition join + outage degradation', async () => {
    const id = ++seq;
    const orgId = `org-tracker-${id}`;
    await grantOrg('scope-a', orgId);

    const trackerDef: Record<string, unknown> = {
      $formspec: '1.0',
      status: 'active',
      url: TRACKER_FORM_URL,
      version: '1.0.0',
      title: 'Live Tracker Unit',
      subject: {
        type: SUBJECT_TYPE,
        keys: {
          org_id: { dataType: 'string', authorizationParent: 'org' },
          period: { dataType: 'integer' },
        },
      },
      items: [
        { key: 'label', type: 'field', dataType: 'string', label: 'Label' },
        { key: 'periodTag', type: 'field', dataType: 'integer', label: 'Period Tag' },
      ],
    };
    const trackerTarget = await publishForm(server, 'scope-a', `tracker-${id}`, trackerDef);

    // File 5 completed units covering all 4 mapped WOS states + unmapped outcome.
    const scenarios: readonly {
      period: number;
      authored: string;
      disposition: WosDispositionEntry;
      expectedStatus: 'returned' | 'accepted' | 'closed-without-acceptance' | 'reopened' | 'filed';
      expectedComments: readonly string[];
    }[] = [
      {
        period: 2021,
        authored: '2026-01-01T00:00:00Z',
        disposition: {
          mappingStatus: 'mapped',
          reviewState: 'returned',
          comments: [{ text: 'Clarify line 3', provenanceRecordRef: 'urn:wos:comment:1' }],
        },
        expectedStatus: 'returned',
        expectedComments: ['Clarify line 3'],
      },
      {
        period: 2022,
        authored: '2026-01-02T00:00:00Z',
        disposition: {
          mappingStatus: 'mapped',
          reviewState: 'accepted',
          comments: [{ text: 'Accepted for filing', provenanceRecordRef: 'urn:wos:comment:2' }],
        },
        expectedStatus: 'accepted',
        expectedComments: ['Accepted for filing'],
      },
      {
        period: 2023,
        authored: '2026-01-03T00:00:00Z',
        disposition: {
          mappingStatus: 'mapped',
          reviewState: 'closed-without-acceptance',
          comments: [{ text: 'Closed without acceptance', provenanceRecordRef: 'urn:wos:comment:3' }],
        },
        expectedStatus: 'closed-without-acceptance',
        expectedComments: ['Closed without acceptance'],
      },
      {
        period: 2024,
        authored: '2026-01-04T00:00:00Z',
        disposition: {
          mappingStatus: 'mapped',
          reviewState: 'reopened',
          comments: [{ text: 'Reopened for follow-up', provenanceRecordRef: 'urn:wos:comment:4' }],
        },
        expectedStatus: 'reopened',
        expectedComments: ['Reopened for follow-up'],
      },
      {
        period: 2025,
        authored: '2026-01-05T00:00:00Z',
        disposition: {
          mappingStatus: 'unmapped',
          reviewState: null,
          rawOutcome: 'custom-stage',
          comments: [],
        },
        expectedStatus: 'filed',
        expectedComments: [],
      },
    ];

    const filedByPeriod = new Map<number, { responseId: string; responseHash: string }>();
    for (const s of scenarios) {
      const filed = await fileCompletedResponse(
        server,
        'scope-a',
        trackerTarget,
        TRACKER_FORM_URL,
        makeSubject(orgId, s.period),
        `urn:live:tracker-${id}-${s.period}`,
        s.authored,
        { label: `Period ${s.period}`, periodTag: s.period },
        `trk-${id}-${s.period}`,
      );
      filedByPeriod.set(s.period, filed);
      server.wos.dispositions.set(`${filed.responseId}::${filed.responseHash}`, s.disposition);
    }

    // Also open & save one unfiled in-progress draft for period 2026.
    const port = new HttpDraftPort({
      baseUrl: server.baseUrl,
      scopeKeys: server.scopes,
      accessToken: 'staff-a',
      resolveForm: () => trackerTarget,
    });
    const openSubject = makeSubject(orgId, 2026);
    const savedOpen = await port.save({
      key: { scope: 'scope-a', definitionUrl: TRACKER_FORM_URL, subject: openSubject },
      definitionVersion: '1.0.0',
      expectedRevision: null,
      snapshotJson: JSON.stringify({
        definitionUrl: TRACKER_FORM_URL,
        definitionVersion: '1.0.0',
        data: { label: 'In progress 2026', periodTag: 2026 },
      }),
      responseJson: JSON.stringify({
        $formspecResponse: '1.0',
        id: `urn:live:tracker-open-${id}`,
        definitionUrl: TRACKER_FORM_URL,
        definitionVersion: '1.0.0',
        status: 'in-progress',
        authored: '2026-01-06T00:00:00Z',
        subject: openSubject,
        data: { label: 'In progress 2026', periodTag: 2026 },
      }),
      summary: {
        sections: [{ id: 'main', fields: ['label', 'periodTag'] }],
        progress: {
          status: 'current',
          form: { total: 2, filled: 2, toFix: 0, toCheck: 0, ready: true },
          sections: { main: { total: 2, filled: 2, toFix: 0, toCheck: 0 } },
        },
      },
    });
    expect(savedOpen.status).toBe('saved');

    // 1. Live ResponseSelector via Surface `responseSourceLoader` expands the 5 repeated-group rows.
    const selector = new HttpResponseSelector({
      baseUrl: server.baseUrl,
      scopeKey: server.scopes['scope-a'],
      accessToken: 'staff-a',
    });
    const loader = responseSourceLoader(selector);
    const rosterSource = server.catalog.sources.find((s) => s.id === 'response:tracker-roster')!;
    const descriptor: DataSourceDescriptor = {
      catalogRef: PIN_CATALOG_URL,
      sourceRef: 'response:tracker-roster',
      source: rosterSource,
      catalog: server.catalog,
    };
    const rosterDelivery = await loader({
      descriptor,
      context: { surfaceId: 'live-surface', params: { org_id: orgId }, routeId: 'tracker', slotId: 'roster' },
    });
    expect(rosterDelivery.status).toBe('loaded');
    if (rosterDelivery.status !== 'loaded') throw new Error('roster load failed');
    const rows = rosterDelivery.value as readonly { label: string; periodTag: number }[];
    expect(rows.map((r) => r.periodTag).sort((a, b) => a - b)).toEqual([2021, 2022, 2023, 2024, 2025]);

    // 2. Expand each roster row + open draft into a batched live tracker `readSummaries` call.
    const queries = [
      ...rows.map((row) => ({
        key: `period-${row.periodTag}`,
        definitionUrl: TRACKER_FORM_URL,
        definitionVersion: '1.0.0',
        subject: { type: SUBJECT_TYPE, keys: { org_id: orgId, period: row.periodTag } },
        sections: [{ id: 'main', fields: ['label', 'periodTag'] }],
      })),
      {
        key: 'period-2026',
        definitionUrl: TRACKER_FORM_URL,
        definitionVersion: '1.0.0',
        subject: { type: SUBJECT_TYPE, keys: { org_id: orgId, period: 2026 } },
        sections: [{ id: 'main', fields: ['label', 'periodTag'] }],
      },
    ];
    const joined = await port.readSummaries(queries, {
      previewScope: 'scope-a',
      signal: new AbortController().signal,
    });
    for (const s of scenarios) {
      const obs = joined.get(`period-${s.period}`);
      const filed = filedByPeriod.get(s.period)!;
      expect(obs?.draft.status).toBe('absent');
      expect(obs?.filing).toEqual({
        status: s.expectedStatus,
        receiptRef: filed.responseId,
        responseHash: filed.responseHash,
        review: 'available',
        comments: s.expectedComments,
      });
    }
    const openObs = joined.get('period-2026');
    expect(openObs?.draft.status).toBe('current');
    expect(openObs?.filing).toEqual({ status: 'none' });

    // 3. Inject live WOS HTTP 503 outage -> verified Source filing facts stay intact with review: 'unavailable'.
    server.wos.setOutage(true);
    try {
      const degraded = await port.readSummaries(queries, {
        previewScope: 'scope-a',
        signal: new AbortController().signal,
      });
      for (const s of scenarios) {
        const obs = degraded.get(`period-${s.period}`);
        const filed = filedByPeriod.get(s.period)!;
        expect(obs?.filing).toEqual({
          status: 'filed',
          receiptRef: filed.responseId,
          responseHash: filed.responseHash,
          review: 'unavailable',
          comments: [],
        });
      }
      expect(degraded.get('period-2026')?.draft.status).toBe('current');
      expect(degraded.get('period-2026')?.filing).toEqual({ status: 'none' });
    } finally {
      server.wos.setOutage(false);
    }
  }, 15_000);
});
