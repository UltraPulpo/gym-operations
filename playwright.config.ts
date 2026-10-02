import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), '');
const basePath = env.PAGES_BASE_PATH || '/gym-operations/';
const baseURL = new URL(basePath, 'http://127.0.0.1:4173').href;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
