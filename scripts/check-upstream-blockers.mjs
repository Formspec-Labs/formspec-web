/* global console */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredDocs = new Map([
  ['EXT-26', ['docs/adapters/draft-store.md', 'docs/testing-plan.md', 'docs/mvp-audit.md']],
]);

export function checkUpstreamBlockers(rootDir, serverDir) {
  assertServerDir(serverDir);

  const endpoints = readServerFile(serverDir, 'crates/formspec-server/src/endpoints.rs');
  const routes = readServerFile(serverDir, 'crates/formspec-server/src/routes.rs');

  assertExt26StillBlocked(endpoints, routes);
  assertDocsKeepBlockers(rootDir);

  return {
    blockerCount: 1,
    sourceFileCount: 2,
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

// EXT-26's draft-state read landed (formspec-server 0f89b45); only the scoped
// draft lookup/list by form and verified subject is still missing. The read is
// pinned so a moved draft surface fails loudly instead of silently passing, and
// any other draft endpoint without {draft_id}, of any method, is a candidate
// lookup/list until it is named here.
const DRAFT_READ = 'GET /drafts/{draft_id}';
const DRAFT_ENDPOINTS_WITHOUT_ID = new Set([
  'POST /runtime/forms/{form_id}/drafts', // create a draft
  'POST /runtime/task-drafts', // launch a task draft
]);
// Handlers whose names read like lookup/list but are not EXT-26.
const NON_LOOKUP_DRAFT_HANDLERS = new Set([
  'get_draft_application_case_lookup', // the application case one known draft started
]);
const ENDPOINT_CALL = /\bEndpoint::(get|post|put|patch|delete)\(/g;
const ENDPOINT_DECLARATION = /\bEndpoint::(get|post|put|patch|delete)\(\s*"([^"]*)"\s*\)/g;
const LOOKUP_NAME = /(?:^|_)(?:list|lookup|find|search|query)(?:_|$)|_(?:for|by)_(?:subject|form|actor)(?:_|$)/;

function assertExt26StillBlocked(endpoints, routes) {
  const declared = [...endpoints.matchAll(ENDPOINT_DECLARATION)].map(([, method, path]) => `${method.toUpperCase()} ${path}`);
  if (declared.length !== [...endpoints.matchAll(ENDPOINT_CALL)].length) {
    fail('upstream blocker check failed: an Endpoint declaration in endpoints.rs no longer names a literal path; re-derive EXT-26 detection');
  }
  if (!declared.includes(DRAFT_READ)) {
    fail(`upstream blocker check failed: ${DRAFT_READ} is no longer declared; the draft routes moved, so re-derive EXT-26 detection`);
  }
  const candidate = declared.find(
    endpoint => /drafts/.test(endpoint) && !endpoint.includes('{draft_id}') && !DRAFT_ENDPOINTS_WITHOUT_ID.has(endpoint),
  );
  if (candidate) {
    fail(`upstream blocker check failed: EXT-26 may have landed; a draft lookup/list endpoint exists (${candidate})`);
  }
  const handler = [...routes.matchAll(/\bfn\s+(\w*drafts?\w*)\s*[<(]/g)]
    .map(([, name]) => name)
    .find(name => LOOKUP_NAME.test(name) && !NON_LOOKUP_DRAFT_HANDLERS.has(name));
  if (handler) {
    fail(`upstream blocker check failed: EXT-26 may have landed; a draft lookup/list handler exists (${handler})`);
  }
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

function fail(message) {
  throw new Error(message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = rootDirFromArgs(process.argv.slice(2)) ?? defaultRootDir;
  const result = checkUpstreamBlockers(rootDir, formspecServerDir(rootDir));
  console.log(
    `upstream blocker check passed: ${result.blockerCount} blocker(s), ${result.sourceFileCount} server source file(s), ${result.docCount} doc reference(s)`,
  );
}
