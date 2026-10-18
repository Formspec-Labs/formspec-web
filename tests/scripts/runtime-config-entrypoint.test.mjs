import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(repoRoot, 'docker/40-formspec-runtime-config.sh');
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('container runtime-config entrypoint', () => {
  // The entrypoint runs in the nginx image, which installs jq (Dockerfile); a host without it cannot run these cases.
  beforeAll(() => {
    if (spawnSync('jq', ['--version']).status !== 0) {
      throw new Error('the runtime-config entrypoint needs jq, which the nginx image installs; run this test where jq is on PATH');
    }
  });
  it('emits scalar and Surface bundle values without evaluating input as JavaScript', () => {
    const root = temporaryRoot();
    const target = join(root, 'formspec-runtime-config.js');
    const surfaceBundle = {
      locator: 'https://bundles.example.gov/respondent.cose?note=";window.compromised=true;//',
      allowedOrigins: ['https://bundles.example.gov'],
      maxBytes: 1_000_000,
      timeoutMs: 15_000,
      redirectPolicy: 'refuse',
      verification: {
        expectedAppId: 'https://example.gov/apps/respondent',
        keys: [{
          kid: 'cmVzcG9uZGVudC1rZXk',
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        }],
      },
      starterModuleId: 'x-respondent',
      receiptResourceUrl: 'https://runtime.example.gov/respondent/receipt',
    };
    const profileName = 'public";window.compromised=true;//\n`$(not-a-command)`';

    const result = runEntrypoint(target, {
      FORMSPEC_WEB_PROFILE: profileName,
      FORMSPEC_WEB_SERVER_URL: 'https://formspec.example.gov/line\nbreak',
      FORMSPEC_WEB_SURFACE_BUNDLE_JSON: JSON.stringify(surfaceBundle),
    });

    expect(result.status).toBe(0);
    const context = { window: {} };
    vm.runInNewContext(readFileSync(target, 'utf8'), context);
    expect(context.window.compromised).toBeUndefined();
    expect(plain(context.window.__FORMSPEC_RUNTIME_CONFIG__)).toEqual({
      profileName,
      formspecServerUrl: 'https://formspec.example.gov/line\nbreak',
      responseActionLedgerCapabilityUrl: '',
      oidcIssuer: '',
      oidcClientId: '',
      oidcRedirectUri: '',
      magicLinkCallbackPath: '',
      surfaceBundle,
    });
    expect(statSync(target).mode & 0o777).toBe(0o644);
  });

  it('emits a supplied attachment byte policy as a number and omits it when absent', () => {
    const target = join(temporaryRoot(), 'formspec-runtime-config.js');
    expect(runEntrypoint(target, { FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES: '1234' }).status).toBe(0);
    expect(evaluateRuntimeConfig(target).attachmentMaxUploadBytes).toBe(1234);
    expect(runEntrypoint(target, {}).status).toBe(0);
    expect(evaluateRuntimeConfig(target)).not.toHaveProperty('attachmentMaxUploadBytes');
  });

  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992', 'not-a-number'])('refuses invalid attachment byte limit %s without replacing the emitted file', value => {
    const target = join(temporaryRoot(), 'formspec-runtime-config.js');
    writeFileSync(target, 'previous-runtime-config\n');
    const result = runEntrypoint(target, { FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES: value });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must be a positive safe integer');
    expect(readFileSync(target, 'utf8')).toBe('previous-runtime-config\n');
  });

  it('omits surfaceBundle when the JSON variable is empty', () => {
    const root = temporaryRoot();
    const target = join(root, 'formspec-runtime-config.js');

    const result = runEntrypoint(target, {
      FORMSPEC_WEB_PROFILE: 'publicPortal',
      FORMSPEC_WEB_SURFACE_BUNDLE_JSON: '',
    });

    expect(result.status).toBe(0);
    const config = evaluateRuntimeConfig(target);
    expect(config.profileName).toBe('publicPortal');
    expect(config).not.toHaveProperty('surfaceBundle');
  });

  it.each([
    ['malformed JSON', '{"locator":'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
  ])('fails on %s and preserves the last emitted file', (_label, input) => {
    const root = temporaryRoot();
    const target = join(root, 'formspec-runtime-config.js');
    writeFileSync(target, 'previous-runtime-config\n');

    const result = runEntrypoint(target, {
      FORMSPEC_WEB_SURFACE_BUNDLE_JSON: input,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'FORMSPEC_WEB_SURFACE_BUNDLE_JSON must contain one valid JSON object.',
    );
    expect(readFileSync(target, 'utf8')).toBe('previous-runtime-config\n');
  });
});

function runEntrypoint(target, overrides) {
  return spawnSync('sh', [scriptPath, target], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      ...overrides,
    },
  });
}

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'formspec-web-runtime-config-'));
  tempRoots.push(root);
  return root;
}

function evaluateRuntimeConfig(target) {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(target, 'utf8'), context);
  return plain(context.window.__FORMSPEC_RUNTIME_CONFIG__);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
