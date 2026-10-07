import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpAttachmentStore } from '../../src/adapters/http/attachment-store.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { resolveActiveConfig } from '../../src/config/runtime.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import { webcrypto, createHash } from 'node:crypto';
import { sampleFormDefinition, sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';

const tenantBinding = { kind: 'bound' as const, scope: { tenant: 'tenant_managed_single_cell', workspace: 'workspace_managed_single_cell', environment: 'environment_production', cell: 'cell_primary' } };
afterEach(() => vi.unstubAllGlobals());

describe('local package preview with real submit', () => {
  it('uses no fake identity and reaches the mapped server form with deployment scope', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const bytes = JSON.stringify(sampleFormDefinition);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const requests: Array<{url: string; headers: Headers}> = [];
    vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/package.json')) return new Response(JSON.stringify({ files: { definition: { path: 'definition.json', sha256 } } }));
      if (url.endsWith('/definition.json')) return new Response(bytes);
      requests.push({ url, headers: new Headers(init.headers) });
      if (url.endsWith('/runtime/forms/server-form-id')) return new Response(JSON.stringify({ definition: sampleFormDefinition }), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ title: 'not-found', detail: 'active form version not found', status: 404 }), { status: 404, headers: { 'content-type': 'application/problem+json' } });
    });
    const config = resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'http://127.0.0.1:18080', tenantBinding });
    expect(config.tenantBinding).toEqual(tenantBinding);
    const composition = createDefaultComposition(config, { initialDefinitionUrl: 'server-form-id', packageUrl: '/package.json' });
    expect(await composition.identityProvider.discover()).toEqual([]);
    expect(composition.localPackagePreview).toBe(true);
    expect(composition.instanceCapabilities.offlineSubmit).toBe('unavailable');
    expect(composition.instanceCapabilities.fileUpload).toBe('available');
    expect(composition.attachmentStore).toBeInstanceOf(HttpAttachmentStore);
    await expect(composition.draftStore.save({ formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version }, sampleFormResponse)).rejects.toMatchObject({ status: 404 });
    expect(requests[1]?.url).toBe('http://127.0.0.1:18080/runtime/forms/server-form-id/sessions/anonymous');
    expect(requests[0]?.headers.get('x-formspec-tenant-id')).toBe(tenantBinding.scope.tenant);
    expect(requests[0]?.headers.get('x-formspec-workspace-id')).toBe(tenantBinding.scope.workspace);
    expect(requests[0]?.headers.get('x-formspec-environment-id')).toBe(tenantBinding.scope.environment);
    expect(requests[0]?.headers.get('x-formspec-cell-id')).toBe(tenantBinding.scope.cell);
  });
});
