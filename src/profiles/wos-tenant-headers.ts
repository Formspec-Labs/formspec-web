import type { TenantBindingConfig } from '../config/types.ts';
import { formspecTenantHeaderNames, tenantScopeHeaders } from './tenant-headers.ts';

/** Tolerated scope metadata for native WOS applicant-status and task APIs. */
export const wosTenantHeaderNames = {
  tenant: 'x-wos-tenant-id',
  cell: 'x-wos-cell-id',
} as const;

/** Workspace and environment authority stay with WOS authentication and server configuration. */
export function wosTenantScopeHeaders(binding: TenantBindingConfig | undefined): Readonly<Record<string, string>> {
  const selected = binding ? tenantScopeHeaders(binding) : {};
  const headers: Record<string, string> = {};
  for (const field of Object.keys(wosTenantHeaderNames) as (keyof typeof wosTenantHeaderNames)[]) {
    const value = selected[formspecTenantHeaderNames[field]];
    if (value !== undefined) headers[wosTenantHeaderNames[field]] = value;
  }
  return Object.freeze(headers);
}
