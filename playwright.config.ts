import { dirname } from 'path';
import { defineConfig, devices } from '@playwright/test';

const pluginE2eAuth = `${dirname(require.resolve('@grafana/plugin-e2e'))}/auth`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The html reporter blocks at the end of a local run serving the report;
  // keep it for CI artifacts but list output locally.
  reporter: process.env.CI ? 'html' : [['line'], ['html', { open: 'never' }]],
  use: {
    // Target any Grafana instance via GRAFANA_URL=http://host:port.
    // Defaults to the testing/ docker-compose stack (Grafana on :3101 with
    // the plugin, Prometheus, and demo dashboards provisioned); CI passes
    // its own URL explicitly.
    baseURL: process.env.GRAFANA_URL || 'http://localhost:3101',
    // PW_CHANNEL=chrome reuses the system Chrome install instead of
    // downloading Playwright's bundled Chromium (handy locally / offline).
    // Top-level so the auth setup project inherits it too.
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'auth',
      testDir: pluginE2eAuth,
      testMatch: [/.*\.js/],
    },
    {
      name: 'run-tests',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PW_CHANNEL || undefined,
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['auth'],
    },
  ],
});
