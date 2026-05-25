/* global console */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  ['AttachmentStore', 'tests/adapter-conformance/attachment-store/conformance.test.ts'],
  ['FormRuntimePolicyExtractor', 'tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts'],
  ['RespondentHistorySource', 'tests/adapter-conformance/respondent-history-source/conformance.test.ts'],
  ['OfflineSubmitQueue', 'tests/adapter-conformance/offline-submit-queue/conformance.test.ts'],
  ['PaymentRailAdapter', 'tests/adapter-conformance/payment-rail-adapter/conformance.test.ts'],
  ['EmbedTransport', 'tests/adapter-conformance/embed-transport/conformance.test.ts'],
  ['ScreenerDocumentSource', 'tests/adapter-conformance/screener-document-source/conformance.test.ts'],
  ['ReviewerSession', 'tests/adapter-conformance/reviewer-session/conformance.test.ts'],
  ['ReviewThreadStore', 'tests/adapter-conformance/review-thread-store/conformance.test.ts'],
  ['LifecycleActionClient', 'tests/adapter-conformance/lifecycle-action-client/conformance.test.ts'],
]);
const stubPortsByPath = new Map([
  ['src/adapters/stub/definition-source.ts', 'DefinitionSource'],
  ['src/adapters/stub/draft-store.ts', 'DraftStore'],
  ['src/adapters/stub/submit-transport.ts', 'SubmitTransport'],
  ['src/adapters/stub/identity-provider.ts', 'IdentityProvider'],
  ['src/adapters/stub/notification-delivery.ts', 'NotificationDelivery'],
  ['src/adapters/stub/respondent-place-source.ts', 'RespondentPlaceSource'],
  ['src/adapters/stub/status-reader.ts', 'StatusReader'],
  ['src/adapters/stub/attachment-store.ts', 'AttachmentStore'],
  ['src/adapters/stub/form-runtime-policy-extractor.ts', 'FormRuntimePolicyExtractor'],
  ['src/adapters/stub/respondent-history-source.ts', 'RespondentHistorySource'],
  ['src/adapters/stub/offline-submit-queue.ts', 'OfflineSubmitQueue'],
  ['src/adapters/stub/payment-rail-adapter.ts', 'PaymentRailAdapter'],
  ['src/adapters/stub/embed-transport.ts', 'EmbedTransport'],
  ['src/adapters/stub/screener-document-source.ts', 'ScreenerDocumentSource'],
  ['src/adapters/stub/reviewer-session.ts', 'ReviewerSession'],
  ['src/adapters/stub/review-thread-store.ts', 'ReviewThreadStore'],
  ['src/adapters/stub/lifecycle-action-client.ts', 'LifecycleActionClient'],
]);
const unavailableSentinelFactoriesByPath = new Map([
  ['src/adapters/unavailable/respondent-place-source.ts', 'unavailableRespondentPlaceSource'],
  ['src/adapters/unavailable/status-reader.ts', 'unavailableStatusReader'],
  ['src/adapters/unavailable/attachment-store.ts', 'unavailableAttachmentStore'],
  ['src/adapters/unavailable/respondent-history-source.ts', 'unavailableRespondentHistorySource'],
  ['src/adapters/unavailable/offline-submit-queue.ts', 'unavailableOfflineSubmitQueue'],
  ['src/adapters/unavailable/payment-rail-adapter.ts', 'unavailablePaymentRailAdapter'],
  ['src/adapters/unavailable/embed-transport.ts', 'unavailableEmbedTransport'],
  ['src/adapters/unavailable/screener-document-source.ts', 'unavailableScreenerDocumentSource'],
  ['src/adapters/unavailable/reviewer-session.ts', 'unavailableReviewerSession'],
  ['src/adapters/unavailable/review-thread-store.ts', 'unavailableReviewThreadStore'],
  ['src/adapters/unavailable/lifecycle-action-client.ts', 'unavailableLifecycleActionClient'],
]);
const requiredHarnessExports = [
  'defineDefinitionSourceConformance',
  'defineDraftStoreConformance',
  'defineSubmitTransportConformance',
  'defineIdentityProviderConformance',
  'defineNotificationDeliveryConformance',
  'defineRespondentPlaceSourceConformance',
  'defineStatusReaderConformance',
  'defineAttachmentStoreConformance',
  'defineFormRuntimePolicyExtractorConformance',
  'defineRespondentHistorySourceConformance',
  'defineOfflineSubmitQueueConformance',
  'definePaymentRailAdapterConformance',
  'defineEmbedTransportConformance',
  'defineScreenerDocumentSourceConformance',
  'defineReviewerSessionConformance',
  'defineReviewThreadStoreConformance',
  'defineLifecycleActionClientConformance',
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
    `conformance coverage check passed: ${result.portSuiteCount} port suite(s), ${result.registrationCount} adapter registration(s), ${result.sentinelCount} unavailable sentinel(s)`,
  );
}

export function checkConformanceCoverage(rootDir) {
  const framework = readFile(rootDir, 'tests/adapter-conformance/_framework/conformance.ts');
  const publicIndex = readFile(rootDir, 'src/adapter-conformance/index.ts');
  const readme = readFile(rootDir, 'tests/adapter-conformance/README.md');
  const defaultComposition = readFile(rootDir, 'src/composition/default.ts');
  let registrationCount = 0;
  let sentinelCount = 0;

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

  for (const [path, factoryName] of unavailableSentinelFactoriesByPath) {
    if (!existsSync(join(rootDir, path))) {
      fail(
        `conformance coverage check failed: unavailable sentinel "${factoryName}" is missing from "${path}"`,
      );
    }
    const text = stripComments(readFile(rootDir, path));
    if (!new RegExp(`export\\s+function\\s+${factoryName}\\b`).test(text)) {
      fail(
        `conformance coverage check failed: unavailable sentinel "${factoryName}" is missing from "${path}"`,
      );
    }
    if (/\bimplements\s+(RespondentPlaceSource|StatusReader)\b/.test(text)) {
      fail(
        `conformance coverage check failed: unavailable sentinel "${factoryName}" must not masquerade as a conforming adapter class`,
      );
    }
    if (!new RegExp(`\\b${factoryName}\\s*\\(`).test(stripComments(defaultComposition))) {
      fail(
        `conformance coverage check failed: production composition does not use unavailable sentinel "${factoryName}"`,
      );
    }
    sentinelCount += 1;
  }

  return {
    portSuiteCount: portSuites.size,
    registrationCount,
    sentinelCount,
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
      /\b(DefinitionSource|DraftStore|SubmitTransport|IdentityProvider|NotificationDelivery|RespondentPlaceSource|StatusReader|FormRuntimePolicyExtractor)\b/,
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
