import { defineConfig } from '@playwright/test';
export default defineConfig({testDir: '.', testMatch: 'probe.spec.mjs', workers: 1, retries: 0, timeout: 45000, reporter: [['list']], outputDir: '../../../output/playwright/renderer-measure', use: { headless: true, trace: 'on' } });
