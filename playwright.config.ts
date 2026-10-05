import { defineConfig } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL, headless: true },
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? 'npm run dev:web',
    url: baseURL,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
});
