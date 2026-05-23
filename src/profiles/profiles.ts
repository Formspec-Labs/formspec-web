import type { FormspecWebConfig, TenantBindingConfig } from '../config/types.ts';

const departmentScope = {
  tenant: 'department-reference',
  workspace: 'default-workspace',
  environment: 'prod',
  cell: 'primary',
} as const;

const publicSentinelScope = {
  tenant: 'public-portal-sentinel',
  workspace: 'public',
  environment: 'prod',
  cell: 'edge',
} as const;

const departmentTenantBinding: TenantBindingConfig = {
  kind: 'bound',
  scope: departmentScope,
};

const publicPortalTenantBinding: TenantBindingConfig = {
  kind: 'implicit',
  sentinelScope: publicSentinelScope,
  headerMode: 'sentinel-until-ext24',
};

export const departmentAppProfile = {
  profileName: 'departmentApp',
  tenantBinding: departmentTenantBinding,
  identity: {
    mode: 'oidc-required',
    oidc: {
      issuer: 'https://idp.example.gov/realms/formspec',
      clientId: 'formspec-web-department',
      redirectUri: '/auth/callback',
      minAssurance: 'L2',
    },
  },
  brand: {
    name: 'formspec-department',
    tokens: {
      'color.primary': '#155e56',
      'color.primaryForeground': '#ffffff',
      'color.foreground': '#1f2933',
      'color.background': '#f7f8f5',
      'color.border': '#c9d3cd',
      'color.card': '#ffffff',
      'color.muted': '#5d6b66',
      'color.mutedForeground': '#66736f',
      'color.ring': '#155e56',
      'color.surface': '#edf3ef',
      'radius.sm': '0.5rem',
      'radius.md': '0.75rem',
    },
  },
  ports: {
    definitionSource: 'stub',
    draftStore: 'stub',
    submitTransport: 'stub',
    identityProvider: 'oidc',
    notificationDelivery: 'stub',
  },
  referenceAdapters: {
    formspecStack: {
      formspecServerUrl: '/api/formspec',
      tenantHeaderDialect: 'formspec',
      oidc: {
        issuer: 'https://idp.example.gov/realms/formspec',
        clientId: 'formspec-web-department',
        redirectUri: '/auth/callback',
        minAssurance: 'L2',
      },
    },
  },
} satisfies FormspecWebConfig;

export const publicPortalProfile = {
  profileName: 'publicPortal',
  tenantBinding: publicPortalTenantBinding,
  identity: {
    mode: 'anonymous-allowed',
    magicLink: {
      callbackPath: '/magic-link/callback',
      minAssurance: 'L2',
    },
  },
  brand: {
    name: 'formspec-public',
    tokens: {
      'color.primary': '#2f6f8f',
      'color.primaryForeground': '#ffffff',
      'color.foreground': '#26333d',
      'color.background': '#fbfcfd',
      'color.border': '#cfdae2',
      'color.card': '#ffffff',
      'color.muted': '#60717d',
      'color.mutedForeground': '#6c7c86',
      'color.ring': '#2f6f8f',
      'color.surface': '#eef5f8',
      'radius.sm': '0.375rem',
      'radius.md': '0.5rem',
    },
  },
  ports: {
    definitionSource: 'stub',
    draftStore: 'stub',
    submitTransport: 'stub',
    identityProvider: 'anonymous',
    notificationDelivery: 'stub',
  },
  referenceAdapters: {
    formspecStack: {
      formspecServerUrl: '/api/formspec',
      tenantHeaderDialect: 'formspec',
      magicLinkCallbackPath: '/magic-link/callback',
    },
  },
} satisfies FormspecWebConfig;

export const referenceProfiles = {
  departmentApp: departmentAppProfile,
  publicPortal: publicPortalProfile,
} as const satisfies Record<string, FormspecWebConfig>;

export type ReferenceProfileName = keyof typeof referenceProfiles;

export function getReferenceProfile(profileName: string): FormspecWebConfig | undefined {
  return referenceProfiles[profileName as ReferenceProfileName];
}
