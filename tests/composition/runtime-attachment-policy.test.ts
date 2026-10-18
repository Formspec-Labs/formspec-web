import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRuntimeConfig, resolveActiveConfig, runtimeConfigFromEnvRecord } from '../../src/config/runtime.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';

afterEach(() => vi.unstubAllGlobals());

describe('deployment-owned attachment byte limit', () => {
  it.each(['FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES', 'VITE_FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES'])('parses %s as a numeric override', key => {
    expect(runtimeConfigFromEnvRecord({ [key]: '1234' }).attachmentMaxUploadBytes).toBe(1234);
  });

  it('keeps an absent limit unknown and a valid profile limit unless overridden', () => {
    expect(runtimeConfigFromEnvRecord({})).not.toHaveProperty('attachmentMaxUploadBytes');
    expect(resolveActiveConfig(publicPortalProfile).referenceAdapters?.formspecStack?.attachments?.maxUploadBytes).toBeUndefined();
    const profile = { ...publicPortalProfile, referenceAdapters: { formspecStack: {
      attachments: { maxUploadBytes: 2345 },
    } } };
    expect(resolveActiveConfig(profile).referenceAdapters?.formspecStack?.attachments?.maxUploadBytes).toBe(2345);
    expect(resolveActiveConfig(profile, { attachmentMaxUploadBytes: 1234 }).referenceAdapters?.formspecStack?.attachments?.maxUploadBytes).toBe(1234);
  });

  it('retains numeric runtime JS and its precedence over environment configuration', () => {
    vi.stubGlobal('window', { __FORMSPEC_RUNTIME_CONFIG__: { attachmentMaxUploadBytes: 3456 } });
    expect(readRuntimeConfig().attachmentMaxUploadBytes).toBe(3456);
  });

  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992', 'not-a-number'])('refuses invalid environment value %s', value => {
    expect(() => runtimeConfigFromEnvRecord({ FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES: value })).toThrow(/positive safe integer/);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('refuses invalid numeric runtime and profile limits %s', value => {
    expect(() => resolveActiveConfig(publicPortalProfile, { attachmentMaxUploadBytes: value })).toThrow(/positive safe integer/);
    expect(() => resolveActiveConfig({ ...publicPortalProfile, referenceAdapters: { formspecStack: {
      attachments: { maxUploadBytes: value },
    } } })).toThrow(/positive safe integer/);
    vi.stubGlobal('window', { __FORMSPEC_RUNTIME_CONFIG__: { attachmentMaxUploadBytes: value } });
    expect(() => readRuntimeConfig()).toThrow(/positive safe integer/);
  });
});
