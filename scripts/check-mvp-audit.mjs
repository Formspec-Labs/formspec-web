/* global console */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredMilestones = new Map([
  ['M0 preconditions', ['PLANNING.md', 'package.json', 'npm run typecheck', 'npm run ci']],
  [
    'M1 repo posture',
    [
      'README.md',
      'CONTRIBUTING.md',
      'Dockerfile',
      '.github/workflows/ci.yml',
      'npm run ci',
      'npm run check:upstream-theme',
    ],
  ],
  [
    'M2 configuration model',
    ['src/profiles/profiles.test.ts', 'docs/configuration.md', 'docs/profiles.md', 'npm run test:unit'],
  ],
  [
    'M3 port contracts',
    [
      'npm run test:conformance',
      'npm run check:conformance-coverage',
      'src/adapter-conformance/index.ts',
      'tests/adapter-conformance/',
      'docs/ports/definition-source.md',
      'docs/ports/draft-store.md',
      'docs/ports/submit-transport.md',
      'docs/ports/identity-provider.md',
      'docs/ports/notification-delivery.md',
    ],
  ],
  [
    'M4 reference adapters',
    [
      'tests/adapters/http/definition-source.test.ts',
      'tests/adapters/http/draft-store.test.ts',
      'tests/adapters/http/submit-transport.test.ts',
      'tests/adapters/http/http-client.test.ts',
      'tests/adapters/http/anonymous-session.test.ts',
      'tests/adapters/identity/anonymous.test.ts',
      'tests/adapters/identity/oidc.test.ts',
      'tests/adapters/identity/magic-link.test.ts',
      'docs/adapters/definition-source.md',
      'docs/adapters/draft-store.md',
      'docs/adapters/submit-transport.md',
      'docs/adapters/identity-provider.md',
      'docs/adapters/notification-delivery.md',
    ],
  ],
  [
    'M5 default composition',
    [
      'tests/demo/sample-form.test.ts',
      'tests/smoke/composition.test.ts',
      'docs/getting-started.md',
      'npm run test:compose-quickstart',
      'npm run check:release-docs',
    ],
  ],
  [
    'M6 respondent runtime',
    [
      'tests/app/respondent-flow.test.ts',
      'tests/app/respondent-runtime.test.tsx',
      'tests/e2e/placeholder-a11y.spec.ts',
      'npm run check:bundle-budget',
      'npm run test:deployment',
      'docs/ux/accessibility.md',
      'docs/ux/i18n.md',
      'docs/testing-plan.md',
    ],
  ],
  [
    'M7 identity close',
    [
      'tests/adapter-conformance/identity-provider/conformance.test.ts',
      'tests/adapters/http/anonymous-session.test.ts',
      'tests/adapters/identity/oidc.test.ts',
      'tests/smoke/composition.test.ts',
      'docs/identity/integration.md',
      'docs/identity/multi-flow.md',
      'thoughts/specs/2026-05-22-upstream-extension-queue.md',
      'npm run check:upstream-blockers',
      'scripts/check-upstream-blockers.mjs',
    ],
  ],
  [
    'M8 deployment closeout',
    [
      'npm run build',
      'npm run check:compose-config',
      'npm run test:compose-quickstart',
      'npm run test:deployment',
      'npm run test:multi-deployment',
      'npm run check:release-docs',
      'npm run check:upstream-blockers',
      'docker-compose.yml',
      'docs/deployment.md',
      'docs/operations.md',
      'docs/multi-deployment.md',
      'thoughts/specs/2026-05-22-upstream-extension-queue.md',
      'scripts/check-upstream-blockers.mjs',
    ],
  ],
]);
const requiredBoundaries = new Map([
  ['VoiceOver sweep', ['Pending manual run', 'docs/ux/accessibility.md', 'docs/testing-plan.md']],
  ['NVDA sweep', ['Pending manual run', 'docs/ux/accessibility.md', 'docs/testing-plan.md']],
  [
    'Lighthouse mobile refresh',
    ['Passes on local Docker/nginx evidence; refresh before release tag', 'docs/ux/responsive.md', 'docs/testing-plan.md'],
  ],
  [
    'Production Locale Documents from server',
    ['Demo-proven only until server emits concrete Locale Documents', 'docs/ux/i18n.md', 'docs/testing-plan.md'],
  ],
  [
    'Full OIDC server validation',
    [
      'Blocked by EXT-23',
      'docs/identity/integration.md',
      'thoughts/specs/2026-05-22-upstream-extension-queue.md',
      'docs/testing-plan.md',
      'npm run check:upstream-blockers',
    ],
  ],
  [
    'Cross-reload or cross-device draft resume',
    [
      'Blocked by EXT-26',
      'docs/adapters/draft-store.md',
      'thoughts/specs/2026-05-22-upstream-extension-queue.md',
      'docs/testing-plan.md',
      'npm run check:upstream-blockers',
    ],
  ],
  [
    'Session-bound anonymous draft update',
    [
      'Blocked by EXT-27',
      'docs/adapters/draft-store.md',
      'thoughts/specs/2026-05-22-upstream-extension-queue.md',
      'docs/testing-plan.md',
      'npm run check:upstream-blockers',
    ],
  ],
  ['Hosted demo URL', ['Deferred to user action', 'docs/deployment.md', 'docs/operations.md', 'README.md']],
]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = rootDirFromArgs(process.argv.slice(2)) ?? defaultRootDir;
  const result = checkMvpAudit(rootDir);
  console.log(
    `mvp audit check passed: ${result.milestoneCount} milestone row(s), ${result.boundaryCount} boundary row(s), ${result.evidenceCount} evidence reference(s)`,
  );
}

export function checkMvpAudit(rootDir) {
  const audit = readFile(rootDir, 'docs/mvp-audit.md');
  const packageJson = JSON.parse(readFile(rootDir, 'package.json'));
  const milestoneRows = rowsByFirstColumn(sectionRows(audit, '## Milestone Evidence', '## Release Sign-Off Boundaries'));
  const boundaryRows = rowsByFirstColumn(sectionRows(audit, '## Release Sign-Off Boundaries', '## Audit Gate'));
  const evidence = new Set();

  assertPhrase(audit, 'Local web MVP proof is implemented and gated by `npm run ci`');
  assertPhrase(audit, 'Do not describe M6, M7b, cross-device draft resume, session-bound anonymous');
  assertPhrase(audit, '`npm run check:mvp-audit` verifies this file');
  assertPhrase(audit, '`npm run check:upstream-blockers`');

  for (const [milestone, requiredEvidence] of requiredMilestones) {
    const row = milestoneRows.get(milestone);
    if (!row) {
      fail(`mvp audit check failed: missing milestone row "${milestone}"`);
    }
    const evidenceCell = row[2] ?? '';
    for (const reference of requiredEvidence) {
      assertReferencePresent(evidenceCell, reference, `milestone row "${milestone}"`);
      evidence.add(reference);
    }
  }

  for (const [boundary, [status, ...requiredEvidence]] of requiredBoundaries) {
    const row = boundaryRows.get(boundary);
    if (!row) {
      fail(`mvp audit check failed: missing release boundary row "${boundary}"`);
    }
    if (normalizeStatus(row[1] ?? '') !== status) {
      fail(
        `mvp audit check failed: release boundary "${boundary}" status must be "${status}"`,
      );
    }
    const evidenceCell = row[2] ?? '';
    for (const reference of requiredEvidence) {
      assertReferencePresent(evidenceCell, reference, `release boundary row "${boundary}"`);
      evidence.add(reference);
    }
  }

  for (const reference of evidence) {
    assertEvidenceExists(rootDir, packageJson, reference);
  }

  return {
    milestoneCount: requiredMilestones.size,
    boundaryCount: requiredBoundaries.size,
    evidenceCount: evidence.size,
  };
}

function rootDirFromArgs(args) {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 2 && args[0] === '--root') {
    return args[1];
  }
  fail('usage: node scripts/check-mvp-audit.mjs [--root <repo-root>]');
}

function readFile(rootDir, relativePath) {
  return readFileSync(join(rootDir, relativePath), 'utf8');
}

function sectionRows(text, startHeading, endHeading) {
  return markdownRows(between(text, startHeading, endHeading));
}

function markdownRows(section) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .filter((line) => !line.includes('---'))
    .filter((line) => !line.startsWith('| Milestone |') && !line.startsWith('| Boundary |'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
}

function rowsByFirstColumn(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row[0];
    if (map.has(key)) {
      fail(`mvp audit check failed: duplicate row "${key}"`);
    }
    map.set(key, row);
  }
  return map;
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    fail(`mvp audit check failed: missing section "${startMarker}"`);
  }

  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    fail(`mvp audit check failed: missing section "${endMarker}" after "${startMarker}"`);
  }

  return text.slice(start + startMarker.length, end);
}

function assertPhrase(text, phrase) {
  if (!text.includes(phrase)) {
    fail(`mvp audit check failed: docs/mvp-audit.md is missing "${phrase}"`);
  }
}

function assertReferencePresent(cell, reference, label) {
  if (!codeSpans(cell).includes(reference)) {
    fail(`mvp audit check failed: ${label} is missing evidence "${reference}"`);
  }
}

function assertEvidenceExists(rootDir, packageJson, reference) {
  const script = npmRunScript(reference);
  if (script) {
    if (typeof packageJson.scripts?.[script] !== 'string') {
      fail(`mvp audit check failed: package.json is missing script "${script}"`);
    }
    return;
  }

  if (!looksLikePath(reference)) {
    fail(`mvp audit check failed: unsupported evidence reference "${reference}"`);
  }

  if (!existsSync(join(rootDir, normalizePath(reference)))) {
    fail(`mvp audit check failed: evidence path "${reference}" does not exist`);
  }
}

function npmRunScript(reference) {
  return /^npm run ([\w:-]+)$/.exec(reference)?.[1] ?? null;
}

function codeSpans(text) {
  return Array.from(text.matchAll(/`([^`]+)`/g), (match) => match[1]);
}

function looksLikePath(reference) {
  return (
    reference.startsWith('.') ||
    reference.startsWith('docs/') ||
    reference.startsWith('scripts/') ||
    reference.startsWith('src/') ||
    reference.startsWith('tests/') ||
    reference.startsWith('thoughts/') ||
    reference === 'Dockerfile' ||
    /^[A-Za-z0-9_.-]+\.(?:json|md|toml|ya?ml)$/.test(reference)
  );
}

function normalizePath(path) {
  return path.replace(/^\.\//, '').replace(/\/+$/, '');
}

function normalizeStatus(status) {
  return status.trim().replace(/\.$/, '');
}

function fail(message) {
  throw new Error(message);
}
