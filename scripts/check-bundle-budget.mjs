/* global console */

/**
 * Bundle budget gate.
 *
 * Two budgets, both in gzipped bytes, both deliberately fixed: everything the
 * browser must parse before the first paint, and every code-split chunk taken
 * one at a time. The per-chunk budget is what keeps a vendored-package refresh
 * from quietly folding a few hundred KiB of schemas or graph code into the
 * chunk a respondent waits on. Split the work or defer it — do not raise these
 * numbers.
 *
 * Every chunk is reported with its headroom, so a refresh that is merely close
 * to the wall is visible in CI before the run that trips it.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const maxInitialJsGzipBytes = 200 * 1024;
const maxLazyJsGzipBytes = 200 * 1024;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = rootDirFromArgs(process.argv.slice(2)) ?? defaultRootDir;
  const result = checkBundleBudget(rootDir);
  console.log(
    `bundle budget check passed: initial JS ${formatBytes(result.initialJsGzipBytes)} gzip`
    + ` across ${result.initialAssets.length} asset(s), limit ${formatBytes(maxInitialJsGzipBytes)}`,
  );
  for (const asset of result.assets) {
    console.log(
      `  ${asset.loading.padEnd(7)} ${formatBytes(asset.gzipBytes).padStart(10)} gzip`
      + ` (${formatBytes(asset.headroomBytes)} headroom)  ${asset.name}`,
    );
  }
}

export function checkBundleBudget(rootDir) {
  const assetsDir = join(rootDir, 'dist/assets');
  const indexHtml = readFileSync(join(rootDir, 'dist/index.html'), 'utf8');
  const initialAssets = Array.from(
    indexHtml.matchAll(/src="\/assets\/([^"]+\.js)"/g),
    (match) => match[1],
  );

  if (initialAssets.length === 0) {
    throw new Error('bundle budget check failed: no initial JS assets found in dist/index.html');
  }

  const initialSet = new Set(initialAssets);
  const lazyAssets = readdirSync(assetsDir)
    .filter((asset) => asset.endsWith('.js') && !initialSet.has(asset));

  const initialJsGzipBytes = initialAssets
    .map((asset) => gzipSize(join(assetsDir, asset)))
    .reduce((total, size) => total + size, 0);

  // The initial budget covers the entry assets together, so an entry asset's
  // headroom is whatever the whole entry has left.
  const assets = [
    ...initialAssets.map((name) => ({
      name,
      loading: 'initial',
      gzipBytes: gzipSize(join(assetsDir, name)),
      headroomBytes: maxInitialJsGzipBytes - initialJsGzipBytes,
    })),
    ...lazyAssets.map((name) => {
      const gzipBytes = gzipSize(join(assetsDir, name));
      return {
        name,
        loading: 'lazy',
        gzipBytes,
        headroomBytes: maxLazyJsGzipBytes - gzipBytes,
      };
    }),
  ].sort((left, right) => right.gzipBytes - left.gzipBytes);

  if (initialJsGzipBytes > maxInitialJsGzipBytes) {
    throw new Error(
      `bundle budget check failed: initial JS is ${formatBytes(initialJsGzipBytes)} gzip, limit ${formatBytes(maxInitialJsGzipBytes)}`,
    );
  }

  const oversizedLazyAssets = assets.filter(
    (asset) => asset.loading === 'lazy' && asset.gzipBytes > maxLazyJsGzipBytes,
  );
  if (oversizedLazyAssets.length > 0) {
    const details = oversizedLazyAssets
      .map((asset) => `${asset.name}=${formatBytes(asset.gzipBytes)} gzip`)
      .join(', ');
    throw new Error(
      `bundle budget check failed: lazy JS chunk over ${formatBytes(maxLazyJsGzipBytes)}: ${details}`,
    );
  }

  return { initialAssets, lazyAssets, initialJsGzipBytes, assets };
}

function rootDirFromArgs(args) {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 2 && args[0] === '--root') {
    return args[1];
  }
  throw new Error('usage: node scripts/check-bundle-budget.mjs [--root <repo-root>]');
}

function gzipSize(path) {
  const stat = statSync(path);
  if (!stat.isFile()) {
    throw new Error(`bundle budget check failed: missing asset ${path}`);
  }
  return gzipSync(readFileSync(path)).byteLength;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
