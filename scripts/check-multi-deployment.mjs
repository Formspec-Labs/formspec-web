/* global console, setTimeout */

import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import http from 'node:http';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';
import { parseRuntimeConfigScript } from './parse-runtime-config-script.mjs';

const usePrebuiltImage = process.env.FORMSPEC_WEB_TEST_USE_PREBUILT_IMAGE === '1';
const imageTag = usePrebuiltImage
  ? 'formspec-web:local'
  : `formspec-web:multi-${process.pid}`;
const respondentSurfaceBundle = {
  locator: 'https://bundles.example.gov/respondent.cose',
  allowedOrigins: ['https://bundles.example.gov'],
  maxBytes: 1_000_000,
  timeoutMs: 15_000,
  redirectPolicy: 'refuse',
  starterModuleId: 'x-respondent',
  receiptResourceUrl: 'https://runtime.example.gov/respondent/receipt',
  verification: {
    expectedAppId: 'https://example.gov/apps/respondent',
    methodRegistry: {
      version: '1.0.0',
      entries: [{
        id: 'urn:formspec:sig-method:ed25519-cose-sign1@1',
        suite: 'Ed25519',
        wire: 'COSE_Sign1',
        alg: -8,
        status: 'registered',
      }],
    },
    keys: [{
      kid: 'cmVzcG9uZGVudC1rZXk',
      publicKey: 'fx3_yLroLm6rm0sr39ep4fO15R7XxmMZWaJX731JUfY',
    }],
    authorities: [{
      kid: 'cmVzcG9uZGVudC1rZXk',
      publisherId: 'https://publisher.example.gov/',
      publisherDisplayName: 'Example publisher',
      appIds: ['https://example.gov/apps/respondent'],
      methods: ['urn:formspec:sig-method:ed25519-cose-sign1@1'],
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      revoked: false,
    }],
    pinnedReleases: [{
      digest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      releaseId: 'respondent-2026-07-28',
    }],
  },
};
const containers = [
  {
    name: `formspec-web-multi-public-${process.pid}`,
    profileName: 'publicPortal',
    brandName: 'formspec-public',
    respondentName: 'Ada Public',
    surfaceBundle: respondentSurfaceBundle,
  },
  {
    name: `formspec-web-multi-department-${process.pid}`,
    profileName: 'departmentApp',
    brandName: 'formspec-department',
    respondentName: 'Grace Department',
  },
];

try {
  await main();
} finally {
  for (const container of containers) {
    spawnSync('docker', ['rm', '-f', container.name], { stdio: 'ignore' });
  }
  if (!usePrebuiltImage) {
    spawnSync('docker', ['image', 'rm', imageTag], { stdio: 'ignore' });
  }
}

async function main() {
  if (!usePrebuiltImage) {
    run('docker', ['build', '-t', imageTag, '.']);
  }
  for (const container of containers) {
    run('docker', [
      'run',
      '--rm',
      '-d',
      '--name',
      container.name,
      '-p',
      '127.0.0.1::80',
      '-e',
      `FORMSPEC_WEB_PROFILE=${container.profileName}`,
      '-e',
      `FORMSPEC_WEB_SURFACE_BUNDLE_JSON=${
        container.surfaceBundle ? JSON.stringify(container.surfaceBundle) : ''
      }`,
      imageTag,
    ]);
    container.port = publishedPort(container.name);
  }

  for (const container of containers) {
    await waitForHealth(container);
    await assertRuntimeConfig(container);
  }

  const browser = await chromium.launch();
  try {
    for (const container of containers) {
      await assertRenderedInstance(browser, container);
    }
  } finally {
    await browser.close();
  }

  console.log(
    `multi-deployment check passed: ${containers
      .map(({ profileName, port }) => `${profileName} on ${port}`)
      .join(', ')}`,
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
        `multi-deployment check failed: ${command} ${args.join(' ')} exited ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout.trim();
}

function publishedPort(containerName) {
  const output = run('docker', ['port', containerName, '80/tcp']);
  const match = /:(\d+)\s*$/.exec(output);
  if (!match) {
    throw new Error(
      `multi-deployment check failed: could not read published port for ${containerName}: ${output}`,
    );
  }
  return Number(match[1]);
}

async function assertRuntimeConfig(container) {
  const response = await request(container.port, '/formspec-runtime-config.js');
  assertStatus(response, 200, `${container.profileName} runtime config`);
  const config = parseRuntimeConfigScript(response.body);
  if (config.profileName !== container.profileName) {
    throw new Error(
      `multi-deployment check failed: ${container.profileName} runtime config selected ${String(config.profileName)}`,
    );
  }
  if (!isDeepStrictEqual(config.surfaceBundle, container.surfaceBundle)) {
    throw new Error(
      `multi-deployment check failed: ${container.profileName} runtime config did not preserve surfaceBundle`,
    );
  }
}

async function assertRenderedInstance(browser, container) {
  const page = await browser.newPage({
    baseURL: `http://127.0.0.1:${container.port}`,
  });
  const consoleFindings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleFindings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    consoleFindings.push(`pageerror: ${error.message}`);
  });

  try {
    await page.goto('/');
    await page.getByRole('heading', { name: 'Demo Benefits Intake' }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await assertAttribute(page, 'html', 'data-formspec-brand', container.brandName);

    await page.getByLabel('Full name').fill(container.respondentName);
    await page.getByLabel('Email address').fill(`${container.profileName}@example.test`);
    await page.getByLabel('Preferred contact method').selectOption('email');
    await page.getByLabel('Member name').first().fill(container.respondentName);
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('heading', { name: 'Submission received' }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.getByText(/^STUB-/).waitFor({ state: 'visible', timeout: 30_000 });

    if (consoleFindings.length > 0) {
      throw new Error(
        `multi-deployment check failed: ${container.profileName} console findings:\n${consoleFindings.join('\n')}`,
      );
    }
  } finally {
    await page.close();
  }
}

async function assertAttribute(page, selector, attribute, expected) {
  const actual = await page.locator(selector).getAttribute(attribute);
  if (actual !== expected) {
    throw new Error(
      `multi-deployment check failed: ${selector} ${attribute}=${actual ?? '<missing>'}, expected ${expected}`,
    );
  }
}

async function waitForHealth(container) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await request(container.port, '/healthz');
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
    `multi-deployment check failed: ${container.profileName} container did not become healthy: ${String(lastError)}`,
  );
}

async function request(port, path) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          settled = true;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
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

function assertStatus(response, expectedStatus, label) {
  if (response.statusCode !== expectedStatus) {
    throw new Error(
      `multi-deployment check failed: ${label} returned ${response.statusCode}, expected ${expectedStatus}`,
    );
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
