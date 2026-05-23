/* global console, setTimeout */

import { spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import process from 'node:process';

const imageTag = `formspec-web:headers-${process.pid}`;
const containerName = `formspec-web-header-check-${process.pid}`;

try {
  await main();
} finally {
  spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  spawnSync('docker', ['image', 'rm', imageTag], { stdio: 'ignore' });
}

async function main() {
  const port = await availablePort();
  run('docker', ['build', '-t', imageTag, '.']);
  run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    containerName,
    '-p',
    `127.0.0.1:${port}:80`,
    imageTag,
  ]);

  await waitForHealth(port);
  const assets = assetsInContainer();
  const compressedAssets = assets.filter((asset) =>
    /\.(?:css|js|wasm)$/.test(asset),
  );

  if (compressedAssets.length === 0) {
    throw new Error('deployment header check failed: no compressible assets found in image');
  }

  for (const asset of compressedAssets) {
    const path = `/assets/${asset}`;
    const response = await request(port, path, {
      'Accept-Encoding': 'gzip',
    });
    assertStatus(response, 200, path);
    assertHeaderEquals(response, 'content-encoding', 'gzip', path);
    assertHeaderIncludes(response, 'vary', 'Accept-Encoding', path);
    assertCacheControl(path, response, {
      required: ['public', 'max-age=31536000', 'immutable'],
      forbidden: ['no-cache', 'no-store'],
    });
  }

  const missingAsset = await request(port, '/assets/not-real.js', {
    'Accept-Encoding': 'gzip',
  });
  assertStatus(missingAsset, 404, '/assets/not-real.js');
  assertCacheControl('/assets/not-real.js', missingAsset, {
    forbidden: ['public', 'max-age=31536000', 'immutable'],
  });

  for (const path of ['/', '/index.html', '/not-a-real-route']) {
    const response = await request(port, path, {
      'Accept-Encoding': 'gzip',
    });
    assertStatus(response, 200, path);
    assertCacheControl(path, response, {
      required: ['no-cache'],
      forbidden: ['public', 'max-age=31536000', 'immutable', 'no-store'],
    });
  }

  const runtimeConfig = await request(port, '/formspec-runtime-config.js', {
    'Accept-Encoding': 'gzip',
  });
  assertStatus(runtimeConfig, 200, '/formspec-runtime-config.js');
  assertCacheControl('/formspec-runtime-config.js', runtimeConfig, {
    required: ['no-store'],
    forbidden: ['public', 'max-age=31536000', 'immutable', 'no-cache'],
  });

  console.log(
    `deployment header check passed: ${compressedAssets.length} asset(s) gzip-compressed and immutable; HTML revalidates; runtime config is no-store`,
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `deployment header check failed: ${command} ${args.join(' ')} exited ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout.trim();
}

function assetsInContainer() {
  return run('docker', [
    'exec',
    containerName,
    'ls',
    '-1',
    '/usr/share/nginx/html/assets',
  ])
    .split('\n')
    .map((asset) => asset.trim().split('/').at(-1) ?? '')
    .filter(Boolean);
}

async function waitForHealth(port) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await request(port, '/healthz');
      if (response.statusCode === 200) {
        return;
      }
      lastError = new Error(`/healthz returned ${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `deployment header check failed: container did not become healthy: ${String(lastError)}`,
  );
}

async function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          settled = true;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
          });
        });
      },
    );
    req.setTimeout(5_000, () => {
      req.destroy(new Error(`request timed out for ${path}`));
    });
    req.on('error', (error) => {
      if (!settled) {
        reject(error);
      }
    });
    req.end();
  });
}

function assertStatus(response, expectedStatus, path) {
  if (response.statusCode !== expectedStatus) {
    throw new Error(
      `deployment header check failed: ${path} returned ${response.statusCode}, expected ${expectedStatus}`,
    );
  }
}

function assertHeaderIncludes(response, name, expectedValue, path) {
  const value = response.headers[name];
  const values = Array.isArray(value) ? value.join(', ') : value;
  if (!values || !values.toLowerCase().includes(expectedValue.toLowerCase())) {
    throw new Error(
      `deployment header check failed: ${path} header ${name}=${values ?? '<missing>'}, expected ${expectedValue}`,
    );
  }
}

function assertHeaderEquals(response, name, expectedValue, path) {
  const value = response.headers[name];
  const values = Array.isArray(value) ? value.join(', ') : value;
  if (!values || values.toLowerCase() !== expectedValue.toLowerCase()) {
    throw new Error(
      `deployment header check failed: ${path} header ${name}=${values ?? '<missing>'}, expected exactly ${expectedValue}`,
    );
  }
}

function assertCacheControl(path, response, policy) {
  const directives = cacheControlDirectives(response.headers['cache-control']);
  for (const directive of policy.required ?? []) {
    if (!directives.has(directive)) {
      throw new Error(
        `deployment header check failed: ${path} Cache-Control is missing ${directive}`,
      );
    }
  }
  for (const directive of policy.forbidden ?? []) {
    if (directives.has(directive)) {
      throw new Error(
        `deployment header check failed: ${path} Cache-Control must not include ${directive}`,
      );
    }
  }
}

function cacheControlDirectives(value) {
  const values = Array.isArray(value) ? value.join(',') : value ?? '';
  return new Set(
    values
      .split(',')
      .map((directive) => directive.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('could not allocate a TCP port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
