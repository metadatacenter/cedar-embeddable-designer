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
const port = Number(process.env.PORT ?? 4598);

export default defineConfig({
  testDir: './tests',
  /**
   * Two conditional sets. CI supplies the real sibling bundle for CEF specs via
   * `CEF_BUNDLE`; local runs opt in. The visual baselines need the container that makes them mean
   * anything, and `browser/run-in-container.sh` is what sets `CED_VISUAL` — so a
   * developer running the behaviour suite never meets a pixel failure they have no
   * way to act on.
   */
  testIgnore: [
    ...(process.env.CEF_BUNDLE ? [] : ['**/cef-defaults.spec.ts', '**/cef-parity.spec.ts']),
    ...(process.env.CED_VISUAL ? [] : ['**/visual.spec.ts']),
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node serve.mjs',
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
