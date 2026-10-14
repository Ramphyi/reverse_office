import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/studio-e2e',
  outputDir: './artifacts/studio-test-results',
  workers: 1,
  timeout: 45000,
  expect: { timeout: 7000 },
  use: {
    baseURL: process.env.STUDIO_URL || 'http://127.0.0.1:3104',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.STUDIO_URL
    ? undefined
    : {
        command: 'node scripts/studio-dev.mjs',
        url: 'http://127.0.0.1:3104',
        reuseExistingServer: false,
      },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/studio-browser-report', open: 'never' }],
  ],
});
