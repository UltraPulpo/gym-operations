import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), '');
const basePath = env.PAGES_BASE_PATH || '/gym-operations/';
const portInput = process.env.PLAYWRIGHT_PORT;
const port = portInput === undefined ? 4173 : Number(portInput);
if (
  (portInput !== undefined && !/^\d+$/.test(portInput)) ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  throw new Error('PLAYWRIGHT_PORT must be an integer from 1 to 65535.');
}
const baseURL = new URL(basePath, `http://127.0.0.1:${port}`).href;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
