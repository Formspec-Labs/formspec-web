import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.FORMSPEC_WEB_E2E_PORT ?? '5173');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('FORMSPEC_WEB_E2E_PORT must be an integer from 1024 through 65535');
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
