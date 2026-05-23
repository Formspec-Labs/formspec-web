/* global console */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredCommands = [
  'npm run typecheck',
  'npm run lint',
  'npm run check:testing-plan',
  'npm run check:mvp-audit',
  'npm run check:upstream-blockers',
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
  'npm run ci',
];
const ciRunValues = new Set(['Yes', 'No', 'Local stack']);
const expectedScriptBodies = new Map([
  ['check:testing-plan', 'node scripts/check-testing-plan.mjs'],
  ['check:mvp-audit', 'node scripts/check-mvp-audit.mjs'],
  ['check:upstream-blockers', 'node scripts/check-upstream-blockers.mjs'],
  ['check:release-docs', 'node scripts/check-release-docs.mjs'],
  ['check:conformance-coverage', 'node scripts/check-conformance-coverage.mjs'],
  ['check:bundle-budget', 'node scripts/check-bundle-budget.mjs'],
  ['check:compose-config', 'docker compose config --quiet'],
  ['test:compose-quickstart', 'node scripts/check-compose-quickstart.mjs'],
  ['test:deployment', 'node scripts/check-deployment-headers.mjs'],
  ['test:multi-deployment', 'node scripts/check-multi-deployment.mjs'],
  ['check:vendor-leaks', 'scripts/check-vendor-leaks.sh'],
  ['check:upstream-theme', 'node scripts/check-upstream-theme-assets.mjs'],
]);
const expectedPackageExports = new Map([
  ['.', './src/index.ts'],
  ['./adapter-conformance', './src/adapter-conformance/index.ts'],
  ['./adapters/http', './src/adapters/http/index.ts'],
  ['./adapters/identity', './src/adapters/identity/index.ts'],
  ['./composition', './src/composition/index.ts'],
  ['./config', './src/config/index.ts'],
  ['./ports', './src/ports/index.ts'],
  ['./profiles', './src/profiles/index.ts'],
  ['./shared', './src/shared/index.ts'],
]);
const requiredManualGates = new Map([
  ['VoiceOver sweep', { evidence: 'docs/ux/accessibility.md', status: 'Pending manual run' }],
  ['NVDA sweep', { evidence: 'docs/ux/accessibility.md', status: 'Pending manual run' }],
  [
    'Lighthouse mobile >= 90 and FCP < 1.5 s',
    {
      evidence: 'docs/ux/responsive.md',
      status: 'Passes on local Docker/nginx evidence; refresh before release tag',
    },
  ],
  [
    'Production Locale Documents from server',
    {
      evidence: 'docs/ux/i18n.md',
      status: 'Demo-proven only until server emits concrete Locale Documents',
    },
  ],
  [
    'Full OIDC server validation',
    { evidence: 'docs/identity/integration.md', status: 'Blocked by EXT-23' },
  ],
  [
    'Cross-reload or cross-device draft resume',
    { evidence: 'docs/adapters/draft-store.md', status: 'Blocked by EXT-26' },
  ],
  [
    'Session-bound anonymous draft update',
    { evidence: 'docs/adapters/draft-store.md', status: 'Blocked by EXT-27' },
  ],
]);
const requiredCoverageRows = new Map([
  [
    'M0-M1 scaffold and build',
    [
      'npm run ci',
      '.github/workflows/ci.yml',
      'README.md',
      'CONTRIBUTING.md',
      'scripts/check-testing-plan.mjs',
      'tests/scripts/check-testing-plan.test.mjs',
      'scripts/check-mvp-audit.mjs',
      'tests/scripts/check-mvp-audit.test.mjs',
      'docs/mvp-audit.md',
      'scripts/check-upstream-blockers.mjs',
      'tests/scripts/check-upstream-blockers.test.mjs',
    ],
  ],
  [
    'M1 theme/token consumption',
    ['scripts/check-upstream-theme-assets.mjs', 'npm run check:upstream-theme'],
  ],
  [
    'M2 profile model',
    ['src/profiles/profiles.test.ts', 'docs/configuration.md', 'docs/profiles.md'],
  ],
  [
    'M3 port contracts',
    [
      'npm run check:conformance-coverage',
      'scripts/check-conformance-coverage.mjs',
      'tests/scripts/check-conformance-coverage.test.mjs',
      'tests/adapter-conformance/definition-source/conformance.test.ts',
      'tests/adapter-conformance/draft-store/conformance.test.ts',
      'tests/adapter-conformance/submit-transport/conformance.test.ts',
      'tests/adapter-conformance/identity-provider/conformance.test.ts',
      'tests/adapter-conformance/notification-delivery/conformance.test.ts',
      'src/adapter-conformance/index.ts',
      'package.json',
      'docs/architecture.md',
      'docs/ports/definition-source.md',
      'docs/ports/draft-store.md',
      'docs/ports/submit-transport.md',
      'docs/ports/identity-provider.md',
      'docs/ports/notification-delivery.md',
    ],
  ],
  [
    'M4 HTTP adapters',
    [
      'tests/adapters/http/definition-source.test.ts',
      'tests/adapters/http/draft-store.test.ts',
      'tests/adapters/http/submit-transport.test.ts',
      'tests/adapters/http/http-client.test.ts',
      'tests/adapters/http/anonymous-session.test.ts',
      'docs/adapters/definition-source.md',
      'docs/adapters/draft-store.md',
      'docs/adapters/submit-transport.md',
      'docs/adapters/identity-provider.md',
      'docs/adapters/notification-delivery.md',
    ],
  ],
  [
    'M5 demo composition',
    [
      'tests/demo/sample-form.test.ts',
      'tests/smoke/composition.test.ts',
      'tests/e2e/placeholder-a11y.spec.ts',
      'docs/getting-started.md',
      'npm run check:release-docs',
    ],
  ],
  [
    'M6 respondent runtime',
    [
      'tests/app/respondent-flow.test.ts',
      'tests/app/respondent-runtime.test.tsx',
      'tests/e2e/placeholder-a11y.spec.ts',
      'scripts/check-bundle-budget.mjs',
      'scripts/check-deployment-headers.mjs',
      'docs/ux/branding.md',
      'docs/ux/errors.md',
      'docs/ux/responsive.md',
      'docs/ux/accessibility.md',
      'docs/ux/i18n.md',
    ],
  ],
  [
    'M7 identity',
    [
      'tests/adapter-conformance/identity-provider/conformance.test.ts',
      'tests/adapters/http/anonymous-session.test.ts',
      'tests/adapters/identity/anonymous.test.ts',
      'tests/adapters/identity/oidc.test.ts',
      'tests/adapters/identity/magic-link.test.ts',
      'tests/app/respondent-flow.test.ts',
      'tests/app/respondent-runtime.test.tsx',
      'tests/smoke/composition.test.ts',
      'docs/identity/integration.md',
      'docs/identity/multi-flow.md',
      'npm run check:upstream-blockers',
      'scripts/check-upstream-blockers.mjs',
      'tests/scripts/check-upstream-blockers.test.mjs',
    ],
  ],
  [
    'M7a multi-instance demo',
    [
      'npm run test:compose-quickstart',
      'npm run test:multi-deployment',
      'scripts/check-compose-quickstart.mjs',
      'scripts/check-multi-deployment.mjs',
      'docker-compose.yml',
      'docs/multi-deployment.md',
    ],
  ],
  [
    'M8 deployment closeout',
    [
      'npm run build',
      'npm run check:mvp-audit',
      'npm run check:upstream-blockers',
      'npm run check:release-docs',
      'npm run check:compose-config',
      'npm run test:compose-quickstart',
      'npm run test:deployment',
      'npm run test:multi-deployment',
      'scripts/check-mvp-audit.mjs',
      'tests/scripts/check-mvp-audit.test.mjs',
      'docs/mvp-audit.md',
      'scripts/check-upstream-blockers.mjs',
      'tests/scripts/check-upstream-blockers.test.mjs',
      'scripts/check-release-docs.mjs',
      'tests/scripts/check-release-docs.test.mjs',
      'thoughts/specs/2026-05-22-upstream-extension-queue.md',
      'docker-compose.yml',
      'README.md',
      'docs/deployment.md',
      'docs/operations.md',
      'docs/multi-deployment.md',
    ],
  ],
]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = rootDirFromArgs(process.argv.slice(2)) ?? defaultRootDir;
  const result = checkTestingPlan(rootDir);
  console.log(
    `testing plan check passed: ${result.commandGateCount} command gate(s), ${result.implementationPathCount} implementation path(s)`,
  );
}

export function checkTestingPlan(rootDir) {
  const testingPlan = readFile(rootDir, 'docs/testing-plan.md');
  const packageJson = JSON.parse(readFile(rootDir, 'package.json'));
  const ciWorkflow = readFile(rootDir, '.github/workflows/ci.yml');

  const commandGateRows = markdownRowsBetween(testingPlan, '## Command Gates', '## Coverage Matrix');
  const commandGates = commandGateRows.map((row) => {
    const [gate, command, runsInCi, covers] = row;
    return {
      gate,
      command: unwrapCode(command),
      runsInCi,
      covers,
    };
  });
  const documentedCommands = commandGates.map(({ command }) => command);

  if (commandGates.length === 0) {
    fail('testing plan check failed: no command gates found in docs/testing-plan.md');
  }

  for (const command of requiredCommands) {
    if (!documentedCommands.includes(command)) {
      fail(`testing plan check failed: command gate is missing required command "${command}"`);
    }
  }

  const ciScript = packageJson.scripts?.ci;
  if (typeof ciScript !== 'string') {
    fail('testing plan check failed: package.json is missing scripts.ci');
  }

  const ciCommands = parseCiScriptCommands(ciScript);
  const workflowRunCommands = parseWorkflowRunCommands(ciWorkflow);
  assertPackageExports(packageJson.exports, rootDir);
  assertManualReleaseGates(testingPlan, rootDir);

  for (const { gate, command, runsInCi } of commandGates) {
    const script = npmRunScript(command);
    if (!script) {
      fail(`testing plan check failed: "${gate}" command is not an npm run command: ${command}`);
    }
    if (!ciRunValues.has(runsInCi)) {
      fail(`testing plan check failed: "${gate}" has unsupported Runs in CI value "${runsInCi}"`);
    }

    if (!packageJson.scripts?.[script]) {
      fail(`testing plan check failed: package.json is missing script "${script}" for "${gate}"`);
    }

    const expectedScriptBody = expectedScriptBodies.get(script);
    if (expectedScriptBody && packageJson.scripts[script] !== expectedScriptBody) {
      fail(
        `testing plan check failed: package.json script "${script}" must be "${expectedScriptBody}" for "${gate}"`,
      );
    }

    if ((runsInCi === 'Yes' || runsInCi === 'Local stack') && script !== 'ci') {
      assertCommandPresent(ciCommands, command, `package scripts.ci does not run "${command}" for "${gate}"`);
    }
    if (runsInCi === 'Yes' && script !== 'ci') {
      assertCommandPresent(
        workflowRunCommands,
        command,
        `.github/workflows/ci.yml does not run "${command}" for "${gate}"`,
      );
    }
  }

  const documentedPackageCiCommands = commandGates
    .filter(
      ({ command, runsInCi }) =>
        command !== 'npm run ci' && (runsInCi === 'Yes' || runsInCi === 'Local stack'),
    )
    .map(({ command }) => command);
  const documentedWorkflowCommands = commandGates
    .filter(({ command, runsInCi }) => command !== 'npm run ci' && runsInCi === 'Yes')
    .map(({ command }) => command);
  assertCommandOrder(documentedPackageCiCommands, ciCommands, 'package scripts.ci');
  assertCommandOrder(documentedWorkflowCommands, workflowRunCommands, '.github/workflows/ci.yml');

  const coverageRows = markdownRowsBetween(testingPlan, '## Coverage Matrix', '## Adapter Rules');
  const coverageRowsBySurface = new Map();
  const referencedPaths = new Set();

  for (const row of coverageRows) {
    const [surface, , implementationCell = ''] = row;
    if (coverageRowsBySurface.has(surface)) {
      fail(`testing plan check failed: duplicate coverage matrix row "${surface}"`);
    }
    const implementationSpans = new Set(codeSpans(implementationCell));
    coverageRowsBySurface.set(surface, implementationSpans);
    for (const reference of codeSpans(implementationCell)) {
      if (looksLikePath(reference)) {
        referencedPaths.add(reference);
      }
    }
  }

  for (const [surface, requiredEvidence] of requiredCoverageRows) {
    const evidenceSpans = coverageRowsBySurface.get(surface);
    if (!evidenceSpans) {
      fail(`testing plan check failed: coverage matrix is missing row "${surface}"`);
    }

    for (const evidence of requiredEvidence) {
      if (!evidenceSpans.has(evidence)) {
        fail(
          `testing plan check failed: coverage matrix row "${surface}" is missing required evidence "${evidence}"`,
        );
      }
      if (looksLikePath(evidence)) {
        referencedPaths.add(evidence);
      }
    }
  }

  if (referencedPaths.size === 0) {
    fail('testing plan check failed: no implementation paths found in coverage matrix');
  }

  const ciTestRoots = testRootsFromCiCommands(ciCommands, packageJson.scripts);

  for (const path of referencedPaths) {
    if (!existsSync(join(rootDir, path))) {
      fail(`testing plan check failed: coverage matrix references missing path "${path}"`);
    }

    if (isTestEvidencePath(path) && !isCoveredByRoot(path, ciTestRoots)) {
      fail(`testing plan check failed: test evidence path "${path}" is not covered by a CI test command`);
    }
  }

  return {
    commandGateCount: commandGates.length,
    implementationPathCount: referencedPaths.size,
  };
}

function rootDirFromArgs(args) {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 2 && args[0] === '--root') {
    return args[1];
  }
  fail('usage: node scripts/check-testing-plan.mjs [--root <repo-root>]');
}

function readFile(rootDir, relativePath) {
  return readFileSync(join(rootDir, relativePath), 'utf8');
}

function markdownRowsBetween(text, startHeading, endHeading) {
  const section = between(text, startHeading, endHeading);
  return markdownRows(section);
}

function markdownRowsInSection(text, startHeading) {
  return markdownRows(sectionAfterHeading(text, startHeading));
}

function markdownRows(section) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .filter((line) => !line.includes('---'))
    .filter((line) => !line.startsWith('| Gate |') && !line.startsWith('| Surface |'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    fail(`testing plan check failed: missing section "${startMarker}"`);
  }

  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    fail(`testing plan check failed: missing section "${endMarker}" after "${startMarker}"`);
  }

  return text.slice(start + startMarker.length, end);
}

function sectionAfterHeading(text, heading) {
  const marker = `${heading}\n`;
  const start = text.startsWith(marker) ? 0 : text.indexOf(`\n${marker}`);
  if (start === -1) {
    fail(`testing plan check failed: missing section "${heading}"`);
  }

  const headingLevel = heading.match(/^#+/)?.[0].length;
  if (!headingLevel) {
    fail(`testing plan check failed: invalid heading "${heading}"`);
  }

  const contentStart = start + (start === 0 ? marker.length : marker.length + 1);
  const rest = text.slice(contentStart);
  const nextHeading = new RegExp(`\\n#{1,${headingLevel}}\\s`).exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function unwrapCode(cell) {
  const match = /^`([^`]+)`$/.exec(cell);
  if (!match) {
    fail(`testing plan check failed: expected markdown code span, got "${cell}"`);
  }
  return match[1];
}

function npmRunScript(command) {
  return /^npm run ([\w:-]+)$/.exec(command)?.[1] ?? null;
}

function parseCiScriptCommands(script) {
  return script.split('&&').map((command) => command.trim()).filter(Boolean);
}

function parseWorkflowRunCommands(workflow) {
  return workflow
    .split('\n')
    .map((line) => line.match(/^\s*(?:-\s*)?run:\s*(.+?)\s*$/)?.[1] ?? null)
    .filter((command) => command !== null)
    .map((command) => unquoteYamlScalar(command));
}

function unquoteYamlScalar(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function assertCommandPresent(commands, needle, message) {
  if (!commands.includes(needle)) {
    fail(`testing plan check failed: ${message}`);
  }
}

function assertCommandOrder(commands, actualCommands, label) {
  let lastIndex = -1;
  for (const command of commands) {
    const index = actualCommands.indexOf(command);
    if (index === -1) {
      fail(`testing plan check failed: ${label} is missing "${command}"`);
    }
    if (index < lastIndex) {
      fail(`testing plan check failed: ${label} runs "${command}" out of documented order`);
    }
    lastIndex = index;
  }
}

function assertPackageExports(exportsMap, rootDir) {
  if (!isRecord(exportsMap)) {
    fail('testing plan check failed: package.json is missing exports map');
  }

  for (const [exportName, expectedPath] of expectedPackageExports) {
    const actualPath = exportsMap[exportName];
    if (actualPath !== expectedPath) {
      fail(
        `testing plan check failed: package.json export "${exportName}" must be "${expectedPath}"`,
      );
    }

    if (!existsSync(join(rootDir, normalizePath(expectedPath)))) {
      fail(
        `testing plan check failed: package.json export "${exportName}" points to missing path "${expectedPath}"`,
      );
    }
  }
}

function assertManualReleaseGates(testingPlan, rootDir) {
  const manualGateRows = markdownRowsInSection(testingPlan, '## Manual Release Gates');
  const manualGates = new Map(
    manualGateRows.map(([gate, evidence, status]) => [
      gate,
      { evidence: unwrapCode(evidence), status: status ?? '' },
    ]),
  );

  if (manualGates.size === 0) {
    fail('testing plan check failed: no manual release gates found in docs/testing-plan.md');
  }

  for (const [gate, expected] of requiredManualGates) {
    const actual = manualGates.get(gate);
    if (!actual) {
      fail(`testing plan check failed: manual release gate is missing "${gate}"`);
    }

    if (actual.evidence !== expected.evidence) {
      fail(
        `testing plan check failed: manual release gate "${gate}" evidence must be "${expected.evidence}"`,
      );
    }

    if (!existsSync(join(rootDir, actual.evidence))) {
      fail(
        `testing plan check failed: manual release gate "${gate}" references missing evidence path "${actual.evidence}"`,
      );
    }

    if (normalizeStatus(actual.status) !== expected.status) {
      fail(
        `testing plan check failed: manual release gate "${gate}" status must be "${expected.status}"`,
      );
    }
  }
}

function testRootsFromCiCommands(commands, scripts) {
  const roots = new Set();
  for (const command of commands) {
    const script = npmRunScript(command);
    if (!script) {
      continue;
    }
    const scriptBody = scripts?.[script];
    if (typeof scriptBody !== 'string') {
      continue;
    }
    for (const root of testRootsForScript(scriptBody)) {
      roots.add(normalizePath(root));
    }
  }
  return Array.from(roots);
}

function testRootsForScript(script) {
  const command = script.trim();
  if (command.startsWith('vitest run')) {
    const roots = command
      .split(/\s+/)
      .slice(2)
      .filter((part) => !part.startsWith('-'));
    return roots.length > 0 ? roots : ['src', 'tests'];
  }

  if (command.startsWith('playwright test')) {
    const roots = command
      .split(/\s+/)
      .slice(2)
      .filter((part) => !part.startsWith('-'));
    return roots.length > 0 ? roots : ['tests/e2e'];
  }

  return [];
}

function isTestEvidencePath(path) {
  return path.startsWith('tests/') || /\.test\.[\w]+$/.test(path) || /\.spec\.[\w]+$/.test(path);
}

function isCoveredByRoot(path, roots) {
  const normalizedPath = normalizePath(path);
  return roots.some((root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`));
}

function normalizePath(path) {
  return path.replace(/^\.\//, '').replace(/\/+$/, '');
}

function normalizeStatus(status) {
  return status.trim().replace(/\.$/, '');
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
    /^[A-Za-z0-9_.-]+\.(?:json|md|toml|ya?ml)$/.test(reference)
  );
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message) {
  throw new Error(message);
}
