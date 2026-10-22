import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_CSS_PATH = resolve(import.meta.dirname, '../../src/app/app.css');
const STATUS_CSS_PATH = resolve(import.meta.dirname, '../../src/app/status.css');
const LIFECYCLE_CSS_PATH = resolve(import.meta.dirname, '../../src/app/lifecycle-actions.css');
const NATIVE_RUNTIME_CSS_PATH = resolve(import.meta.dirname, '../../src/app/native-runtime.css');

describe('formspec-web D1 theme tokens, dark-mode contrast parity, and editorial typography', () => {
  const appCss = readFileSync(APP_CSS_PATH, 'utf8');
  const statusCss = readFileSync(STATUS_CSS_PATH, 'utf8');
  const lifecycleCss = readFileSync(LIFECYCLE_CSS_PATH, 'utf8');
  const nativeRuntimeCss = readFileSync(NATIVE_RUNTIME_CSS_PATH, 'utf8');

  it('declares color-scheme: light dark and complete light/dark root tokens in app.css', () => {
    expect(appCss).toContain('color-scheme: light dark;');
    expect(appCss).toContain('--formspec-color-background: #f6f0e6;');
    expect(appCss).toContain('--formspec-color-surface: #efe7da;');
    expect(appCss).toContain('--formspec-color-surface-1: #fdfaf4;');
    expect(appCss).toContain('--formspec-color-surface-2: #f3ece0;');
    expect(appCss).toContain('--formspec-color-card: #fdfaf4;');
    expect(appCss).toContain('--formspec-color-foreground: #1f1b17;');
    expect(appCss).toContain('--formspec-color-text: #1f1b17;');
    expect(appCss).toContain('--formspec-color-muted-foreground: #5c5349;');
    expect(appCss).toContain('--formspec-color-text-secondary: #5c5349;');
    expect(appCss).toContain('--formspec-color-muted: #efe7da;');
    expect(appCss).toContain('--formspec-color-border: #d1c8ba;');
    expect(appCss).toContain('--formspec-color-border-strong: #8b8175;');
    expect(appCss).toContain('--formspec-color-primary: #27594f;');
    expect(appCss).toContain('--formspec-color-primary-hover: #1e463e;');
    expect(appCss).toContain('--formspec-color-primary-foreground: #ffffff;');
    expect(appCss).toContain('--formspec-color-focus: #27594f;');
    expect(appCss).toContain('--formspec-color-error: #b42318;');
    expect(appCss).toContain('--formspec-color-error-surface: #fdeceb;');
    expect(appCss).toContain('--formspec-color-warning: #9b5b00;');
    expect(appCss).toContain('--formspec-color-warning-surface: #fff2db;');
    expect(appCss).toContain('--formspec-color-success: #1b6545;');
    expect(appCss).toContain('--formspec-color-success-surface: #ebf5ef;');

    // Dark-mode overrides under both prefers-color-scheme and data-fs-appearance="dark"
    expect(appCss).toContain(':root:not([data-fs-appearance="light"])');
    expect(appCss).toContain(':root[data-fs-appearance="dark"]');
    expect(appCss).toContain('--formspec-color-background: #161311;');
    expect(appCss).toContain('--formspec-color-surface: #1d1916;');
    expect(appCss).toContain('--formspec-color-surface-1: #211c19;');
    expect(appCss).toContain('--formspec-color-surface-2: #2b2420;');
    expect(appCss).toContain('--formspec-color-card: #211c19;');
    expect(appCss).toContain('--formspec-color-foreground: #f3ecdf;');
    expect(appCss).toContain('--formspec-color-muted-foreground: #bfb3a3;');
    expect(appCss).toContain('--formspec-color-primary: #8bb8ac;');
    expect(appCss).toContain('--formspec-color-primary-foreground: #14221e;');
  });

  it('eliminates hardcoded hex literals from status.css, lifecycle-actions.css, and native-runtime.css', () => {
    expect(statusCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(lifecycleCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(nativeRuntimeCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

    // Current stage cell uses civic forest-teal / sage tokens instead of electric blue
    expect(statusCss).toContain(
      'background: color-mix(in srgb, var(--formspec-color-primary) 16%, var(--formspec-color-surface-1));',
    );
    expect(statusCss).toContain('border: 1.5px solid var(--formspec-color-primary);');
  });

  it('wires Fraunces heading serif and JetBrains Mono tabular identifiers across app, status, and lifecycle styles', () => {
    expect(appCss).toContain('--formspec-font-heading: "Fraunces"');
    expect(appCss).toContain('--formspec-font-mono: "JetBrains Mono"');
    expect(appCss).toMatch(/\.respondent-header h1\s*\{[^}]*font-family:\s*var\(--formspec-font-heading\)/s);
    expect(appCss).toMatch(/\.respondent-case-ref\s*\{[^}]*font-family:\s*var\(--formspec-font-mono\)/s);
    expect(statusCss).toContain('.status-card__heading');
    expect(statusCss).toContain('.status-timing-list__elapsed');
    expect(statusCss).toContain('font-variant-numeric: tabular-nums;');
    expect(lifecycleCss).toContain('.lifecycle-actions__heading');
  });
});
