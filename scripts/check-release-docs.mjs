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

  return {
    sectionCount: requiredSections.length,
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

function fail(message) {
  throw new Error(message);
}
