import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(repoRoot, 'scripts/check-testing-plan.mjs');
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-testing-plan', () => {
  it('accepts a fully wired testing plan fixture', () => {
    const result = runCheck(createFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('testing plan check passed');
  });

  it('rejects a missing required command row', () => {
    const result = runCheck(createFixture({ omitCommand: 'npm run check:bundle-budget' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('command gate is missing required command "npm run check:bundle-budget"');
  });

  it('rejects workflow comments that only mention a gate', () => {
    const result = runCheck(createFixture({ commentOnlyWorkflowCommand: 'npm run check:testing-plan' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.github/workflows/ci.yml does not run "npm run check:testing-plan"');
  });

  it('rejects missing implementation paths from the coverage matrix', () => {
    const result = runCheck(createFixture({ omitPath: 'scripts/check-testing-plan.mjs' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('coverage matrix references missing path "scripts/check-testing-plan.mjs"');
  });

  it('rejects release gate scripts that drift away from the expected implementation', () => {
    const result = runCheck(
      createFixture({
        scriptOverrides: {
          'test:compose-quickstart': 'node scripts/noop-compose-quickstart.mjs',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'package.json script "test:compose-quickstart" must be "node scripts/check-compose-quickstart.mjs"',
    );
  });

  it('rejects public package exports that drift away from the gated source surface', () => {
    const result = runCheck(
      createFixture({
        exportOverrides: {
          './adapter-conformance': './src/adapter-conformance/noop.ts',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'package.json export "./adapter-conformance" must be "./src/adapter-conformance/index.ts"',
    );
  });

  it('rejects public package exports that point to missing paths', () => {
    const result = runCheck(
      createFixture({
        omitPath: 'src/adapter-conformance/index.ts',
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'package.json export "./adapter-conformance" points to missing path "./src/adapter-conformance/index.ts"',
    );
  });

  it('rejects missing manual release gates', () => {
    const result = runCheck(createFixture({ omitManualGate: 'Full OIDC server validation' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'manual release gate is missing "Full OIDC server validation"',
    );
  });

  it('rejects manual release gate statuses that drop blocker IDs', () => {
    const result = runCheck(
      createFixture({
        manualStatusOverrides: {
          'Full OIDC server validation': 'Pending.',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'manual release gate "Full OIDC server validation" status must be "Blocked by EXT-23"',
    );
  });

  it('rejects manual release gate statuses that contradict release blocking posture', () => {
    const result = runCheck(
      createFixture({
        manualStatusOverrides: {
          'Full OIDC server validation': 'Blocked by EXT-23; advisory only, not a release blocker.',
        },
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'manual release gate "Full OIDC server validation" status must be "Blocked by EXT-23"',
    );
  });

  it('rejects missing manual release gate evidence paths', () => {
    const result = runCheck(createFixture({ omitPath: 'docs/ux/accessibility.md' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'manual release gate "VoiceOver sweep" references missing evidence path "docs/ux/accessibility.md"',
    );
  });

  it('rejects missing root-level documentation paths from the coverage matrix', () => {
    const result = runCheck(createFixture({ omitPath: 'README.md' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('coverage matrix references missing path "README.md"');
  });

  it('rejects referenced test evidence that is not covered by CI test commands', () => {
    const result = runCheck(createFixture({ unitScript: 'vitest run tests/app tests/scripts' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'test evidence path "src/profiles/profiles.test.ts" is not covered by a CI test command',
    );
  });
});

function runCheck(root) {
  return spawnSync('node', [scriptPath, '--root', root], {
    encoding: 'utf8',
  });
}

function createFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'formspec-web-testing-plan-'));
  tempRoots.push(root);

  const unitScript =
    options.unitScript ?? 'vitest run src/profiles tests/app tests/scripts';
  const ciCommands = [
    'npm run typecheck',
    'npm run lint',
    'npm run check:testing-plan',
    'npm run check:release-docs',
    'npm run check:conformance-coverage',
    'npm run test:conformance',
    'npm run test:unit',
    'npm run check:vendor-leaks',
    'npm run check:upstream-theme',
    'npm run test:e2e',
    'npm run build',
    'npm run check:bundle-budget',
    'npm run check:compose-config',
    'npm run test:compose-quickstart',
    'npm run test:deployment',
    'npm run test:multi-deployment',
  ];

  const scripts = {
    typecheck: 'tsc --noEmit',
    lint: 'eslint .',
    'check:testing-plan': 'node scripts/check-testing-plan.mjs',
    'check:release-docs': 'node scripts/check-release-docs.mjs',
    'check:conformance-coverage': 'node scripts/check-conformance-coverage.mjs',
    'test:conformance': 'vitest run tests/adapter-conformance',
    'test:unit': unitScript,
    'check:vendor-leaks': 'scripts/check-vendor-leaks.sh',
    'check:upstream-theme': 'node scripts/check-upstream-theme-assets.mjs',
    'test:e2e': 'playwright test',
    build: 'tsc --noEmit && vite build',
    'check:bundle-budget': 'node scripts/check-bundle-budget.mjs',
    'check:compose-config': 'docker compose config --quiet',
    'test:compose-quickstart': 'node scripts/check-compose-quickstart.mjs',
    'test:deployment': 'node scripts/check-deployment-headers.mjs',
    'test:multi-deployment': 'node scripts/check-multi-deployment.mjs',
    ci: ciCommands.join(' && '),
    ...options.scriptOverrides,
  };
  const exportsMap = {
    '.': './src/index.ts',
    './adapter-conformance': './src/adapter-conformance/index.ts',
    './adapters/http': './src/adapters/http/index.ts',
    './adapters/identity': './src/adapters/identity/index.ts',
    './composition': './src/composition/index.ts',
    './config': './src/config/index.ts',
    './ports': './src/ports/index.ts',
    './profiles': './src/profiles/index.ts',
    './shared': './src/shared/index.ts',
    ...options.exportOverrides,
  };

  write(root, 'package.json', JSON.stringify({ exports: exportsMap, scripts }));
  write(root, '.github/workflows/ci.yml', workflow(ciCommands, options.commentOnlyWorkflowCommand));
  write(root, 'docs/testing-plan.md', testingPlan(options));

  for (const path of [
    'scripts/check-testing-plan.mjs',
    'src/profiles/profiles.test.ts',
    'tests/app/respondent-flow.test.ts',
    'tests/e2e/placeholder-a11y.spec.ts',
    'tests/scripts/check-testing-plan.test.mjs',
    'tests/scripts/check-conformance-coverage.test.mjs',
    'tests/scripts/check-release-docs.test.mjs',
    'tests/adapter-conformance/README.md',
    'src/adapter-conformance/index.ts',
    'src/adapters/http/index.ts',
    'src/adapters/identity/index.ts',
    'src/composition/index.ts',
    'src/config/index.ts',
    'src/index.ts',
    'src/ports/index.ts',
    'src/profiles/index.ts',
    'src/shared/index.ts',
    'docs/adapters/draft-store.md',
    'docs/identity/integration.md',
    'docs/ux/accessibility.md',
    'docs/ux/i18n.md',
    'docs/ux/responsive.md',
    'scripts/check-conformance-coverage.mjs',
    'scripts/check-deployment-headers.mjs',
    'scripts/check-release-docs.mjs',
    'scripts/check-compose-quickstart.mjs',
    'scripts/check-multi-deployment.mjs',
    'README.md',
  ]) {
    if (path !== options.omitPath) {
      write(root, path, '');
    }
  }

  return root;
}

function workflow(commands, commentOnlyCommand) {
  return [
    'name: ci',
    'jobs:',
    '  web:',
    '    steps:',
    ...commands.map((command) =>
      command === commentOnlyCommand ? `      # - run: ${command}` : `      - run: ${command}`,
    ),
  ].join('\n');
}

function testingPlan(options = {}) {
  const rows = [
    ['Type contract', 'npm run typecheck'],
    ['Layering and imports', 'npm run lint'],
    ['Testing-plan integrity', 'npm run check:testing-plan'],
    ['Release docs', 'npm run check:release-docs'],
    ['Conformance coverage', 'npm run check:conformance-coverage'],
    ['Port conformance', 'npm run test:conformance'],
    ['Unit and smoke tests', 'npm run test:unit'],
    ['Vendor firewall', 'npm run check:vendor-leaks'],
    ['Upstream theme sync', 'npm run check:upstream-theme'],
    ['Browser accessibility', 'npm run test:e2e'],
    ['Production build', 'npm run build'],
    ['Bundle budget', 'npm run check:bundle-budget'],
    ['Compose config', 'npm run check:compose-config'],
    ['Compose quickstart', 'npm run test:compose-quickstart'],
    ['Deployment headers', 'npm run test:deployment'],
    ['Multi-deployment smoke', 'npm run test:multi-deployment'],
    ['Full local gate', 'npm run ci'],
  ].filter(([, command]) => command !== options.omitCommand);

  return [
    '# Testing Plan',
    '',
    '## Command Gates',
    '',
    '| Gate | Command | Runs in CI | Covers |',
    '| --- | --- | --- | --- |',
    ...rows.map(([gate, command]) => `| ${gate} | \`${command}\` | Yes | Fixture coverage. |`),
    '',
    '## Coverage Matrix',
    '',
    '| Surface | Required evidence | Current implementation |',
    '| --- | --- | --- |',
    '| Fixture | Test evidence. | `src/profiles/profiles.test.ts`; `tests/app/respondent-flow.test.ts`; `tests/e2e/placeholder-a11y.spec.ts`; `tests/scripts/check-testing-plan.test.mjs`; `tests/scripts/check-conformance-coverage.test.mjs`; `tests/scripts/check-release-docs.test.mjs`; `docs/testing-plan.md`; `tests/adapter-conformance/README.md`; `src/adapter-conformance/index.ts`; `scripts/check-testing-plan.mjs`; `scripts/check-conformance-coverage.mjs`; `scripts/check-release-docs.mjs`; `scripts/check-deployment-headers.mjs`; `scripts/check-compose-quickstart.mjs`; `scripts/check-multi-deployment.mjs`; `README.md`; `package.json`. |',
    '',
    '## Adapter Rules',
    '',
    '## Manual Release Gates',
    '',
    '| Gate | Evidence location | Status |',
    '| --- | --- | --- |',
    ...manualReleaseRows(options),
  ].join('\n');
}

function manualReleaseRows(options = {}) {
  return [
    ['VoiceOver sweep', 'docs/ux/accessibility.md', 'Pending manual run.'],
    ['NVDA sweep', 'docs/ux/accessibility.md', 'Pending manual run.'],
    [
      'Lighthouse mobile >= 90 and FCP < 1.5 s',
      'docs/ux/responsive.md',
      'Passes on local Docker/nginx evidence; refresh before release tag.',
    ],
    [
      'Production Locale Documents from server',
      'docs/ux/i18n.md',
      'Demo-proven only until server emits concrete Locale Documents.',
    ],
    ['Full OIDC server validation', 'docs/identity/integration.md', 'Blocked by EXT-23.'],
    [
      'Cross-reload or cross-device draft resume',
      'docs/adapters/draft-store.md',
      'Blocked by EXT-26.',
    ],
    [
      'Session-bound anonymous draft update',
      'docs/adapters/draft-store.md',
      'Blocked by EXT-27.',
    ],
  ]
    .filter(([gate]) => gate !== options.omitManualGate)
    .map(([gate, evidence, status]) => {
      const evidenceValue = options.manualEvidenceOverrides?.[gate] ?? evidence;
      const statusValue = options.manualStatusOverrides?.[gate] ?? status;
      return `| ${gate} | \`${evidenceValue}\` | ${statusValue} |`;
    });
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
