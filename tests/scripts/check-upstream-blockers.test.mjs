import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(repoRoot, 'scripts/check-upstream-blockers.mjs');
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-upstream-blockers', () => {
  it('accepts current blocker-shaped server fixtures and docs', () => {
    const { root, server } = createFixture();
    const result = runCheck(root, server);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('upstream blocker check passed');
  });

  it('rejects missing formspec-server checkout', () => {
    const { root } = createFixture();
    const result = runCheck(root, join(root, 'missing-server'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('formspec-server checkout not found');
  });

  it('rejects EXT-26 when a draft lookup endpoint appears', () => {
    const { root, server } = createFixture({
      endpointsPatch: (text) =>
        `${text}pub(crate) const FORM_DRAFTS: Endpoint<FormPath, Absent, Absent, Vec<DraftView>> =
    Endpoint::get("/runtime/forms/{form_id}/drafts");
`,
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXT-26 may have landed; a draft lookup/list endpoint exists');
  });

  it('rejects EXT-26 when a draft lookup handler appears', () => {
    const { root, server } = createFixture({
      routesPatch: (text) => `${text}
pub(crate) async fn list_form_drafts() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}
`,
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXT-26 may have landed; a draft lookup/list handler exists');
  });

  it('rejects docs that stop naming a live blocker', () => {
    const { root, server } = createFixture({ omitDocBlocker: 'EXT-26' });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/adapters/draft-store.md no longer names EXT-26');
  });
});

function runCheck(root, server) {
  return spawnSync('node', [scriptPath, '--root', root], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORMSPEC_SERVER_DIR: server,
    },
  });
}

function createFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'formspec-web-upstream-blockers-'));
  const server = join(root, 'formspec-server');
  tempRoots.push(root);

  write(
    server,
    'crates/formspec-server/src/endpoints.rs',
    patch(options.endpointsPatch, endpointsFixture()),
  );
  write(
    server,
    'crates/formspec-server/src/routes.rs',
    patch(options.routesPatch, routesFixture()),
  );

  write(root, 'docs/adapters/draft-store.md', docText(['EXT-26'], options.omitDocBlocker));
  write(root, 'docs/testing-plan.md', docText(['EXT-26'], options.omitDocBlocker));
  write(root, 'docs/mvp-audit.md', docText(['EXT-26'], options.omitDocBlocker));

  return { root, server };
}

function patch(fn, text) {
  return fn ? fn(text) : text;
}

function docText(blockers, omit) {
  return blockers.filter((blocker) => blocker !== omit).join('\n');
}

// Mirrors formspec-server's current draft surface: create, read, and update, but no lookup/list.
function endpointsFixture() {
  return `
pub(crate) const CREATE_DRAFT: Endpoint<FormPath, Absent, CreateDraftCommand, DraftView> =
    Endpoint::post("/runtime/forms/{form_id}/drafts");
pub(crate) const DRAFT: Endpoint<DraftPath, Absent, Absent, DraftView> =
    Endpoint::get("/drafts/{draft_id}");
pub(crate) const UPDATE_DRAFT: Endpoint<DraftPath, Absent, UpdateDraftCommand, DraftView> =
    Endpoint::patch("/drafts/{draft_id}");
pub(crate) const RESPONSES: Endpoint<Absent, ResponseListQuery, Absent, Vec<ResponseView>> =
    Endpoint::get("/responses");
`;
}

function routesFixture() {
  return `
pub(crate) async fn get_draft() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}

pub(crate) async fn update_draft() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}
`;
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
