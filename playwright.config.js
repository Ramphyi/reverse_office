import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    baseURL: 'http://127.0.0.1:3101',
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '3101',
      HOST: '127.0.0.1',
      DATA_DIR: 'artifacts/e2e-data-' + Date.now(),
      SETUP_KEY: 'browser-test-setup-key',
      NODE_ENV: 'test',
    },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
