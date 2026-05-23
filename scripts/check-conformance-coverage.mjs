/* global console */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const portSuites = new Map([
  ['DefinitionSource', 'tests/adapter-conformance/definition-source/conformance.test.ts'],
  ['DraftStore', 'tests/adapter-conformance/draft-store/conformance.test.ts'],
  ['SubmitTransport', 'tests/adapter-conformance/submit-transport/conformance.test.ts'],
  ['IdentityProvider', 'tests/adapter-conformance/identity-provider/conformance.test.ts'],
  ['NotificationDelivery', 'tests/adapter-conformance/notification-delivery/conformance.test.ts'],
  ['RespondentPlaceSource', 'tests/adapter-conformance/respondent-place-source/conformance.test.ts'],
  ['StatusReader', 'tests/adapter-conformance/status-reader/conformance.test.ts'],
]);
const stubPortsByPath = new Map([
  ['src/adapters/stub/definition-source.ts', 'DefinitionSource'],
  ['src/adapters/stub/draft-store.ts', 'DraftStore'],
  ['src/adapters/stub/submit-transport.ts', 'SubmitTransport'],
  ['src/adapters/stub/identity-provider.ts', 'IdentityProvider'],
  ['src/adapters/stub/notification-delivery.ts', 'NotificationDelivery'],
  ['src/adapters/stub/respondent-place-source.ts', 'RespondentPlaceSource'],
  ['src/adapters/stub/status-reader.ts', 'StatusReader'],
]);
const requiredHarnessExports = [
  'defineDefinitionSourceConformance',
  'defineDraftStoreConformance',
  'defineSubmitTransportConformance',
  'defineIdentityProviderConformance',
  'defineNotificationDeliveryConformance',
  'defineRespondentPlaceSourceConformance',
  'defineStatusReaderConformance',
];
const requiredReadmePhrases = [
  'formspec-web/adapter-conformance',
  'src/adapter-conformance/fixtures.ts',
  'tests/adapter-conformance/_framework/conformance.ts',
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = rootDirFromArgs(process.argv.slice(2)) ?? defaultRootDir;
  const result = checkConformanceCoverage(rootDir);
  console.log(
    `conformance coverage check passed: ${result.portSuiteCount} port suite(s), ${result.registrationCount} adapter registration(s)`,
  );
}

export function checkConformanceCoverage(rootDir) {
  const framework = readFile(rootDir, 'tests/adapter-conformance/_framework/conformance.ts');
  const publicIndex = readFile(rootDir, 'src/adapter-conformance/index.ts');
  const readme = readFile(rootDir, 'tests/adapter-conformance/README.md');
  let registrationCount = 0;

  if (!hasPublicHarnessReExport(framework)) {
    fail(
      'conformance coverage check failed: test framework must re-export the public adapter-conformance surface',
    );
  }

  for (const exportName of requiredHarnessExports) {
    if (!publicIndex.includes(exportName)) {
      fail(
        `conformance coverage check failed: src/adapter-conformance/index.ts is missing "${exportName}"`,
      );
    }
  }

  for (const phrase of requiredReadmePhrases) {
    if (!readme.includes(phrase)) {
      fail(
        `conformance coverage check failed: tests/adapter-conformance/README.md is missing "${phrase}"`,
      );
    }
  }
  if (readme.includes('Fixtures live as JSON cases')) {
    fail(
      'conformance coverage check failed: tests/adapter-conformance/README.md still describes obsolete JSON-case fixtures',
    );
  }

  const adapters = discoverFirstPartyAdapters(rootDir);
  for (const adapter of adapters) {
    registrationCount += 1;
    const suitePath = portSuites.get(adapter.port);
    if (!suitePath) {
      fail(
        `conformance coverage check failed: no conformance suite configured for port "${adapter.port}"`,
      );
    }
    const text = readFile(rootDir, suitePath);
    const blocks = conformanceBlocks(text, adapter.port);
    if (!blocks.some((block) => adapterUsagePresent(block, adapter))) {
      fail(
        `conformance coverage check failed: first-party adapter "${adapter.symbol}" from "${adapter.path}" is not registered in ${suitePath}`,
      );
    }
  }

  return {
    portSuiteCount: portSuites.size,
    registrationCount,
  };
}

function discoverFirstPartyAdapters(rootDir) {
  const adapters = [];
  for (const path of tsFiles(rootDir, 'src/adapters')) {
    const text = stripComments(readFile(rootDir, path));
    for (const match of text.matchAll(/\b(?:(export)\s+(?:default\s+)?)?class\s+(\w+)\b([^{]*)\{/g)) {
      const [, inlineExport, symbol, classHeader] = match;
      const port = portImplementedBy(classHeader);
      if (port && (inlineExport || hasNamedExport(text, symbol))) {
        adapters.push({ kind: 'class', path, port, symbol });
      }
    }

    const stubPort = stubPortsByPath.get(path);
    if (stubPort) {
      for (const match of text.matchAll(/export\s+function\s+(stub\w+)\b/g)) {
        adapters.push({ kind: 'factory', path, port: stubPort, symbol: match[1] });
      }
    }
  }

  return adapters.sort((left, right) => `${left.port}:${left.symbol}`.localeCompare(`${right.port}:${right.symbol}`));
}

function tsFiles(rootDir, relativeDir) {
  const absoluteDir = join(rootDir, relativeDir);
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const childRelativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      return tsFiles(rootDir, childRelativePath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [childRelativePath] : [];
  });
}

function conformanceBlocks(text, port) {
  const token = `define${port}Conformance(`;
  const starts = [];
  let index = text.indexOf(token);
  while (index !== -1) {
    starts.push(index);
    index = text.indexOf(token, index + token.length);
  }
  return starts.map((start, position) => {
    const nextStart = starts[position + 1];
    return text.slice(start, nextStart ?? text.length);
  });
}

function adapterUsagePresent(block, adapter) {
  const code = stripStrings(stripComments(block));
  const symbol = escapeRegExp(adapter.symbol);
  const pattern =
    adapter.kind === 'class' ? new RegExp(`\\bnew\\s+${symbol}\\b`) : new RegExp(`\\b${symbol}\\s*\\(`);
  return pattern.test(code);
}

function hasPublicHarnessReExport(text) {
  const withoutComments = stripComments(text);
  return /export\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/adapter-conformance\/index\.ts['"]/.test(withoutComments);
}

function hasNamedExport(text, symbol) {
  const symbolPattern = escapeRegExp(symbol);
  return new RegExp(`export\\s*\\{[^}]*\\b${symbolPattern}\\b[^}]*\\}`).test(text);
}

function portImplementedBy(classHeader) {
  const implementsMatch = /\bimplements\s+([^{]+)/.exec(classHeader);
  if (!implementsMatch) {
    return null;
  }
  return (
    implementsMatch[1].match(
      /\b(DefinitionSource|DraftStore|SubmitTransport|IdentityProvider|NotificationDelivery|RespondentPlaceSource|StatusReader)\b/,
    )?.[1] ?? null
  );
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function stripStrings(text) {
  return text.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rootDirFromArgs(args) {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 2 && args[0] === '--root') {
    return args[1];
  }
  fail('usage: node scripts/check-conformance-coverage.mjs [--root <repo-root>]');
}

function readFile(rootDir, relativePath) {
  return readFileSync(join(rootDir, relativePath), 'utf8');
}

function fail(message) {
  throw new Error(message);
}
