/* global console, setTimeout */

import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import http from 'node:http';
import net from 'node:net';
import process from 'node:process';
import { chromium } from '@playwright/test';

const projectName = `formspec-web-quickstart-${process.pid}`;
const composeEnv = {
  ...process.env,
  FORMSPEC_WEB_SERVER_URL: '',
};
const instances = [
  {
    url: 'http://127.0.0.1:8080',
    port: 8080,
    profileName: 'publicPortal',
    brandName: 'formspec-public',
    respondentName: 'Ada Public',
  },
  {
    url: 'http://127.0.0.1:8081',
    port: 8081,
    profileName: 'departmentApp',
    brandName: 'formspec-department',
    respondentName: 'Grace Department',
  },
];

try {
  await main();
} finally {
  spawnSync('docker', ['compose', '-p', projectName, 'down', '--volumes', '--remove-orphans'], {
    stdio: 'ignore',
  });
}

async function main() {
  await assertQuickstartPortsAvailable();
  run('docker', ['compose', 'config', '--quiet']);
  run('docker', ['compose', '-p', projectName, 'up', '--build', '-d']);

  for (const instance of instances) {
    await waitForHealth(instance);
    await assertRuntimeConfig(instance);
  }

  const browser = await chromium.launch();
  try {
    for (const instance of instances) {
      await assertRenderedInstance(browser, instance);
    }
  } finally {
    await browser.close();
  }

  console.log(
    `compose quickstart check passed: ${instances
      .map(({ profileName, port }) => `${profileName} on ${port}`)
      .join(', ')}`,
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: composeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `compose quickstart check failed: ${command} ${args.join(' ')} exited ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout.trim();
}

async function assertQuickstartPortsAvailable() {
  for (const { port } of instances) {
    if (!(await portAvailable(port))) {
      throw new Error(
        `compose quickstart check failed: port ${port} is already in use; stop the existing service before running the documented quickstart gate`,
      );
    }
  }
}

async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

async function assertRuntimeConfig(instance) {
  const response = await request(instance.port, '/formspec-runtime-config.js');
  assertStatus(response, 200, `${instance.profileName} runtime config`);
  const profileLiteral = `profileName: "${instance.profileName}"`;
  if (!response.body.includes(profileLiteral)) {
    throw new Error(
      `compose quickstart check failed: ${instance.profileName} runtime config did not include ${profileLiteral}`,
    );
  }
}

async function assertRenderedInstance(browser, instance) {
  const page = await browser.newPage({
    baseURL: instance.url,
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
    await assertAttribute(page, 'html', 'data-formspec-brand', instance.brandName);

    await page.getByLabel('Full name').fill(instance.respondentName);
    await page.getByLabel('Email address').fill(`${instance.profileName}@example.test`);
    await page.getByLabel('Preferred contact method').selectOption('email');
    await page.getByLabel('Member name').first().fill(instance.respondentName);
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('heading', { name: 'Submission received' }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.getByText(/^STUB-/).waitFor({ state: 'visible', timeout: 30_000 });

    if (consoleFindings.length > 0) {
      throw new Error(
        `compose quickstart check failed: ${instance.profileName} console findings:\n${consoleFindings.join('\n')}`,
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
      `compose quickstart check failed: ${selector} ${attribute}=${actual ?? '<missing>'}, expected ${expected}`,
    );
  }
}

async function waitForHealth(instance) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await request(instance.port, '/healthz');
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
    `compose quickstart check failed: ${instance.profileName} container did not become healthy: ${String(lastError)}`,
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
      `compose quickstart check failed: ${label} returned ${response.statusCode}, expected ${expectedStatus}`,
    );
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
