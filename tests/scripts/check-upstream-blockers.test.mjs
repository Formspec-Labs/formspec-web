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

  it.each([
    ['a GET list under a form', (text) => `${text}pub(crate) const FORM_DRAFTS: Endpoint<FormPath, Absent, Absent, Vec<DraftView>> =
    Endpoint::get("/runtime/forms/{form_id}/drafts");
`, 'GET /runtime/forms/{form_id}/drafts'],
    ['a POST lookup', (text) => `${text}pub(crate) const LOOKUP_DRAFT: Endpoint<Absent, Absent, DraftLookupCommand, Option<DraftView>> =
    Endpoint::post("/drafts/lookup").keyed();
`, 'POST /drafts/lookup'],
    ['a multi-line GET by subject', (text) => `${text}pub(crate) const SUBJECT_DRAFTS: Endpoint<
    SubjectPath,
    DraftListQuery,
    Absent,
    Vec<DraftView>,
> = Endpoint::get(
    "/subjects/{subject_ref}/drafts"
);
`, 'GET /subjects/{subject_ref}/drafts'],
  ])('rejects EXT-26 when a draft endpoint without {draft_id} appears: %s', (_, endpointsPatch, endpoint) => {
    const { root, server } = createFixture({ endpointsPatch });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`EXT-26 may have landed; a draft lookup/list endpoint exists (${endpoint})`);
  });

  it.each(['list_drafts_for_subject', 'get_draft_lookup', 'list_form_drafts', 'find_subject_draft'])(
    'rejects EXT-26 when a draft lookup handler appears: %s',
    (name) => {
      const { root, server } = createFixture({ routesPatch: (text) => `${text}${handler(name)}` });
      const result = runCheck(root, server);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`EXT-26 may have landed; a draft lookup/list handler exists (${name})`);
    },
  );

  it('fails loudly when the draft read route moves', () => {
    const { root, server } = createFixture({
      endpointsPatch: (text) => text.replace('Endpoint::get("/drafts/{draft_id}")', 'Endpoint::get("/runtime/drafts/{draft_id}")'),
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GET /drafts/{draft_id} is no longer declared; the draft routes moved');
  });

  it('fails loudly when an endpoint path stops being a literal', () => {
    const { root, server } = createFixture({
      endpointsPatch: (text) => text.replace('Endpoint::post("/runtime/task-drafts")', 'Endpoint::post(TASK_DRAFTS_PATH)'),
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no longer names a literal path');
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

// Excerpts of formspec-server's endpoints.rs and routes.rs (8bf3794): every draft
// endpoint in their declared shapes (multi-line generics, chained .keyed()/.limit()),
// including the two non-id draft endpoints the detector names, and the handler whose
// name ends in _lookup without being a draft lookup.
function endpointsFixture() {
  return `
pub(crate) const UPLOAD_TASK_ATTACHMENT: Endpoint<
    DraftPath,
    TaskAttachmentUploadQuery,
    Vec<u8>,
    AttachmentUploadView,
> = Endpoint::post("/runtime/drafts/{draft_id}/attachments")
    .keyed()
    .limit(MAX_ATTACHMENT_BYTES);
pub(crate) const READ_TASK_ATTACHMENT: Endpoint<
    DraftUploadPath,
    TaskAttachmentReadQuery,
    Absent,
    OctetStream,
> = Endpoint::get("/runtime/drafts/{draft_id}/attachments/{upload_id}");
pub(crate) const CREATE_DRAFT: Endpoint<FormPath, Absent, CreateDraftCommand, DraftView> =
    Endpoint::post("/runtime/forms/{form_id}/drafts");
pub(crate) const LAUNCH_TASK_DRAFT: Endpoint<Absent, Absent, TaskDraftLaunchRequestV1, DraftView> =
    Endpoint::post("/runtime/task-drafts")
        .keyed()
        .limit(TASK_LAUNCH_LIMIT);
pub(crate) const ASSOCIATE_SCREENER_RUN: Endpoint<DraftPath, Absent, JsonDocument, JsonDocument> =
    Endpoint::post("/drafts/{draft_id}/screener-associations");
pub(crate) const RECOVER_DRAFT_SCREENER: Endpoint<DraftPath, Absent, JsonDocument, JsonDocument> =
    Endpoint::post("/drafts/{draft_id}/screener-recovery");

// Drafts.
pub(crate) const DRAFT: Endpoint<DraftPath, Absent, Absent, DraftView> =
    Endpoint::get("/drafts/{draft_id}");
pub(crate) const UPDATE_DRAFT: Endpoint<DraftPath, Absent, UpdateDraftCommand, DraftView> =
    Endpoint::patch("/drafts/{draft_id}");
pub(crate) const SIGN_DRAFT: Endpoint<DraftPath, Absent, SignDraftCommand, DraftView> =
    Endpoint::post("/drafts/{draft_id}/sign").keyed();
pub(crate) const SUBMIT_DRAFT: Endpoint<DraftPath, Absent, SubmitDraftCommand, ResponseView> =
    Endpoint::post("/drafts/{draft_id}/submit").keyed();
pub(crate) const APPLICATION_CASE: Endpoint<
    DraftPath,
    Absent,
    Absent,
    Option<ApplicationCaseReceipt>,
> = Endpoint::get("/drafts/{draft_id}/application-case");
pub(crate) const RESPONSES: Endpoint<Absent, ResponseListQuery, Absent, Vec<ResponseView>> =
    Endpoint::get("/responses");
`;
}

function routesFixture() {
  return ['create_draft', 'get_draft', 'update_draft', 'sign_draft', 'get_accepted_draft_binding'].map(handler).join('') + `
#[utoipa::path(
    get,
    path = internal::DRAFT_APPLICATION_CASE.path(),
    tag = "internal",
)]
async fn get_draft_application_case_lookup(
    State(state): State<AppState>,
    Scoped(ctx): Scoped<Scope>,
    Path(draft_id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}
`;
}

function handler(name) {
  return `
#[utoipa::path(get, path = endpoints::DRAFT.path(), tag = "drafts")]
pub(crate) async fn ${name}(
    State(state): State<AppState>,
    Scoped(ctx): Scoped<Scope>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}
`;
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
