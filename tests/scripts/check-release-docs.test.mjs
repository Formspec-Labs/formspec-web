import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(repoRoot, 'scripts/check-release-docs.mjs');
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-release-docs', () => {
  it('accepts release docs with hosted-demo deferral and hosting recipes', () => {
    const result = runCheck(createFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('release docs check passed');
  });

  it('rejects deployment docs without a static hosting recipe', () => {
    const result = runCheck(createFixture({ omitCloudflareRecipe: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'docs/deployment.md is missing section "## Cloudflare Pages Static Export"',
    );
  });

  it('rejects deployment docs without the hosted-demo deferral decision', () => {
    const result = runCheck(createFixture({ omitHostedDemoDecision: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'docs/deployment.md is missing section "## Hosted Demo Decision"',
    );
  });

  it('rejects operational docs that stop naming the hosted-demo gap', () => {
    const result = runCheck(createFixture({ omitHostedDemoGap: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'docs/operations.md ## Current Operational Gaps is missing "No hosted demo URL is selected"',
    );
  });

  it('rejects stale pipeline tracker prose', () => {
    const result = runCheck(createFixture({ omitPlanningReleaseDocsGate: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'PLANNING.md ### FW-0016 — Build and test pipeline producing a deployable artifact is missing "release-docs integrity"',
    );
  });

  it('rejects missing reference-deployment extension queue entries', () => {
    const result = runCheck(createFixture({ omitExtension: 'EXT-26' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'thoughts/specs/2026-05-22-upstream-extension-queue.md is missing entry "EXT-26"',
    );
  });

  it('rejects EXT-23 if it stops naming the M7 gate', () => {
    const result = runCheck(createFixture({ ext23Status: 'filed' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'thoughts/specs/2026-05-22-upstream-extension-queue.md EXT-23 Status is "filed", expected prefix "filed; gates M7"',
    );
  });

  it('rejects exact owner drift in extension queue entries', () => {
    const result = runCheck(
      createFixture({
        ownerOverrides: {
          'EXT-22': 'formspec-server',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'thoughts/specs/2026-05-22-upstream-extension-queue.md EXT-22 Owning repo is "formspec-server", expected "formspec"',
    );
  });

  it('rejects blank extension queue status fields', () => {
    const result = runCheck(
      createFixture({
        statusOverrides: {
          'EXT-24': '',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'thoughts/specs/2026-05-22-upstream-extension-queue.md EXT-24 is missing non-empty field "Status"',
    );
  });
});

function runCheck(root) {
  return spawnSync('node', [scriptPath, '--root', root], {
    encoding: 'utf8',
  });
}

function createFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'formspec-web-release-docs-'));
  tempRoots.push(root);

  write(root, 'docs/deployment.md', deploymentDoc(options));
  write(root, 'docs/operations.md', operationsDoc(options));
  write(root, 'PLANNING.md', planningDoc(options));
  write(
    root,
    'thoughts/specs/2026-05-22-upstream-extension-queue.md',
    extensionQueueDoc(options),
  );

  return root;
}

function deploymentDoc(options) {
  return [
    '# Deployment',
    '',
    ...(options.omitHostedDemoDecision
      ? []
      : [
          '## Hosted Demo Decision',
          '',
          'Hosted demo selection is deferred to user action. Local Docker compose is the release proof.',
          '',
        ]),
    '## Vercel Static Export',
    '',
    'Run `npm run build`, publish `dist`, and set `VITE_FORMSPEC_WEB_SERVER_URL` when needed.',
    '',
    ...(options.omitCloudflareRecipe
      ? []
      : [
          '## Cloudflare Pages Static Export',
          '',
          'Run `npm run build`, publish `dist`, and set `VITE_FORMSPEC_WEB_SERVER_URL` when needed.',
          '',
        ]),
    '## Docker Behind Reverse Proxy',
    '',
    'Set `FORMSPEC_WEB_SERVER_URL`; keep `/formspec-runtime-config.js` served with `no-store`.',
    '',
    '## Deferred Server Stack',
    '',
    'EXT-23 and EXT-25 block the full server stack.',
  ].join('\n');
}

function operationsDoc(options) {
  return [
    '# Operations',
    '',
    '## Current Operational Gaps',
    '',
    ...(options.omitHostedDemoGap
      ? ['- Full server-backed OIDC operations wait for EXT-23 server validation.']
      : [
          '- No hosted demo URL is selected. Local Docker compose is the release proof for now.',
          '- Full server-backed OIDC operations wait for EXT-23 server validation.',
        ]),
  ].join('\n');
}

function planningDoc(options) {
  return [
    '# Web Planning',
    '',
    '## MVP',
    '',
    '### FW-0016 — Build and test pipeline producing a deployable artifact',
    '',
    options.omitPlanningReleaseDocsGate
      ? 'The build pipeline runs testing-plan integrity and documented compose quickstart smoke.'
      : 'The build pipeline runs testing-plan integrity, release-docs integrity, documented compose quickstart smoke, and `npm run check:release-docs`.',
    '',
    '### FW-0001 — End-to-end Respondent thin-slice (deployable)',
    '',
    'Next row.',
  ].join('\n');
}

function extensionQueueDoc(options) {
  return [
    '# Upstream extension queue',
    '',
    '## Class 4 - Reference deployment and server gaps',
    '',
    ...[
      ['EXT-19', 'formspec-server', 'not yet filed'],
      ['EXT-20', 'formspec-server', 'not yet filed'],
      ['EXT-21', 'formspec-server', 'not yet filed'],
      ['EXT-22', 'formspec', 'not yet filed'],
      ['EXT-23', 'formspec-server', options.ext23Status ?? 'filed; gates M7'],
      ['EXT-24', 'formspec-server', 'not yet filed'],
      ['EXT-25', 'formspec-server', 'not yet filed'],
      ['EXT-26', 'formspec-server', 'not yet filed'],
      ['EXT-27', 'formspec-server', 'not yet filed'],
    ].flatMap(([id, owner, status]) => {
      if (id === options.omitExtension) {
        return [];
      }
      const ownerValue = options.ownerOverrides?.[id] ?? owner;
      const statusValue =
        options.statusOverrides?.[id] ??
        (id === 'EXT-23' && options.ext23Status !== undefined ? options.ext23Status : status);
      return [
        `### ${id}: Fixture entry`,
        '',
        `**Owning repo:** ${ownerValue}`,
        '**FW rows blocked:** Fixture row',
        '**Shape:** Fixture shape.',
        '**Fixture status:** none.',
        `**Status:** ${statusValue}`,
        '',
      ];
    }),
  ].join('\n');
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
