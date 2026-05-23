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

  it('rejects EXT-23 when RS256 or JWKS verifier code appears', () => {
    const { root, server } = createFixture({
      authJwtPatch: (text) => `${text}\nstruct JwksClient;\nconst ALG: Algorithm = Algorithm::RS256;\n`,
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXT-23 may have landed');
  });

  it('rejects EXT-23 when auth_probe starts consuming jwks_url', () => {
    const { root, server } = createFixture({
      compositionPatch: (text) => text.replace('jwks_url: None', 'jwks_url: Some("https://idp.example.test/jwks.json".to_owned())'),
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('auth_probe no longer leaves jwks_url unset');
  });

  it('rejects EXT-23 when a separate Bearer JWKS middleware path appears', () => {
    const { root, server } = createFixture({
      routesPatch: (text) => `${text}
pub struct TrustedIssuerConfig {
    pub jwks_url: String,
}

pub struct JwksClient;

pub async fn bearer_auth_middleware(
    authorization: Authorization<Bearer>,
    trusted_issuer: TrustedIssuerConfig,
) -> Result<(), ProblemJson> {
    let verifier = JwtBearerVerifier::new(JwksClient, Algorithm::RS256, trusted_issuer);
    verifier.verify(authorization.token()).await
}
`,
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Bearer/JWKS/RS256 trusted-issuer path');
  });

  it('rejects EXT-26 when DraftView exposes draft_state', () => {
    const { root, server } = createFixture({
      responsesPatch: (text) => text.replace('pub status: DraftStatus,', 'pub status: DraftStatus,\n    pub draft_state: Value,'),
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXT-26 may have landed');
  });

  it('rejects EXT-26 when a dedicated draft-state route appears', () => {
    const { root, server } = createFixture({
      routesPatch: (text) => `${text}
#[utoipa::path(
    get,
    path = "/drafts/{draft_id}/state",
    responses((status = 200, body = DraftStateView)),
    tag = "drafts"
)]
pub(crate) async fn get_draft_state() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}

pub struct DraftStateView {
    pub draft_state: Value,
}
`,
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dedicated draft-state');
  });

  it('rejects EXT-26 when a scoped form draft lookup route appears', () => {
    const { root, server } = createFixture({
      routesPatch: (text) =>
        text.replace(
          '.route("/runtime/forms/{form_id}/drafts", post(create_draft))',
          '.route("/runtime/forms/{form_id}/drafts", get(list_form_drafts).post(create_draft))',
        ),
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scoped form-draft');
  });

  it('rejects EXT-27 when UpdateDraftCommand accepts anonymous session tokens', () => {
    const { root, server } = createFixture({
      responsesPatch: (text) => text.replace(
        'pub expected_draft_version: Option<i64>,',
        'pub expected_draft_version: Option<i64>,\n    pub anonymous_session_token: Option<String>,',
      ),
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('UpdateDraftCommand now accepts anonymous_session_token');
  });

  it('rejects EXT-27 when update_draft verifies anonymous session tokens', () => {
    const { root, server } = createFixture({
      responsesPatch: (text) => text.replace(
        'let draft_id = DraftId::new(draft_id)?;',
        'let draft_id = DraftId::new(draft_id)?;\n        self.session_verifier.verify_anonymous_session(ctx, &FormId::new("form").unwrap(), "token")?;',
      ),
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('update_draft now verifies anonymous session tokens');
  });

  it('rejects EXT-27 when an equivalent session-bound update route appears', () => {
    const { root, server } = createFixture({
      routesPatch: (text) => `${text}
#[utoipa::path(
    patch,
    path = "/drafts/{draft_id}/anonymous",
    request_body = SessionBoundUpdateDraftCommand,
    responses((status = 200, body = DraftView)),
    tag = "drafts"
)]
pub(crate) async fn update_anonymous_draft(
    WithRejection(Json(command), _): WithRejection<Json<SessionBoundUpdateDraftCommand>, ProblemJson>,
) -> Result<impl IntoResponse, ProblemJson> {
    state
        .response_services
        .drafts
        .update_anonymous_draft(&ctx, &draft_id, command)
        .await
}

pub struct SessionBoundUpdateDraftCommand {
    pub anonymous_session_token: String,
    pub draft_state: Value,
}
`,
    });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('session-bound draft update');
  });

  it('rejects docs that stop naming a live blocker', () => {
    const { root, server } = createFixture({ omitDocBlocker: 'EXT-23' });
    const result = runCheck(root, server);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/identity/integration.md no longer names EXT-23');
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
    'crates/formspec-server-auth-jwt/src/lib.rs',
    patch(options.authJwtPatch, authJwtFixture()),
  );
  write(
    server,
    'crates/formspec-server/src/composition.rs',
    patch(options.compositionPatch, compositionFixture()),
  );
  write(
    server,
    'crates/formspec-server/src/config.rs',
    patch(options.configPatch, configFixture()),
  );
  write(
    server,
    'crates/formspec-server/src/services/responses.rs',
    patch(options.responsesPatch, responsesFixture()),
  );
  write(
    server,
    'crates/formspec-server/src/routes.rs',
    patch(options.routesPatch, routesFixture()),
  );

  write(root, 'docs/identity/integration.md', docText(['EXT-23'], options.omitDocBlocker));
  write(root, 'docs/adapters/draft-store.md', docText(['EXT-26', 'EXT-27'], options.omitDocBlocker));
  write(root, 'docs/testing-plan.md', docText(['EXT-23', 'EXT-26', 'EXT-27'], options.omitDocBlocker));
  write(root, 'docs/mvp-audit.md', docText(['EXT-23', 'EXT-26', 'EXT-27'], options.omitDocBlocker));

  return { root, server };
}

function patch(fn, text) {
  return fn ? fn(text) : text;
}

function docText(blockers, omit) {
  return blockers.filter((blocker) => blocker !== omit).join('\n');
}

function authJwtFixture() {
  return `
pub struct JwtAuthConfig {
    pub issuer: String,
    pub audience: String,
    pub jwks_url: Option<String>,
    pub shared_secret: Option<String>,
}

pub struct JwtAnonymousSessionIssuer;

impl JwtAnonymousSessionIssuer {
    pub fn new() {
        JwtIssuer::from_hs256(config.clone(), secret.as_bytes(), Box::new(OsSecureRandom));
        JwtVerifier::from_hs256(config, secret.as_bytes());
    }
}

fn jwt_config() -> JwtConfig {
    JwtConfig {
        algorithm: Algorithm::HS256,
    }
}
`;
}

function compositionFixture() {
  return `
fn auth_probe(config: &ServerConfig) -> Arc<dyn HealthProbe> {
    Arc::new(JwtAuthReadiness::new(JwtAuthConfig {
        issuer: config.adapters.jwt_issuer.clone().unwrap_or_default(),
        audience: config.adapters.jwt_audience.clone().unwrap_or_default(),
        jwks_url: None,
        shared_secret: None,
    }))
}
`;
}

function configFixture() {
  return `
pub struct AdapterConfig {
    pub jwt_issuer: Option<String>,
    pub jwt_audience: Option<String>,
}
`;
}

function responsesFixture() {
  return `
pub async fn update_draft(
    &self,
    ctx: &TenantContext,
    draft_id: &str,
    command: UpdateDraftCommand,
) -> Result<DraftView, PortError> {
    let draft_id = DraftId::new(draft_id)?;
    let draft_state_json = command.draft_state.to_string();
    Ok(DraftView::from(record))
}

pub struct UpdateDraftCommand {
    pub draft_state: Value,
    #[serde(default)]
    pub expected_draft_version: Option<i64>,
}

pub struct DraftView {
    pub draft_id: String,
    pub form_version_id: String,
    pub subject_ref: String,
    pub draft_version: i64,
    pub status: DraftStatus,
}
`;
}

function routesFixture() {
  return `
use axum::routing::{get, patch, post};
use crate::services::responses::{
    CreateDraftCommand, DraftView, ResponseServices, SubmitDraftCommand, UpdateDraftCommand,
};

pub fn router() -> Router {
    Router::new()
        .route("/runtime/forms/{form_id}/drafts", post(create_draft))
        .route("/drafts/{draft_id}", get(get_draft).patch(update_draft))
        .route("/drafts/{draft_id}/submit", post(submit_draft))
}

#[utoipa::path(
    post,
    path = "/runtime/forms/{form_id}/drafts",
    request_body = CreateDraftCommand,
    responses((status = 200, body = DraftView)),
    tag = "drafts"
)]
pub(crate) async fn create_draft() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}

#[utoipa::path(
    patch,
    path = "/drafts/{draft_id}",
    request_body = UpdateDraftCommand,
    responses((status = 200, body = DraftView)),
    tag = "drafts"
)]
pub(crate) async fn update_draft() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}

#[utoipa::path(
    get,
    path = "/drafts/{draft_id}",
    responses((status = 200, body = DraftView)),
    tag = "drafts"
)]
pub(crate) async fn get_draft() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}

#[utoipa::path(
    post,
    path = "/drafts/{draft_id}/submit",
    request_body = SubmitDraftCommand,
    responses((status = 200)),
    tag = "responses"
)]
pub(crate) async fn submit_draft() -> Result<impl IntoResponse, ProblemJson> {
    todo!()
}
`;
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
