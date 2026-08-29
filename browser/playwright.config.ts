import { defineConfig, devices } from '@playwright/test';

/**
 * Behaviour, not screenshots.
 *
 * Every failure this suite exists for was found by hand in a browser and by
 * nothing else: an entry point that never defined the element, `getElementById`
 * finding nothing inside a shadow root, menus closing on their own opening click,
 * a view effect that fired once and then never again, a logo the package did not
 * carry. A unit test can see none of them — they need a real browser and the
 * built bundle.
 *
 * Hermetic: no test reaches a terminology server. The one that covers the term
 * picker registers a stub element in the page, so what is under test is the
 * designer's half of that contract rather than another component's behaviour.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4598',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://localhost:4598',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
