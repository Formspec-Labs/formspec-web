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
  'npm run test:conformance',
  'npm run test:unit',
  'npm run check:vendor-leaks',
  'npm run check:upstream-theme',
  'npm run test:e2e',
  'npm run build',
  'npm run check:bundle-budget',
  'npm run test:deployment',
  'npm run ci',
];

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

  for (const { gate, command, runsInCi } of commandGates) {
    const script = npmRunScript(command);
    if (!script) {
      fail(`testing plan check failed: "${gate}" command is not an npm run command: ${command}`);
    }

    if (!packageJson.scripts?.[script]) {
      fail(`testing plan check failed: package.json is missing script "${script}" for "${gate}"`);
    }

    if (runsInCi === 'Yes' && script !== 'ci') {
      assertCommandPresent(ciCommands, command, `package scripts.ci does not run "${command}" for "${gate}"`);
      assertCommandPresent(
        workflowRunCommands,
        command,
        `.github/workflows/ci.yml does not run "${command}" for "${gate}"`,
      );
    }
  }

  const documentedCiCommands = commandGates
    .filter(({ command }) => command !== 'npm run ci')
    .map(({ command }) => command);
  assertCommandOrder(documentedCiCommands, ciCommands, 'package scripts.ci');
  assertCommandOrder(documentedCiCommands, workflowRunCommands, '.github/workflows/ci.yml');

  const coverageRows = markdownRowsBetween(testingPlan, '## Coverage Matrix', '## Adapter Rules');
  const referencedPaths = new Set();

  for (const row of coverageRows) {
    const implementationCell = row[2] ?? '';
    for (const reference of codeSpans(implementationCell)) {
      if (looksLikePath(reference)) {
        referencedPaths.add(reference);
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

function codeSpans(text) {
  return Array.from(text.matchAll(/`([^`]+)`/g), (match) => match[1]);
}

function looksLikePath(reference) {
  return (
    reference.startsWith('.') ||
    reference.startsWith('docs/') ||
    reference.startsWith('scripts/') ||
    reference.startsWith('src/') ||
    reference.startsWith('tests/')
  );
}

function fail(message) {
  throw new Error(message);
}
