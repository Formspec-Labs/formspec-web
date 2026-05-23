/* global console */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredDocs = new Map([
  ['EXT-23', ['docs/identity/integration.md', 'docs/testing-plan.md', 'docs/mvp-audit.md']],
  ['EXT-26', ['docs/adapters/draft-store.md', 'docs/testing-plan.md', 'docs/mvp-audit.md']],
  ['EXT-27', ['docs/adapters/draft-store.md', 'docs/testing-plan.md', 'docs/mvp-audit.md']],
]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = rootDirFromArgs(process.argv.slice(2)) ?? defaultRootDir;
  const result = checkUpstreamBlockers(rootDir, formspecServerDir(rootDir));
  console.log(
    `upstream blocker check passed: ${result.blockerCount} blocker(s), ${result.sourceFileCount} server source file(s), ${result.docCount} doc reference(s)`,
  );
}

export function checkUpstreamBlockers(rootDir, serverDir) {
  assertServerDir(serverDir);

  const authJwt = readServerFile(serverDir, 'crates/formspec-server-auth-jwt/src/lib.rs');
  const composition = readServerFile(serverDir, 'crates/formspec-server/src/composition.rs');
  const config = readServerFile(serverDir, 'crates/formspec-server/src/config.rs');
  const responses = readServerFile(serverDir, 'crates/formspec-server/src/services/responses.rs');
  const routes = readServerFile(serverDir, 'crates/formspec-server/src/routes.rs');

  assertExt23StillBlocked(authJwt, composition, config, routes);
  assertExt26StillBlocked(responses, routes);
  assertExt27StillBlocked(responses, routes);
  assertDocsKeepBlockers(rootDir);

  return {
    blockerCount: 3,
    sourceFileCount: 5,
    docCount: Array.from(requiredDocs.values()).reduce((count, paths) => count + paths.length, 0),
  };
}

function rootDirFromArgs(args) {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 2 && args[0] === '--root') {
    return args[1];
  }
  fail('usage: node scripts/check-upstream-blockers.mjs [--root <repo-root>]');
}

function formspecServerDir(rootDir) {
  return resolve(process.env.FORMSPEC_SERVER_DIR ?? join(rootDir, '..', 'formspec-server'));
}

function assertServerDir(serverDir) {
  if (!existsSync(serverDir)) {
    fail(
      `upstream blocker check failed: formspec-server checkout not found at ${serverDir}; set FORMSPEC_SERVER_DIR`,
    );
  }
}

function readServerFile(serverDir, relativePath) {
  const path = join(serverDir, relativePath);
  if (!existsSync(path)) {
    fail(`upstream blocker check failed: missing formspec-server source file ${relativePath}`);
  }
  return readFileSync(path, 'utf8');
}

function readRepoFile(rootDir, relativePath) {
  const path = join(rootDir, relativePath);
  if (!existsSync(path)) {
    fail(`upstream blocker check failed: missing formspec-web evidence file ${relativePath}`);
  }
  return readFileSync(path, 'utf8');
}

function assertExt23StillBlocked(authJwt, composition, config, routes) {
  const jwtConfig = extractRustBlock(authJwt, 'pub struct JwtAuthConfig');
  if (!jwtConfig.includes('pub jwks_url: Option<String>')) {
    fail('upstream blocker check failed: EXT-23 evidence changed; JwtAuthConfig no longer exposes jwks_url as inert config shape');
  }
  if (!authJwt.includes('JwtVerifier::from_hs256') || !authJwt.includes('algorithm: Algorithm::HS256')) {
    fail('upstream blocker check failed: EXT-23 may have landed; JWT auth is no longer HS256-only');
  }
  if (authJwt.includes('Algorithm::RS256') || /Jwks(Client|Verifier|Provider)/.test(authJwt)) {
    fail('upstream blocker check failed: EXT-23 may have landed; JWT auth now references RS256/JWKS verifier code');
  }
  const authProbe = extractRustFunction(composition, 'fn auth_probe');
  if (!authProbe.includes('jwks_url: None')) {
    fail('upstream blocker check failed: EXT-23 may have landed; auth_probe no longer leaves jwks_url unset');
  }
  const serverAuthSources = `${composition}\n${config}\n${routes}`;
  const hasBearerMiddlewarePath = /\bbearer\b/i.test(serverAuthSources);
  const hasTrustedIssuerPath =
    /\b(?:Jwks\w*|JWKS|jwks_\w+|Algorithm::RS256|RS256|Trusted\w*Issuer|trusted_issuer|Oidc\w*Verifier|oidc_issuer|JwtBearer\w*)\b/.test(
      serverAuthSources,
    );
  if (hasBearerMiddlewarePath && hasTrustedIssuerPath) {
    fail(
      'upstream blocker check failed: EXT-23 may have landed; server routes/config now reference a Bearer/JWKS/RS256 trusted-issuer path',
    );
  }
}

function assertExt26StillBlocked(responses, routes) {
  const draftView = extractRustBlock(responses, 'pub struct DraftView');
  if (draftView.includes('draft_state')) {
    fail('upstream blocker check failed: EXT-26 may have landed; DraftView now exposes draft_state');
  }
  const landingPatterns = [
    [routes, /path\s*=\s*"\/drafts\/\{draft_id\}\/state"/, 'a dedicated draft-state OpenAPI route exists'],
    [routes, /\.route\(\s*"\/drafts\/\{draft_id\}\/state"\s*,\s*get\(/s, 'a dedicated draft-state router route exists'],
    [routes, /\bget_draft_state\b/, 'a get_draft_state route handler exists'],
    [routes, /\bDraftStateView\b/, 'a DraftStateView route type exists'],
    [responses, /\bDraftStateView\b/, 'a DraftStateView service type exists'],
    [routes, /get\s*,\s*path\s*=\s*"\/runtime\/forms\/\{form_id\}\/drafts"/, 'a scoped form-draft OpenAPI lookup route exists'],
    [routes, /\.route\(\s*"\/runtime\/forms\/\{form_id\}\/drafts"\s*,\s*get\(/s, 'a scoped form-draft router lookup route exists'],
    [routes, /path\s*=\s*"\/runtime\/forms\/\{form_id\}\/drafts\/\{draft_id\}"/, 'a scoped form-draft detail OpenAPI route exists'],
    [routes, /\.route\(\s*"\/runtime\/forms\/\{form_id\}\/drafts\/\{draft_id\}"/s, 'a scoped form-draft detail router route exists'],
    [routes, /\b(?:list|lookup|get)_form_drafts?\b/, 'a scoped form-draft lookup handler exists'],
  ];
  failIfAnyPattern(
    landingPatterns,
    'upstream blocker check failed: EXT-26 may have landed',
  );
}

function assertExt27StillBlocked(responses, routes) {
  const updateDraftCommand = extractRustBlock(responses, 'pub struct UpdateDraftCommand');
  if (updateDraftCommand.includes('anonymous_session_token')) {
    fail('upstream blocker check failed: EXT-27 may have landed; UpdateDraftCommand now accepts anonymous_session_token');
  }
  const updateDraft = extractRustFunction(responses, 'pub async fn update_draft');
  if (updateDraft.includes('verify_anonymous_session')) {
    fail('upstream blocker check failed: EXT-27 may have landed; update_draft now verifies anonymous session tokens');
  }
  const landingPatterns = [
    [routes, /path\s*=\s*"\/drafts\/\{draft_id\}\/(?:anonymous|session)"/, 'a session-bound draft update OpenAPI route exists'],
    [routes, /\.route\(\s*"\/drafts\/\{draft_id\}\/(?:anonymous|session)"\s*,\s*patch\(/s, 'a session-bound draft update router route exists'],
    [routes, /path\s*=\s*"\/runtime\/forms\/\{form_id\}\/drafts\/\{draft_id\}"/, 'a scoped draft update OpenAPI route exists'],
    [routes, /\.route\(\s*"\/runtime\/forms\/\{form_id\}\/drafts\/\{draft_id\}"\s*,\s*patch\(/s, 'a scoped draft update router route exists'],
    [routes, /\b(?:Anonymous|SessionBound)\w*UpdateDraftCommand\b/, 'a session-bound draft update request type exists'],
    [routes, /\bUpdate(?:Anonymous|SessionBound)\w*DraftCommand\b/, 'a session-bound draft update request type exists'],
    [routes, /\bupdate_(?:anonymous|session_bound)_draft\b/, 'a session-bound draft update handler exists'],
  ];
  failIfAnyPattern(
    landingPatterns,
    'upstream blocker check failed: EXT-27 may have landed',
  );
}

function assertDocsKeepBlockers(rootDir) {
  for (const [blocker, paths] of requiredDocs) {
    for (const path of paths) {
      const text = readRepoFile(rootDir, path);
      if (!text.includes(blocker)) {
        fail(`upstream blocker check failed: ${path} no longer names ${blocker}`);
      }
    }
  }
}

function extractRustBlock(text, declaration) {
  const start = text.indexOf(declaration);
  if (start === -1) {
    fail(`upstream blocker check failed: missing Rust declaration "${declaration}"`);
  }
  const braceStart = text.indexOf('{', start);
  if (braceStart === -1) {
    fail(`upstream blocker check failed: declaration "${declaration}" has no body`);
  }
  return balancedBlock(text, braceStart, declaration);
}

function extractRustFunction(text, declaration) {
  return extractRustBlock(text, declaration);
}

function balancedBlock(text, braceStart, label) {
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(braceStart, index + 1);
      }
    }
  }
  fail(`upstream blocker check failed: declaration "${label}" has an unterminated body`);
}

function failIfAnyPattern(patterns, message) {
  for (const [text, pattern, detail] of patterns) {
    if (pattern.test(text)) {
      fail(`${message}; ${detail}`);
    }
  }
}

function fail(message) {
  throw new Error(message);
}
