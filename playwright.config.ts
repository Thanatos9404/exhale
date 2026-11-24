/**
 * Playwright end-to-end configuration.
 *
 * The suite drives the production build (`vite preview`) in the installed Google Chrome, on a
 * desktop and a phone-sized viewport. It is hermetic: every request that would leave the machine
 * is answered from fixtures by `e2e/support/mockNetwork.ts`, and the clock is pinned to the
 * fixture's "now" by `e2e/support/test.ts`.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  // Lets specs import the app's own fixtures and engine, including the `@/` alias.
  tsconfig: './tsconfig.node.json',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  ...(CI ? { workers: 2 } : {}),
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    // The fixture day is a Delhi winter day; the browser lives in the same time zone.
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    // Animations are off by default so they cannot cause flakiness; motion.spec.ts turns them on.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'phone-chrome',
      use: {
        ...devices['Pixel 7'],
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
