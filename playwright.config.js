import { defineConfig } from '@playwright/test';

// Allow overriding the base URL/port via env, default to 9011 (current running server)
const basePort = process.env.PW_PORT || '9011';
const baseURL = `http://localhost:${basePort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `node serve.js ${basePort}`,
    port: parseInt(basePort),
    timeout: 10000,
    reuseExistingServer: true,
  },
});
