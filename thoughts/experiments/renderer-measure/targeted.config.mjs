import { defineConfig } from '@playwright/test';
export default defineConfig({testDir: '.', testMatch: 'targeted.spec.mjs', workers: 1, retries: 0, timeout: 30000, reporter: [['list']], outputDir: '../../../output/playwright/renderer-targeted', use: { headless: true, trace: 'on' }});
