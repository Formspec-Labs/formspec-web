/* global console */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredDocs = new Map([
  ['EXT-26', ['docs/adapters/draft-store.md', 'docs/testing-plan.md', 'docs/mvp-audit.md']],
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
// draft lookup/list by form and verified subject is still missing.
function assertExt26StillBlocked(endpoints, routes) {
  failIfAnyPattern(
    [
      [endpoints, /Endpoint::get\(\s*"[^"]*\/drafts"\s*\)/, 'a draft lookup/list endpoint exists'],
      [routes, /\b(?:list|lookup|find)_(?:form_|subject_)?drafts\b/, 'a draft lookup/list handler exists'],
    ],
    'upstream blocker check failed: EXT-26 may have landed',
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
