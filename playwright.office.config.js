import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
const local = existsSync('.env')
  ? Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i), l.slice(i + 1)];
        }),
    )
  : {};
const secret = process.env.OFFICE_JWT_SECRET || local.OFFICE_JWT_SECRET;
if (!secret)
  throw Error(
    'Start the editors Docker profile and set OFFICE_JWT_SECRET before native integration tests.',
  );
export default defineConfig({
  outputDir: 'artifacts/native-test-results',
  testDir: './tests/office-e2e',
  workers: 1,
  timeout: 180000,
  expect: { timeout: 60000 },
  use: {
    actionTimeout: 15000,
    baseURL: 'http://localhost:3102',
    viewport: { width: 1600, height: 1100 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    url: 'http://localhost:3102/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '3102',
      HOST: '0.0.0.0',
      APP_ORIGIN: 'http://localhost:3102',
      DATA_DIR: 'artifacts/office-e2e-' + Date.now(),
      SETUP_KEY: 'office-browser-test-key',
      NODE_ENV: 'test',
      AI_BASE_URL: '',
      OFFICE_JWT_SECRET: secret,
      OFFICE_INTERNAL_URL: 'http://127.0.0.1:8082',
      OFFICE_PUBLIC_URL: 'http://localhost:8082',
      OFFICE_APP_URL: 'http://host.docker.internal:3102',
    },
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/office-playwright-report', open: 'never' }],
  ],
});
