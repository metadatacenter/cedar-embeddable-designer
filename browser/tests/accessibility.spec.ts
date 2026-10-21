import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { Locator, Page, expect, test } from '@playwright/test';
import { FIELD_TYPES } from '../../src/app/core/models/types';
import {
  DESIGNER,
  addElementFixture,
  applyPreset,
  clickCentred,
  nestFixtureFields,
  openDesigner,
  openPreview,
  openSettings,
} from './support';

/**
 * Automated WCAG checks over the designer's states.
 *
 * A rule engine decides names, roles, ARIA validity, the contrast it can compute and target
 * sizes. It cannot decide focus order, where focus returns or what a screen reader announces,
 * so those need assertions of their own. The tags are WCAG 2.0, 2.1 and 2.2 at levels A and AA,
 * as in Workspace's, the term picker's and CEE's gates.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * WCAG 2.1's Label in Name, criterion 2.5.3: a control's accessible name contains the text it shows,
 * so that speech input reaches it by its visible label. axe-core's rule for it is experimental, and
 * a tag selection leaves experimental rules out, so it runs by name.
 */
const LABEL_IN_NAME = 'label-content-name-mismatch';

/**
 * axe-core's undecided results for contrast and target size, criteria 1.4.3 and 2.5.8, each
 * settled by measurement.
 *
 * axe leaves a result undecided when it cannot compute it, such as a contrast against a background
 * it cannot see past or the size of a box its content overflows. A result is settled only when its element matches an entry here, and
 * the entry's measurement is taken again on every scan, so a change to the colour, size or spacing
 * it rests on fails the gate instead of passing on an old reading. A result that matches no entry,
 * or whose measurement no longer passes, fails, unless an entry in `EXCEPTIONS` records it.
 */
interface Settled {
  rule: 'color-contrast' | 'target-size';
  /** A selector every element the entry settles matches. */
  target: string;
  /** A selector for what covers part of the element, when the entry settles content partly out of view. */
  coveredBy?: string;
  /** The value measured on 2026-10-20. */
  measured: string;
  /** Why the measured value passes. */
  passes: string;
  /**
   * The measurement each scan takes again. `contrast` is the least ratio of the text's colour to the fills
   * behind it. A target passes on `equivalent`, a control in the same card that does the same and
   * is at least 24 by 24, or on criterion 2.5.8's spacing exception: a 24px circle centred on it
   * meets no other target and no other undersized target's circle.
   */
  check: { contrast: number } | { equivalent?: { target: string; within: string } };
}

const SETTLED: Settled[] = [
  {
    rule: 'color-contrast',
    target: 'select',
    measured: 'text rgba(0, 0, 0, 0.87) on white, 16.1:1',
    passes:
      "The native dropdown's chevron is a background gradient, which axe-core cannot see past. The text " +
      "sits on the control's white fill.",
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '.library-toggle-icon',
    measured: 'rgb(85, 85, 85) on white, 7.5:1',
    passes:
      "The library sidebar's arrow is a symbol, which axe-core does not judge as text. It is drawn in the " +
      'muted text colour on the sidebar, and passes as text would.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '.dialog [role="alert"]',
    measured: 'rgb(180, 35, 24) on white, 6.6:1',
    passes:
      "At every point of a picker dialog's alert, the alert and then the dialog's opaque white surface are " +
      'on top. axe-core reports it partly obscured, which the stacking order does not bear out.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '*',
    coveredBy: '.app-header',
    measured: "the template settings' Footer label, rgb(85, 85, 85) on rgb(244, 246, 246), 6.9:1",
    passes:
      'A control scrolled beneath the sticky header is covered in part, so axe-core cannot tell what is ' +
      'behind it. The part still visible sits on its own fill.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'target-size',
    target: '.template-header-card .settings-toggle',
    measured: 'a template or element settings toggle of 36 by 14; the header beside it, 870 by 103 for a template',
    passes:
      'Under the 24px minimum, but the header beside each toggle opens the same settings, and criterion ' +
      '2.5.8 accepts an equivalent target that meets it.',
    check: { equivalent: { target: '[appheadertoggle]', within: '.template-header-card' } },
  },
];

/**
 * Undecided results that measure as failures, which only a visible change can fix. Each is kept
 * here, named and explained, so that the gate passes until that change is made, and each scan
 * checks that the element is still the size it was measured at.
 */
interface Exception {
  rule: Settled['rule'];
  target: string;
  /** The width and height measured on 2026-10-20. */
  size: [number, number];
  measured: string;
  /** The visible change that would fix it. */
  needs: string;
}

const EXCEPTIONS: Exception[] = [
  {
    rule: 'target-size',
    target: 'app-field-settings .settings-toggle',
    size: [36, 14],
    measured:
      "A field's settings toggle is 36 by 14. With a Constraints or Content panel open, the panel's last " +
      "control, such as Default value, ends within 12px of the toggle's centre, so the spacing exception " +
      'fails. The field header beside it opens the same settings but is 23px tall, so it is no equivalent.',
    needs: 'A toggle at least 24px tall with room below the panel, or a field header at least 24px tall.',
  },
];

/** Each undecided contrast or target-size result that `SETTLED` does not settle, with what was measured. */
async function unsettled(page: Page, results: Result[]): Promise<string[]> {
  const nodes = results
    .filter((result) => result.id === 'color-contrast' || result.id === 'target-size')
    .flatMap((result) =>
      result.nodes.map((node) => ({
        rule: result.id,
        target: node.target,
        why: [...node.any, ...node.all, ...node.none][0]?.message ?? '',
      })),
    );
  return page.evaluate(
    ({ nodes, settled, exceptions }) => {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const parse = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
      const over = ([r, g, b, a = 1]: number[], [br, bg, bb]: number[]) => [
        r * a + br * (1 - a),
        g * a + bg * (1 - a),
        b * a + bb * (1 - a),
      ];
      const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      /** The colour behind `element`: its own and its ancestors' fills, laid over white. */
      const behind = (element: Element): number[] => {
        const fills: number[][] = [];
        for (let node: Element | null = element; node;) {
          const fill = parse(getComputedStyle(node).backgroundColor);
          if ((fill[3] ?? 1) > 0) fills.push(fill);
          if ((fill[3] ?? 1) === 1) break;
          node = node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null;
        }
        return fills.reduceRight((base, fill) => over(fill, base), [255, 255, 255]);
      };
      const everything: Element[] = [];
      const collect = (root: Document | ShadowRoot) => {
        for (const element of root.querySelectorAll('*')) {
          everything.push(element);
          if (element.shadowRoot) collect(element.shadowRoot);
        }
      };
      collect(document);
      const TARGETS =
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), ' +
        'summary, [tabindex]:not([tabindex="-1"]), [appheadertoggle]';
      const resolve = (target: unknown[]): Element | null => {
        const path = (Array.isArray(target[0]) ? target[0] : target) as string[];
        let root: Document | ShadowRoot = document;
        let element: Element | null = null;
        for (const selector of path) {
          element = root.querySelector(selector);
          if (!element) return null;
          root = element.shadowRoot ?? root;
        }
        return element;
      };
      /** Whether something matching `selector` lies over part of `element`. */
      const covered = (element: Element, selector: string) => {
        const box = element.getBoundingClientRect();
        const root = element.getRootNode() as Document | ShadowRoot;
        return [0.1, 0.5, 0.9].some((fx) =>
          [0.1, 0.5, 0.9].some((fy) => {
            const top = root.elementFromPoint(box.x + box.width * fx, box.y + box.height * fy);
            return !!top && !element.contains(top) && !!top.closest(selector);
          }),
        );
      };
      /** Why `element` misses criterion 2.5.8's spacing exception, or null when it meets it. */
      const crowded = (element: Element): string | null => {
        const own = element.getBoundingClientRect();
        const x = own.x + own.width / 2;
        const y = own.y + own.height / 2;
        const near = everything.filter((other) => {
          if (!other.matches(TARGETS) || other.contains(element) || element.contains(other)) return false;
          if (getComputedStyle(other).pointerEvents === 'none') return false;
          if (!other.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
          const r = other.getBoundingClientRect();
          const gap = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
          const centres = Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y);
          return gap < 12 || ((r.width < 24 || r.height < 24) && centres < 24);
        });
        return near.length
          ? `${own.width} by ${own.height}, its spacing circle meeting ` +
              near.map((other) => other.getAttribute('aria-label') ?? other.localName).join(', ')
          : null;
      };
      /** Why `element`, matching `entry`, fails the measurement it was settled on, or null when it passes. */
      const fails = (element: Element, entry: (typeof settled)[number]): string | null => {
        if ('contrast' in entry.check) {
          const fill = behind(element);
          const text = luminance(over(parse(getComputedStyle(element).color), fill));
          const ground = luminance(fill);
          const ratio = (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05);
          return ratio >= entry.check.contrast ? null : `${ratio.toFixed(1)}:1, under ${entry.check.contrast}:1`;
        }
        const equivalent = entry.check.equivalent;
        const box =
          equivalent && element.closest(equivalent.within)?.querySelector(equivalent.target)?.getBoundingClientRect();
        return box && box.width >= 24 && box.height >= 24 ? null : crowded(element);
      };
      return nodes.flatMap(({ rule, target, why }) => {
        const element = resolve(target as unknown[]);
        const where = `${rule}: ${JSON.stringify(target)}`;
        if (!element) return [`${where} is undecided, and its element is gone`];
        const entry = settled.find(
          (entry) =>
            entry.rule === rule &&
            element.matches(entry.target) &&
            (!entry.coveredBy || covered(element, entry.coveredBy)),
        );
        const problem = entry ? fails(element, entry) : `undecided and not settled: ${why}`;
        if (problem === null) return [];
        // A failure an exception records passes while the element keeps the size it was measured at.
        const box = element.getBoundingClientRect();
        const excepted = exceptions.some(
          (exception) =>
            exception.rule === rule &&
            element.matches(exception.target) &&
            box.width === exception.size[0] &&
            box.height === exception.size[1],
        );
        return excepted ? [] : [`${where} ${problem}`];
      });
    },
    { nodes, settled: SETTLED, exceptions: EXCEPTIONS },
  );
}

/**
 * Criterion 2.5.3 for a text box whose placeholder is its only visible text, which is then its
 * visible label. axe-core's rule reads only names a control takes from its content, so it passes
 * such a box whatever its name says. A box with a label of its own shows its placeholder as a
 * hint. A header box's label sits beside it unassociated, because a click on that label toggles
 * the settings.
 */
async function placeholdersOutsideNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const failures: string[] = [];
    const visit = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) visit(element.shadowRoot);
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) continue;
        const placeholder = element.placeholder.trim();
        if (!placeholder || element.value || !element.checkVisibility()) continue;
        if (element.labels?.length || element.hasAttribute('aria-labelledby')) continue;
        if (element.closest('.template-field-group')?.querySelector(':scope > label')) continue;
        const name = element.getAttribute('aria-label') || element.title || placeholder;
        if (!name.toLocaleLowerCase().includes(placeholder.toLocaleLowerCase()))
          failures.push(`placeholder-in-name: "${placeholder}" is named "${name}"`);
      }
    };
    visit(document);
    return failures;
  });
}

/**
 * Check the whole page once its animations finish, so contrast is read at full opacity.
 *
 * A click renders on the next coalesced pass, so the fade it starts does not exist until two
 * frames later. Chromium lists a shadow tree's animations on its root and not on the document.
 */
async function expectAccessible(page: Page, state: string): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const roots: DocumentOrShadowRoot[] = [document];
    for (const element of document.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
    await Promise.all(
      roots
        .flatMap((root) => root.getAnimations())
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    // A smooth scroll is no animation, and content passing under a sticky header leaves axe-core unable
    // to tell what is behind it. The scan waits until nothing has scrolled for two frames.
    const scrollers = roots.flatMap((root) => [...(root as ParentNode).querySelectorAll('*')]);
    const positions = () =>
      [window.scrollY, ...scrollers.map((element) => `${element.scrollTop},${element.scrollLeft}`)].join(';');
    for (let last = '', still = 0, frames = 0; still < 2 && frames < 120; frames++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = positions();
      still = now === last ? still + 1 : 0;
      last = now;
    }
  });
  const { violations: tagged, incomplete } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const { violations: named } = await new AxeBuilder({ page }).withRules([LABEL_IN_NAME]).analyze();
  const violations = [...tagged, ...named];
  // A label on an element whose role takes none is one axe cannot always decide, and a screen
  // reader ignores it either way, so the undecided case fails too.
  const ignoredLabels = incomplete.filter((result) => result.id === 'aria-prohibited-attr');
  const failures = [
    ...[...violations, ...ignoredLabels].flatMap((violation) =>
      violation.nodes.map((node) => `${violation.id}: ${JSON.stringify(node.target)}`),
    ),
    ...(await unsettled(page, incomplete)),
    ...(await placeholdersOutsideNames(page)),
  ];
  expect(failures, state).toEqual([]);
}

/** Put the pointer over `control`, and check that its hover styles apply. */
async function hover(control: Locator): Promise<void> {
  await control.hover();
  expect(await control.evaluate((element) => element.matches(':hover'))).toBe(true);
}

/** Focus `control` as the keyboard does, so that it shows the ring a keyboard author sees. */
async function focusFromKeyboard(page: Page, control: Locator): Promise<void> {
  await control.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
}

/** Open the settings in `scope` and check each of its tabs in turn. */
async function expectTabsAccessible(page: Page, scope: Locator, state: string): Promise<void> {
  const toggle = scope.locator('.settings-toggle').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await clickCentred(toggle);
  const tabs = scope.getByRole('tab');
  // The tabs render on the coalesced pass after the click; listing them sooner finds none.
  await expect(tabs.first()).toBeVisible();
  for (const tab of await tabs.all()) {
    await clickCentred(tab);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectAccessible(page, `${state}, ${(await tab.innerText()).trim()} tab`);
  }
}

test('a fresh template at the default and Basic presets', async ({ page }) => {
  await page.goto('/host.html');
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  await expect(page.locator(DESIGNER).locator('[id^=field-card-]').first()).toBeVisible();
  await expectAccessible(page, 'default preset');
  await applyPreset(page, 'basic');
  await expectAccessible(page, 'Basic preset');
});

test('the template settings, user menu, Preferences and Add field palette', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
  await expectAccessible(page, 'template settings');
  await designer.locator('.user-menu-container button').first().click();
  await expectAccessible(page, 'user menu');
  await designer.getByRole('button', { name: 'Preferences' }).click();
  await expectAccessible(page, 'Preferences');
  await designer.getByRole('button', { name: 'Done' }).click();
  await designer.locator('.user-menu-container button').first().click();
  await designer.getByRole('button', { name: 'Define Presets' }).click();
  await expectAccessible(page, 'Define Presets');
  await designer.getByRole('button', { name: 'Done' }).click();
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await expectAccessible(page, 'Add field palette');
  // A new field's name box is empty, so its placeholder is the only text it shows.
  await designer.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(designer.getByPlaceholder('Enter field name').last()).toHaveValue('');
  await expectAccessible(page, 'a new, unnamed field');
});

/**
 * The sample template's fields. Each gets a test of its own, because every tab of every field in
 * one test outlasted the timeout on the build train's slower runner.
 */
const SAMPLE_FIELDS = 3;

for (let index = 0; index < SAMPLE_FIELDS; index++)
  test(`every settings tab of field ${index + 1} in the template`, async ({ page }) => {
    const designer = await openDesigner(page);
    const cards = designer.locator('[id^=field-card-]');
    await expect(cards).toHaveCount(SAMPLE_FIELDS);
    await expectTabsAccessible(page, cards.nth(index), `field ${index + 1}`);
  });

/** Show the designer in Hungarian. The stub picker brings the property IRI's Choose and Replace buttons, whose Hungarian names must hold their visible words. */
async function openHungarian(page: Page): Promise<Locator> {
  const designer = await openDesigner(page, '?picker=stub');
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { language: string }).language = 'hu';
  });
  await expect(designer.locator('.overview-panel__title')).toHaveText('Áttekintés (3)');
  return designer;
}

test('the Hungarian text on a template', async ({ page }) => {
  await openHungarian(page);
  await expectAccessible(page, 'Hungarian template');
});

for (let index = 0; index < SAMPLE_FIELDS; index++)
  test(`the Hungarian text on every settings tab of field ${index + 1}`, async ({ page }) => {
    const designer = await openHungarian(page);
    const cards = designer.locator('[id^=field-card-]');
    await expect(cards).toHaveCount(SAMPLE_FIELDS);
    await expectTabsAccessible(page, cards.nth(index), `Hungarian field ${index + 1}`);
  });

test('the child picker, a nested element and a collapsed element', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, undefined, () => expectAccessible(page, 'child picker'));
  await nestFixtureFields(page, ['Element']);
  const element = designer
    .locator('.field-drag-container')
    .filter({ has: page.locator(':scope > app-container-editor') })
    .first();
  await expect(element.locator('.field-drag-container').first()).toBeVisible();
  await expectAccessible(page, 'nested element');
  await expectTabsAccessible(page, element.locator('.field-drag-container').first(), 'nested field');
  await element.getByRole('button', { name: 'Collapse Element', exact: true }).click();
  await expectAccessible(page, 'collapsed element');
});

test('host findings in the summary and at the setting they name', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await page.evaluate(() => {
    (
      document.querySelector('cedar-embeddable-designer') as unknown as { validationFindings: object[] }
    ).validationFindings = [
      { location: '/properties/Title/_valueConstraints/regex', message: 'Review this pattern', severity: 'error' },
      { location: '/schema:description', message: 'Explain this study', severity: 'error' },
      { location: '/somewhere/unknown', message: 'Consider this', severity: 'warning' },
    ];
  });
  const summary = designer.locator('.validation-summary');
  await expect(summary).toBeVisible();
  await expectAccessible(page, 'findings summary closed');
  await summary.locator('summary').click();
  await expectAccessible(page, 'findings summary open');
  await summary.getByRole('button', { name: /Review this pattern/ }).click();
  await expect(designer.locator('input[name=regex]')).toBeFocused();
  await expectAccessible(page, 'finding revealed at its setting');
});

test('the preview', async ({ page }) => {
  await openDesigner(page, '?cee=stub');
  await openPreview(page);
  await expect(page.locator('cedar-embeddable-editor')).toHaveCount(1);
  await expectAccessible(page, 'preview');
});

test('a published field and a read-only template', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() => {
    const element = document.querySelector('cedar-embeddable-designer') as unknown as {
      currentTemplate: Record<string, any>;
      template: object;
    };
    const template = structuredClone(element.currentTemplate);
    template['properties'].Title['bibo:status'] = 'bibo:published';
    template['properties'].Title['pav:version'] = '1.2.0';
    template['properties'].Title['pav:createdBy'] = 'https://example.org/users/author';
    element.template = template;
  });
  await expect(designer.locator('.field-drop-item').first().getByRole('status')).toBeVisible();
  await expectAccessible(page, 'published field');
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { readOnly: boolean }).readOnly = true;
  });
  await expectAccessible(page, 'read-only template');
  await expectTabsAccessible(page, designer.locator('[id^=field-card-]').nth(1), 'read-only field');
});

test('a 375px host', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const designer = await openDesigner(page);
  await expectAccessible(page, 'narrow template');
  await expectTabsAccessible(page, designer.locator('[id^=field-card-]').first(), 'narrow field');
});

test('the library sidebar, expanded and collapsed', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(designer.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  await expectAccessible(page, 'sidebar');
  await designer.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(designer.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await expectAccessible(page, 'collapsed sidebar');
});

/**
 * A Controlled Terms field on a fresh template, under the semantic preset, with the stub picker. The
 * dialogs and the settings they change are checked in three tests, each from here, because one
 * test of all of them outlasted the timeout on the build train's slower runner.
 */
async function controlledTermsCard(page: Page) {
  const designer = await openDesigner(page, '?picker=stub');
  await applyPreset(page, 'semantic');
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  const card = designer.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') });
  await card.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Disease');
  return { designer, card };
}

async function addConstraint(
  page: Page,
  { designer, card }: Awaited<ReturnType<typeof controlledTermsCard>>,
  scan: boolean,
) {
  // The settings are still folded on a new field, so they are opened at the tab that holds the button.
  await openSettings(card, 'Constraints');
  await clickCentred(card.getByRole('button', { name: 'Edit controlled-term constraints' }));
  await expect(designer.getByRole('dialog', { name: 'Controlled-term constraints' })).toBeVisible();
  if (scan) await expectAccessible(page, 'constraint dialog');
  await designer.locator('#stub-pick').click();
}

test('a controlled-terms field without constraints', async ({ page }) => {
  const { card } = await controlledTermsCard(page);
  await expectTabsAccessible(page, card, 'controlled terms without constraints');
});

test('the constraint dialog, and the settings a constraint changes', async ({ page }) => {
  const field = await controlledTermsCard(page);
  await addConstraint(page, field, true);
  await expectTabsAccessible(page, field.card, 'controlled terms with a constraint');
});

test('the default-term dialog, and the settings a default changes', async ({ page }) => {
  const field = await controlledTermsCard(page);
  await addConstraint(page, field, false);
  const { designer, card } = field;
  await clickCentred(card.getByRole('tab', { name: 'Constraints', exact: true }));
  await clickCentred(card.getByRole('button', { name: 'Edit default term' }));
  await expect(designer.getByRole('dialog', { name: 'Choose default term' })).toBeVisible();
  await expectAccessible(page, 'default-term dialog');
  await designer.locator('#stub-pick').click();
  await expectTabsAccessible(page, card, 'controlled terms with a default');
});

/** Answer the open picker as the term picker would, with `constraints`. */
const pickConstraints = (page: Page, constraints: object[]) =>
  page
    .locator('cedar-embeddable-term-picker')
    .evaluate(
      (picker, constraints) =>
        picker.dispatchEvent(new CustomEvent('constraintsSelected', { detail: { constraints, actions: [] } })),
      constraints,
    );

test('the property picker, its dialog and its error, and manual entry with its error', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  const card = designer.locator('[id^=field-card-]').first();
  const panel = await openSettings(card, 'Configuration');
  await expectAccessible(page, 'property picker');
  await panel.getByRole('button', { name: 'Replace property IRI', exact: true }).click();
  const dialog = designer.getByRole('dialog', { name: 'Choose property IRI', exact: true });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'property dialog');
  await pickConstraints(page, [{ sourceType: 'ontology', sourceId: 'RO' }]);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expectAccessible(page, 'property dialog error');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
  await expectAccessible(page, 'manual property entry');
  await panel.getByRole('textbox', { name: 'IRI', exact: true }).fill('not an IRI');
  await expect(panel.getByRole('alert')).toBeVisible();
  await expectAccessible(page, 'manual property entry error');
});

test('the types picker, its dialog and its error, and manual entry', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
  const settings = designer.locator('app-container-settings').first();
  await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
  await settings.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
  await settings.getByRole('textbox', { name: 'IRI', exact: true }).fill('https://example.org/Study');
  await settings.getByRole('textbox', { name: 'IRI', exact: true }).press('Enter');
  await expect(settings.getByRole('button', { name: 'Remove type https://example.org/Study' })).toBeVisible();
  await expectAccessible(page, 'types picker');
  await settings.getByRole('button', { name: 'Add types', exact: true }).click();
  const dialog = designer.getByRole('dialog', { name: 'Add types', exact: true });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'types dialog');
  await pickConstraints(page, [{ sourceType: 'ontology', sourceId: 'RO' }]);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expectAccessible(page, 'types dialog error');
  await page.keyboard.press('Escape');
  await settings.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
  await expectAccessible(page, 'manual type entry');
});

/**
 * One control of each kind, hovered and then focused from the keyboard, because a state's colours
 * are what axe-core measures, and hover and focus change them. Each kind gets a test of its own,
 * because all of them in one test came close to the timeout on the build train's slower runner.
 */
const CONTROL_KINDS = ['button', 'icon button', 'text box', 'select', 'tab', 'checkbox'] as const;

/**
 * The control of `kind` to hover and the one to focus. A tab takes focus only when it is selected,
 * so the selected tab is focused and another is hovered.
 */
async function controlOfKind(page: Page, kind: (typeof CONTROL_KINDS)[number]): Promise<[Locator, Locator]> {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').first();
  const panel = await openSettings(card, 'Configuration');
  const controls: Record<(typeof CONTROL_KINDS)[number], [Locator, Locator?]> = {
    button: [designer.getByRole('button', { name: 'Add field', exact: true })],
    'icon button': [card.getByRole('button', { name: 'Delete field', exact: true })],
    'text box': [designer.getByRole('textbox', { name: 'Template name', exact: true })],
    select: [panel.getByRole('combobox', { name: 'Requirement', exact: true })],
    tab: [
      card.getByRole('tab', { name: 'Presentation', exact: true }),
      card.getByRole('tab', { name: 'Configuration', exact: true }),
    ],
    checkbox: [panel.getByRole('checkbox', { name: 'Hidden', exact: true })],
  };
  const [hovered, focused = hovered] = controls[kind];
  return [hovered, focused];
}

for (const kind of CONTROL_KINDS)
  test(`${kind === 'icon button' ? 'an' : 'a'} ${kind}, hovered and focused`, async ({ page }) => {
    const [hovered, focused] = await controlOfKind(page, kind);
    await hover(hovered);
    await expectAccessible(page, `hovered ${kind}`);
    await focusFromKeyboard(page, focused);
    await expectAccessible(page, `focused ${kind}`);
  });

test('a menu item, hovered and focused', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  const item = designer.getByRole('button', { name: 'Preferences', exact: true });
  await hover(item);
  await expectAccessible(page, 'hovered menu item');
  await focusFromKeyboard(page, item);
  await expectAccessible(page, 'focused menu item');
});

for (const type of Object.keys(FIELD_TYPES))
  test(`the standalone ${type} designer and each of its settings tabs`, async ({ page }) => {
    await page.goto('/field-host.html');
    await page.waitForFunction(
      () =>
        typeof (document.getElementById('field') as unknown as { newArtifact?: unknown })?.newArtifact === 'function',
    );
    await page.evaluate(
      (type) => (document.getElementById('field') as unknown as { newArtifact(type: string): void }).newArtifact(type),
      type,
    );
    const field = page.locator('#field');
    await field.getByRole('textbox', { name: 'Enter field name', exact: true }).fill(`Study ${type}`);
    await expectAccessible(page, `${type} settings closed`);
    await expectTabsAccessible(page, field, type);
  });
