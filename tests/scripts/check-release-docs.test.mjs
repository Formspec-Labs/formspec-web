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

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
