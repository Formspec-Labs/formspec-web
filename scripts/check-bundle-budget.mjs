/* global console, URL */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distDir = new URL('../dist/', import.meta.url);
const indexPath = new URL('index.html', distDir);
const maxInitialJsGzipBytes = 200 * 1024;
const maxLazyJsGzipBytes = 200 * 1024;

const indexHtml = readFileSync(indexPath, 'utf8');
const initialJsAssets = Array.from(indexHtml.matchAll(/src="\/assets\/([^"]+\.js)"/g), (match) => match[1]);

if (initialJsAssets.length === 0) {
  throw new Error('bundle budget check failed: no initial JS assets found in dist/index.html');
}

const initialJsGzipBytes = initialJsAssets
  .map((asset) => gzipSize(join(distDir.pathname, 'assets', asset)))
  .reduce((total, size) => total + size, 0);

const lazyJsAssets = readdirSync(new URL('assets/', distDir))
  .filter((asset) => asset.endsWith('.js') && !initialJsAssets.includes(asset));

const oversizedLazyAssets = lazyJsAssets
  .map((asset) => ({ asset, gzipBytes: gzipSize(join(distDir.pathname, 'assets', asset)) }))
  .filter(({ gzipBytes }) => gzipBytes > maxLazyJsGzipBytes);

if (initialJsGzipBytes > maxInitialJsGzipBytes) {
  throw new Error(
    `bundle budget check failed: initial JS is ${formatBytes(initialJsGzipBytes)} gzip, limit ${formatBytes(maxInitialJsGzipBytes)}`,
  );
}

if (oversizedLazyAssets.length > 0) {
  const details = oversizedLazyAssets
    .map(({ asset, gzipBytes }) => `${asset}=${formatBytes(gzipBytes)} gzip`)
    .join(', ');
  throw new Error(
    `bundle budget check failed: lazy JS chunk over ${formatBytes(maxLazyJsGzipBytes)}: ${details}`,
  );
}

console.log(
  `bundle budget check passed: initial JS ${formatBytes(initialJsGzipBytes)} gzip across ${initialJsAssets.length} asset(s)`,
);

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
