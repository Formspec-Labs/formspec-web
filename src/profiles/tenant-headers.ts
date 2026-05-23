import type { TenantBindingConfig, TenantScopeConfig } from '../config/types.ts';

export const formspecTenantHeaderNames = {
  tenant: 'x-formspec-tenant-id',
  workspace: 'x-formspec-workspace-id',
  environment: 'x-formspec-environment-id',
  cell: 'x-formspec-cell-id',
} as const;

export type FormspecTenantHeaders = Record<
  (typeof formspecTenantHeaderNames)[keyof typeof formspecTenantHeaderNames],
  string
>;

export function tenantScopeHeaders(binding: TenantBindingConfig): Partial<FormspecTenantHeaders> {
  if (binding.kind === 'implicit' && binding.headerMode === 'omit-post-ext24') {
    return {};
  }

  const scope = tenantScopeForHeaders(binding);
  return {
    [formspecTenantHeaderNames.tenant]: scope.tenant,
    [formspecTenantHeaderNames.workspace]: scope.workspace,
    [formspecTenantHeaderNames.environment]: scope.environment,
    [formspecTenantHeaderNames.cell]: scope.cell,
  };
}

function tenantScopeForHeaders(binding: TenantBindingConfig): TenantScopeConfig {
  return binding.kind === 'bound' ? binding.scope : binding.sentinelScope;
}
