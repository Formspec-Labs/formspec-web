import brandOverrides from './brand-overrides.json';

type TokenValue = string | number;

interface BrandOverrides {
  name: string;
  tokens: Record<string, TokenValue>;
}

const activeBrandOverrides = brandOverrides as BrandOverrides;

export function applyBrandTheme(target: HTMLElement): void {
  for (const [key, value] of Object.entries(activeBrandOverrides.tokens)) {
    target.style.setProperty(`--formspec-${key.replace(/\./g, '-')}`, String(value));
  }
  target.dataset.formspecBrand = activeBrandOverrides.name;
}

export function getActiveBrandName(): string {
  return activeBrandOverrides.name;
}
