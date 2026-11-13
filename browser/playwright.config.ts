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

// Functional browser contracts share the existing worker budget; pixel baselines keep their own projects.
const functionalSpecs = [
  'editing.spec.ts',
  'embedding.spec.ts',
  'multiple-stability.spec.ts',
  'state-reconciliation.spec.ts',
  'instance-isolation.spec.ts',
  'read-only.spec.ts',
  'settings-validation.spec.ts',
  'numeric-validation.spec.ts',
  'overview-reorder.spec.ts',
  'cef-parity.spec.ts',
  'import-preservation.spec.ts',
  'version-upgrade-journeys.spec.ts',
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
  testIgnore: [
    ...(process.env.CEF_BUNDLE
      ? []
      : ['**/cef-defaults.spec.ts', '**/cef-parity.spec.ts', '**/style-comparison.spec.ts']),
    ...(process.env.CED_VISUAL ? [] : ['**/visual.spec.ts']),
  ],
  grepInvert: missingBundles.length ? new RegExp(missingBundles.join('|')) : undefined,
  fullyParallel: true,
  workers: process.env.CEDAR_TEST_WORKERS ? Number(process.env.CEDAR_TEST_WORKERS) : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Stop after a test exhausts its retry; a known-red train must not run the remaining suite.
  maxFailures: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    ...(['firefox', 'webkit'] as const).map((browserName) => ({
      name: `${browserName}-functional`,
      testMatch: functionalSpecs,
      use: { browserName },
    })),
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(['firefox', 'webkit'] as const).map((browserName) => ({
      name: `${browserName}-accessibility`,
      testMatch:
        /(?:accessibility|layout-resilience|keyboard-order|focus-return|focus-rings|announcements|error-announcements)\.spec\.ts/,
      use: { browserName, viewport: { width: 1280, height: 720 } },
    })),
    ...(process.env.CED_WEBKIT
      ? [
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            testMatch: /(?:header-toggle|overview-resize|card-navigation|text-default|field-designer)\.spec\.ts/,
          },
        ]
      : []),
  ],
  webServer: {
    command: 'node serve.mjs',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
