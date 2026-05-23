import brandOverrides from './brand-overrides.json';
import defaultTheme from './upstream/layout/default-theme.json';
import tokenRegistry from './upstream/layout/token-registry.json';
import type { BrandConfig, TokenValue } from '../config/types.ts';

const defaultBrandConfig = brandOverrides as BrandConfig;
const upstreamDefaultTheme = defaultTheme as { tokens: Record<string, TokenValue> };
const upstreamTokenRegistry = tokenRegistry as Record<string, unknown>;

// Bridge upstream registry keys to the CSS variables expected by the copied Tailwind adapter.
const adapterTokenAliases: Record<string, string[]> = {
  'color.primaryForeground': ['color.primary-foreground'],
  'color.foreground': ['color.text'],
  'color.muted': ['color.text-secondary'],
  'color.mutedForeground': ['color.text-muted'],
  'color.error': ['color.error-border', 'color.error-text'],
  'color.warning': ['color.warning-border', 'color.warning-text'],
  'color.info': ['color.info-border', 'color.info-text'],
  'color.surface': ['color.surface-muted', 'color.surface-emphasis'],
  'color.border': ['color.border-strong'],
  'font.family': ['font-family'],
};

export function applyBrandTheme(target: HTMLElement, brandConfig = getDefaultBrandConfig()): void {
  const tokens = mergeBrandTokens(brandConfig);

  for (const [key, value] of Object.entries(tokens)) {
    for (const cssName of cssVarNamesForToken(key)) {
      target.style.setProperty(cssName, String(value));
    }
  }
  target.dataset.formspecBrand = brandConfig.name;
}

export function getDefaultBrandConfig(): BrandConfig {
  return defaultBrandConfig;
}

export function getBrandName(brandConfig = getDefaultBrandConfig()): string {
  return brandConfig.name;
}

export function mergeBrandTokens(brandConfig: BrandConfig): Record<string, TokenValue> {
  return {
    ...upstreamDefaultTheme.tokens,
    ...brandConfig.tokens,
  };
}

export function getUpstreamTokenRegistry(): Record<string, unknown> {
  return upstreamTokenRegistry;
}

function cssVarNamesForToken(key: string): string[] {
  const names = [`--formspec-${key.replace(/\./g, '-')}`];
  for (const alias of adapterTokenAliases[key] ?? []) {
    names.push(`--formspec-${alias.replace(/\./g, '-')}`);
  }
  return names;
}
