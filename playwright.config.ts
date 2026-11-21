import { defineConfig, devices } from '@playwright/test';

const port = 4197;
const baseURL = `http://127.0.0.1:${port}/lendinvest-test/`;

const env = { ...process.env };
// Empty values override .env.development.local so tests cannot reach production.
env.VITE_COPILOT_API_URL = '';
env.VITE_TURNSTILE_SITE_KEY = '';
env.VITE_COPILOT_DEMO = '';
env.COPILOT_API_KEY = '';
env.COPILOT_MODEL = '';
env.COPILOT_PROVIDER = 'disabled';
env.COPILOT_BASE_URL = 'http://127.0.0.1:9';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    // Preview the production build. Vite's dev HTML rewrite joins `base` onto
    // an href that already starts with `%BASE_URL%`, which doubles the favicon path.
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env,
  },
});
