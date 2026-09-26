import { defineConfig, devices } from '@playwright/test';

const conversations = Number(process.env.PERF_CONVERSATIONS ?? '1000');
const timeout = conversations >= 50_000 ? 900_000 : conversations >= 10_000 ? 420_000 : 120_000;
const expectTimeout = conversations >= 50_000 ? 300_000 : conversations >= 10_000 ? 180_000 : 30_000;

export default defineConfig({
  testDir: './tests/performance',
  fullyParallel: false,
  workers: 1,
  timeout,
  expect: { timeout: expectTimeout },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: conversations >= 50_000 ? 180_000 : 120_000
  },
  projects: [{ name: 'chromium-performance', use: { ...devices['Desktop Chrome'] } }]
});
