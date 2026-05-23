/* global console */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredSections = [
  {
    path: 'docs/deployment.md',
    heading: '## Hosted Demo Decision',
    phrases: ['deferred to user action', 'Local Docker compose'],
  },
  {
    path: 'docs/deployment.md',
    heading: '## Vercel Static Export',
    phrases: ['npm run build', 'dist', 'VITE_FORMSPEC_WEB_SERVER_URL'],
  },
  {
    path: 'docs/deployment.md',
    heading: '## Cloudflare Pages Static Export',
    phrases: ['npm run build', 'dist', 'VITE_FORMSPEC_WEB_SERVER_URL'],
  },
  {
    path: 'docs/deployment.md',
    heading: '## Docker Behind Reverse Proxy',
    phrases: ['FORMSPEC_WEB_SERVER_URL', '/formspec-runtime-config.js', 'no-store'],
  },
  {
    path: 'docs/deployment.md',
    heading: '## Deferred Server Stack',
    phrases: ['EXT-23', 'EXT-25'],
  },
  {
    path: 'docs/operations.md',
    heading: '## Current Operational Gaps',
    phrases: ['No hosted demo URL is selected', 'EXT-23'],
  },
];
const requiredExtensionQueueEntries = [
  {
    id: 'EXT-19',
    owner: 'formspec-server',
    statusPrefix: 'not yet filed',
  },
  {
    id: 'EXT-20',
    owner: 'formspec-server',
    statusPrefix: 'not yet filed',
  },
  {
    id: 'EXT-21',
    owner: 'formspec-server',
    statusPrefix: 'not yet filed',
  },
  {
    id: 'EXT-22',
    owner: 'formspec',
    statusPrefix: 'not yet filed',
  },
  {
    id: 'EXT-23',
    owner: 'formspec-server',
    statusPrefix: 'filed; gates M7',
  },
  {
    id: 'EXT-24',
    owner: 'formspec-server',
    statusPrefix: 'not yet filed',
  },
  {
    id: 'EXT-25',
    owner: 'formspec-server',
    statusPrefix: 'not yet filed',
  },
  {
    id: 'EXT-26',
    owner: 'formspec-server',
    statusPrefix: 'not yet filed',
  },
  {
    id: 'EXT-27',
    owner: 'formspec-server',
    statusPrefix: 'not yet filed',
  },
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = rootDirFromArgs(process.argv.slice(2)) ?? defaultRootDir;
  const result = checkReleaseDocs(rootDir);
  console.log(
    `release docs check passed: ${result.sectionCount} section(s), ${result.requirementCount} requirement(s)`,
  );
}

export function checkReleaseDocs(rootDir) {
  const fileCache = new Map();
  let requirementCount = 0;

  for (const requirement of requiredSections) {
    const fileText = readCached(fileCache, rootDir, requirement.path);
    const section = markdownSection(fileText, requirement.heading, requirement.path);
    for (const phrase of requirement.phrases) {
      requirementCount += 1;
      if (!section.includes(phrase)) {
        fail(
          `release docs check failed: ${requirement.path} ${requirement.heading} is missing "${phrase}"`,
        );
      }
    }
  }

  const extensionQueuePath = 'thoughts/specs/2026-05-22-upstream-extension-queue.md';
  const extensionQueue = readCached(fileCache, rootDir, extensionQueuePath);
  for (const requirement of requiredExtensionQueueEntries) {
    const section = extensionSection(extensionQueue, requirement.id, extensionQueuePath);
    requirementCount += 4;
    assertFieldEquals(
      section,
      'Owning repo',
      requirement.owner,
      `${extensionQueuePath} ${requirement.id}`,
    );
    assertFieldPresent(section, 'FW rows blocked', `${extensionQueuePath} ${requirement.id}`);
    assertFieldPresent(section, 'Fixture status', `${extensionQueuePath} ${requirement.id}`);
    assertFieldStartsWith(
      section,
      'Status',
      requirement.statusPrefix,
      `${extensionQueuePath} ${requirement.id}`,
    );
  }

  return {
    sectionCount: requiredSections.length + requiredExtensionQueueEntries.length,
    requirementCount,
  };
}

function rootDirFromArgs(args) {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 2 && args[0] === '--root') {
    return args[1];
  }
  fail('usage: node scripts/check-release-docs.mjs [--root <repo-root>]');
}

function readCached(fileCache, rootDir, relativePath) {
  const cached = fileCache.get(relativePath);
  if (cached) {
    return cached;
  }
  const text = readFileSync(join(rootDir, relativePath), 'utf8');
  fileCache.set(relativePath, text);
  return text;
}

function markdownSection(text, heading, path) {
  const marker = `${heading}\n`;
  const start = text.startsWith(marker) ? 0 : text.indexOf(`\n${marker}`);
  if (start === -1) {
    fail(`release docs check failed: ${path} is missing section "${heading}"`);
  }

  const contentStart = start + (start === 0 ? marker.length : marker.length + 1);
  const nextHeading = text.indexOf('\n## ', contentStart);
  return nextHeading === -1 ? text.slice(contentStart) : text.slice(contentStart, nextHeading);
}

function extensionSection(text, id, path) {
  const startPattern = new RegExp(`^### ${id}:`, 'm');
  const startMatch = startPattern.exec(text);
  if (!startMatch) {
    fail(`release docs check failed: ${path} is missing entry "${id}"`);
  }

  const start = startMatch.index;
  const nextHeading = text.indexOf('\n### ', start + 1);
  return nextHeading === -1 ? text.slice(start) : text.slice(start, nextHeading);
}

function assertFieldEquals(section, field, expected, label) {
  const actual = markdownField(section, field, label);
  if (actual !== expected) {
    fail(`release docs check failed: ${label} ${field} is "${actual}", expected "${expected}"`);
  }
}

function assertFieldStartsWith(section, field, expectedPrefix, label) {
  const actual = markdownField(section, field, label);
  if (!actual.startsWith(expectedPrefix)) {
    fail(
      `release docs check failed: ${label} ${field} is "${actual}", expected prefix "${expectedPrefix}"`,
    );
  }
}

function assertFieldPresent(section, field, label) {
  markdownField(section, field, label);
}

function markdownField(section, field, label) {
  const match = new RegExp(`^\\*\\*${escapeRegExp(field)}:\\*\\*\\s*(.+)$`, 'm').exec(section);
  if (!match || match[1].trim().length === 0) {
    fail(`release docs check failed: ${label} is missing non-empty field "${field}"`);
  }
  return match[1].trim().replace(/\.$/, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  throw new Error(message);
}
