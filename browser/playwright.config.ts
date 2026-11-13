import { defineConfig, devices } from '@playwright/test';
import { NEEDS_CEF, NEEDS_PICKER } from './tests/bundle-tags';

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
const missingBundles = [
  ...(process.env.CEF_BUNDLE ? [] : [NEEDS_CEF]),
  ...(process.env.PICKER_BUNDLE ? [] : [NEEDS_PICKER]),
];

// Pure pixel baselines use Chromium in the pinned Linux image. All other specs enter every engine.
const ignoredSpecs = [
  ...(process.env.CEF_BUNDLE
    ? []
    : ['**/cef-defaults.spec.ts', '**/cef-parity.spec.ts', '**/style-comparison.spec.ts']),
  ...(process.env.CED_VISUAL ? [] : ['**/visual.spec.ts']),
];

export default defineConfig({
  testDir: './tests',
  /**
   * Two conditional sets. CI's real-bundle job supplies the real sibling bundles via `CEF_BUNDLE`
   * and `PICKER_BUNDLE`; local runs opt in. Files that need CEF throughout are left out without it,
   * and tests tagged in `tests/bundle-tags.ts` are filtered out without their bundle, so neither is
   * scheduled and skipped. The visual baselines need the container that makes them mean
   * anything, and `browser/run-in-container.sh` is what sets `CED_VISUAL` — so a
   * developer running the behaviour suite never meets a pixel failure they have no
   * way to act on.
   */
  testIgnore: ignoredSpecs,
  grepInvert: missingBundles.length ? new RegExp(missingBundles.join('|')) : undefined,
  fullyParallel: true,
  workers: process.env.CEDAR_TEST_WORKERS ? Number(process.env.CEDAR_TEST_WORKERS) : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A retry must not hide an unreliable case.
  maxFailures: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: process.env.CEDAR_TEST_TRACE === 'on' ? 'retain-on-failure' : 'off',
    screenshot: process.env.CI ? 'only-on-failure' : 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(['firefox', 'webkit'] as const).map((browserName) => ({
      name: browserName,
      testIgnore: [...ignoredSpecs, '**/visual.spec.ts'],
      use: { browserName, viewport: { width: 1280, height: 720 } },
    })),
  ],
  webServer: {
    command: 'node serve.mjs',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
