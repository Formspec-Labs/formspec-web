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
    'npm run test:conformance',
    'npm run test:unit',
    'npm run check:vendor-leaks',
    'npm run check:upstream-theme',
    'npm run test:e2e',
    'npm run build',
    'npm run check:bundle-budget',
    'npm run test:deployment',
  ];

  write(root, 'package.json', JSON.stringify({
    scripts: {
      typecheck: 'tsc --noEmit',
      lint: 'eslint .',
      'check:testing-plan': 'node scripts/check-testing-plan.mjs',
      'test:conformance': 'vitest run tests/adapter-conformance',
      'test:unit': unitScript,
      'check:vendor-leaks': 'scripts/check-vendor-leaks.sh',
      'check:upstream-theme': 'node scripts/check-upstream-theme-assets.mjs',
      'test:e2e': 'playwright test',
      build: 'tsc --noEmit && vite build',
      'check:bundle-budget': 'node scripts/check-bundle-budget.mjs',
      'test:deployment': 'node scripts/check-deployment-headers.mjs',
      ci: ciCommands.join(' && '),
    },
  }));
  write(root, '.github/workflows/ci.yml', workflow(ciCommands, options.commentOnlyWorkflowCommand));
  write(root, 'docs/testing-plan.md', testingPlan(options.omitCommand));

  for (const path of [
    'scripts/check-testing-plan.mjs',
    'src/profiles/profiles.test.ts',
    'tests/app/respondent-flow.test.ts',
    'tests/e2e/placeholder-a11y.spec.ts',
    'tests/scripts/check-testing-plan.test.mjs',
    'scripts/check-deployment-headers.mjs',
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

function testingPlan(omitCommand) {
  const rows = [
    ['Type contract', 'npm run typecheck'],
    ['Layering and imports', 'npm run lint'],
    ['Testing-plan integrity', 'npm run check:testing-plan'],
    ['Port conformance', 'npm run test:conformance'],
    ['Unit and smoke tests', 'npm run test:unit'],
    ['Vendor firewall', 'npm run check:vendor-leaks'],
    ['Upstream theme sync', 'npm run check:upstream-theme'],
    ['Browser accessibility', 'npm run test:e2e'],
    ['Production build', 'npm run build'],
    ['Bundle budget', 'npm run check:bundle-budget'],
    ['Deployment headers', 'npm run test:deployment'],
    ['Full local gate', 'npm run ci'],
  ].filter(([, command]) => command !== omitCommand);

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
    '| Fixture | Test evidence. | `src/profiles/profiles.test.ts`; `tests/app/respondent-flow.test.ts`; `tests/e2e/placeholder-a11y.spec.ts`; `tests/scripts/check-testing-plan.test.mjs`; `docs/testing-plan.md`; `scripts/check-testing-plan.mjs`; `scripts/check-deployment-headers.mjs`. |',
    '',
    '## Adapter Rules',
  ].join('\n');
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
