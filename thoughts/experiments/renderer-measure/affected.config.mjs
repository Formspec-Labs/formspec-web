import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:['affected.spec.mjs','upload.spec.mjs'],workers:1,retries:0,timeout:30000,reporter:[['list']],outputDir:'../../../output/playwright/renderer-affected',use:{headless:true,trace:'on'}});
