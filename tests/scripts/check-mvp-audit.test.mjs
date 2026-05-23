import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(repoRoot, 'scripts/check-mvp-audit.mjs');
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-mvp-audit', () => {
  it('accepts a fully wired MVP audit fixture', () => {
    const result = runCheck(createFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('mvp audit check passed');
  });

  it('rejects missing milestone rows', () => {
    const result = runCheck(createFixture({ omitMilestone: 'M7 identity close' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing milestone row "M7 identity close"');
  });

  it('rejects milestone rows that omit required evidence', () => {
    const result = runCheck(
      createFixture({ omitEvidence: 'tests/adapters/http/anonymous-session.test.ts' }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'milestone row "M4 reference adapters" is missing evidence "tests/adapters/http/anonymous-session.test.ts"',
    );
  });

  it('rejects duplicate milestone rows', () => {
    const result = runCheck(createFixture({ duplicateMilestone: 'M3 port contracts' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('duplicate row "M3 port contracts"');
  });

  it('rejects release boundary status drift', () => {
    const result = runCheck(
      createFixture({
        boundaryStatusOverrides: {
          'Full OIDC server validation': 'Pending.',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'release boundary "Full OIDC server validation" status must be "Blocked by EXT-23"',
    );
  });

  it('rejects missing release boundary evidence', () => {
    const result = runCheck(
      createFixture({
        omitBoundaryEvidence: 'thoughts/specs/2026-05-22-upstream-extension-queue.md',
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'release boundary row "Full OIDC server validation" is missing evidence "thoughts/specs/2026-05-22-upstream-extension-queue.md"',
    );
  });

  it('rejects missing completion audit rows', () => {
    const result = runCheck(createFixture({ omitCompletion: 'Full release sign-off' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing completion audit row "Full release sign-off"');
  });

  it('rejects completion audit status drift', () => {
    const result = runCheck(
      createFixture({
        completionStatusOverrides: {
          'Full release sign-off': 'Proven.',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'completion audit "Full release sign-off" status must be "Blocked by manual and upstream evidence"',
    );
  });

  it('rejects missing completion audit evidence', () => {
    const result = runCheck(createFixture({ omitCompletionEvidence: 'npm run check:testing-plan' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'completion audit row "Testing plan implementation" is missing evidence "npm run check:testing-plan"',
    );
  });

  it('rejects evidence paths that do not exist', () => {
    const result = runCheck(createFixture({ omitPath: 'docs/identity/integration.md' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('evidence path "docs/identity/integration.md" does not exist');
  });

  it('rejects npm script evidence that is not implemented', () => {
    const result = runCheck(createFixture({ omitScript: 'test:multi-deployment' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('package.json is missing script "test:multi-deployment"');
  });
});

function runCheck(root) {
  return spawnSync('node', [scriptPath, '--root', root], {
    encoding: 'utf8',
  });
}

function createFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'formspec-web-mvp-audit-'));
  tempRoots.push(root);

  const scripts = [
    'typecheck',
    'ci',
    'check:testing-plan',
    'check:mvp-audit',
    'check:upstream-theme',
    'test:unit',
    'test:conformance',
    'check:conformance-coverage',
    'test:compose-quickstart',
    'check:release-docs',
    'check:upstream-blockers',
    'check:bundle-budget',
    'test:deployment',
    'build',
    'check:compose-config',
    'test:multi-deployment',
  ].filter((script) => script !== options.omitScript);

  write(
    root,
    'package.json',
    JSON.stringify({ scripts: Object.fromEntries(scripts.map((script) => [script, 'fixture'])) }),
  );
  write(root, 'docs/mvp-audit.md', mvpAuditDoc(options));

  for (const path of evidencePaths()) {
    if (path !== 'package.json' && path !== options.omitPath) {
      write(root, path, '');
    }
  }

  return root;
}

function mvpAuditDoc(options = {}) {
  const milestones = [
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
  ];
  const boundaries = [
    ['VoiceOver sweep', 'Pending manual run.', ['docs/ux/accessibility.md', 'docs/testing-plan.md']],
    ['NVDA sweep', 'Pending manual run.', ['docs/ux/accessibility.md', 'docs/testing-plan.md']],
    [
      'Lighthouse mobile refresh',
      'Passes on local Docker/nginx evidence; refresh before release tag.',
      ['docs/ux/responsive.md', 'docs/testing-plan.md'],
    ],
    [
      'Production Locale Documents from server',
      'Demo-proven only until server emits concrete Locale Documents.',
      ['docs/ux/i18n.md', 'docs/testing-plan.md'],
    ],
    [
      'Full OIDC server validation',
      options.boundaryStatusOverrides?.['Full OIDC server validation'] ?? 'Blocked by EXT-23.',
      [
        'docs/identity/integration.md',
        'thoughts/specs/2026-05-22-upstream-extension-queue.md',
        'docs/testing-plan.md',
        'npm run check:upstream-blockers',
      ],
    ],
    [
      'Cross-reload or cross-device draft resume',
      'Blocked by EXT-26.',
      [
        'docs/adapters/draft-store.md',
        'thoughts/specs/2026-05-22-upstream-extension-queue.md',
        'docs/testing-plan.md',
        'npm run check:upstream-blockers',
      ],
    ],
    [
      'Session-bound anonymous draft update',
      'Blocked by EXT-27.',
      [
        'docs/adapters/draft-store.md',
        'thoughts/specs/2026-05-22-upstream-extension-queue.md',
        'docs/testing-plan.md',
        'npm run check:upstream-blockers',
      ],
    ],
    ['Hosted demo URL', 'Deferred to user action.', ['docs/deployment.md', 'docs/operations.md', 'README.md']],
  ];
  const completionRows = [
    [
      'Testing plan implementation',
      options.completionStatusOverrides?.['Testing plan implementation'] ?? 'Proven.',
      [
        'docs/testing-plan.md',
        'scripts/check-testing-plan.mjs',
        'tests/scripts/check-testing-plan.test.mjs',
        'npm run check:testing-plan',
        'package.json',
      ],
    ],
    [
      'M0-M8 local web proof',
      'Proven.',
      ['npm run ci', 'docs/mvp-audit.md', 'npm run check:mvp-audit', 'scripts/check-mvp-audit.mjs'],
    ],
    [
      'Port conformance and reference adapters',
      'Proven.',
      [
        'npm run test:conformance',
        'npm run check:conformance-coverage',
        'tests/adapter-conformance/',
        'docs/architecture.md',
      ],
    ],
    [
      'Docker quickstart and multi-deployment',
      'Proven.',
      [
        'npm run test:compose-quickstart',
        'npm run test:deployment',
        'npm run test:multi-deployment',
        'docker-compose.yml',
        'docs/multi-deployment.md',
      ],
    ],
    [
      'Full release sign-off',
      options.completionStatusOverrides?.['Full release sign-off'] ?? 'Blocked by manual and upstream evidence.',
      [
        'docs/testing-plan.md',
        'docs/ux/accessibility.md',
        'docs/identity/integration.md',
        'docs/adapters/draft-store.md',
        'thoughts/specs/2026-05-22-upstream-extension-queue.md',
        'npm run check:upstream-blockers',
      ],
    ],
    [
      'Owner-hosted demo URL',
      'Deferred to user action.',
      ['docs/deployment.md', 'docs/operations.md', 'README.md'],
    ],
  ];

  return [
    '# MVP Audit',
    '',
    '## Scope Verdict',
    '',
    'Local web MVP proof is implemented and gated by `npm run ci`.',
    '',
    'Do not describe M6, M7b, cross-device draft resume, session-bound anonymous draft update, production Locale Documents, or server-backed OIDC as release signed until their blocker rows close.',
    '',
    '## Milestone Evidence',
    '',
    '| Milestone | Verdict | Evidence |',
    '| --- | --- | --- |',
    ...milestones
      .filter(([milestone]) => milestone !== options.omitMilestone)
      .flatMap(([milestone, references]) => {
        const row = milestoneRow(milestone, references, options);
        return milestone === options.duplicateMilestone ? [row, row] : [row];
      }),
    '',
    '## Release Sign-Off Boundaries',
    '',
    '| Boundary | Status | Evidence |',
    '| --- | --- | --- |',
    ...boundaries.map(([boundary, status, references]) => boundaryRow(boundary, status, references, options)),
    '',
    '## Completion Audit',
    '',
    '| Requirement | Status | Evidence |',
    '| --- | --- | --- |',
    ...completionRows
      .filter(([requirement]) => requirement !== options.omitCompletion)
      .map(([requirement, status, references]) => completionRow(requirement, status, references, options)),
    '',
    '## Audit Gate',
    '',
    '`npm run check:mvp-audit` verifies this file.',
    'Blocked by manual and upstream evidence.',
    '`npm run check:upstream-blockers` keeps server blockers current.',
  ].join('\n');
}

function milestoneRow(milestone, references, options) {
  return `| ${milestone} | Fixture verdict. | ${formatEvidence(
    references.filter((reference) => reference !== options.omitEvidence),
  )}. |`;
}

function boundaryRow(boundary, status, references, options) {
  return `| ${boundary} | ${status} | ${formatEvidence(
    references.filter((reference) => reference !== options.omitBoundaryEvidence),
  )}. |`;
}

function completionRow(requirement, status, references, options) {
  return `| ${requirement} | ${status} | ${formatEvidence(
    references.filter((reference) => reference !== options.omitCompletionEvidence),
  )}. |`;
}

function formatEvidence(references) {
  return references.map((reference) => `\`${reference}\``).join('; ');
}

function evidencePaths() {
  return [
    '.github/workflows/ci.yml',
    'CONTRIBUTING.md',
    'Dockerfile',
    'PLANNING.md',
    'README.md',
    'docker-compose.yml',
    'docs/adapters/definition-source.md',
    'docs/adapters/draft-store.md',
    'docs/adapters/identity-provider.md',
    'docs/adapters/notification-delivery.md',
    'docs/adapters/submit-transport.md',
    'docs/architecture.md',
    'docs/configuration.md',
    'docs/deployment.md',
    'docs/getting-started.md',
    'docs/identity/integration.md',
    'docs/identity/multi-flow.md',
    'docs/multi-deployment.md',
    'docs/operations.md',
    'docs/ports/definition-source.md',
    'docs/ports/draft-store.md',
    'docs/ports/identity-provider.md',
    'docs/ports/notification-delivery.md',
    'docs/ports/submit-transport.md',
    'docs/profiles.md',
    'docs/testing-plan.md',
    'docs/ux/accessibility.md',
    'docs/ux/i18n.md',
    'docs/ux/responsive.md',
    'package.json',
    'scripts/check-upstream-blockers.mjs',
    'scripts/check-mvp-audit.mjs',
    'scripts/check-testing-plan.mjs',
    'src/adapter-conformance/index.ts',
    'src/profiles/profiles.test.ts',
    'tests/adapter-conformance/',
    'tests/scripts/check-testing-plan.test.mjs',
    'tests/adapter-conformance/identity-provider/conformance.test.ts',
    'tests/adapters/http/anonymous-session.test.ts',
    'tests/adapters/http/definition-source.test.ts',
    'tests/adapters/http/draft-store.test.ts',
    'tests/adapters/http/http-client.test.ts',
    'tests/adapters/http/submit-transport.test.ts',
    'tests/adapters/identity/anonymous.test.ts',
    'tests/adapters/identity/magic-link.test.ts',
    'tests/adapters/identity/oidc.test.ts',
    'tests/app/respondent-flow.test.ts',
    'tests/app/respondent-runtime.test.tsx',
    'tests/demo/sample-form.test.ts',
    'tests/e2e/placeholder-a11y.spec.ts',
    'tests/smoke/composition.test.ts',
    'thoughts/specs/2026-05-22-upstream-extension-queue.md',
  ];
}

function write(root, path, contents) {
  const target = join(root, path);
  if (path.endsWith('/')) {
    mkdirSync(target, { recursive: true });
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
