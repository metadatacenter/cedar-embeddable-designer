/**
 * Every attribute of every field type, in the interface rather than in the model.
 *
 * The model matrices under `src/app/core/model/` prove a parameter survives being
 * written and read. They say nothing about whether an author can reach it, whether
 * the control appears on the types that accept it and stays away from the types that
 * do not, or whether setting it pushes half the card out of view. That is this file.
 *
 * Two axes, and they fail differently.
 *
 * The inventory axis asks which controls a card offers, for all twenty-six types,
 * against what the descriptor says the type accepts. A control offered where the
 * artifact cannot carry the value writes nothing and tells the author nothing; a
 * control missing where it could be carried is a parameter CEDAR supports and the
 * designer hides. Both are silent, and neither is visible from inside one type.
 *
 * The lifecycle axis drives each control: set it, confirm the value reached the
 * template the host is handed, clear it, confirm it left. Layout is audited after
 * every mutation, because a control that works and wrecks the card is not working.
 *
 * Everything is checked at 1280 and again at 375. The narrow pass is not decoration:
 * it found three real defects the wide pass could not see — a settings label that
 * would not shrink, a header row that would not wrap, and a template header that did
 * neither, which together scrolled the whole page sideways and put the right-hand
 * edge of every card out of reach.
 */
import { expect, test, type Page } from '@playwright/test';
import { openSettings, applyPreset, clickCentred, currentTemplate, openDesigner } from './support';
import { expectLaidOut, DESIGNER } from './support-layout';
import {
  accepts,
  allowsDefault,
  allowsMultiple,
  allowsOptions,
  allowsStatus,
  contentKindOf,
  descriptorOf,
} from '../../src/app/core/model/cedar-template';
import { FIELD_TYPES } from '../../src/app/core/models/types';

const WIDTHS = [1280, 375] as const;

/**
 * How long a template change is waited for.
 *
 * Generous on purpose. The heaviest rows switch a field to several values, which
 * rewrites its property into an array, and they run last in a suite of a hundred and
 * thirty — where a container is measurably slower than it was at the start. A budget
 * tight enough to catch a hang is not the point here: nothing hangs, and a row that
 * genuinely cannot save still fails at any budget.
 */
const SETTLE = 25_000;

/** Palette label to the descriptor's key, which is how a card is found by type. */
const LABEL_OF: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_TYPES).map(([key, value]) => [key, value.label]),
);

/**
 * A control a card may offer, how to find it, and which types should have it.
 *
 * `expected` asks the descriptor rather than listing type names, so the inventory is
 * derived from the same table the writer consults. A disagreement is therefore a
 * disagreement between the interface and the model, which is the only kind worth
 * reporting.
 */
interface Control {
  readonly name: string;
  readonly find: (page: Page) => ReturnType<Page['locator']>;
  readonly expected: (paletteType: string) => boolean;
}

const card = (page: Page) => page.locator(DESIGNER).locator('[id^=field-card-]').first();
const settings = (page: Page) => card(page).locator('app-field-settings');
const disclosure = (page: Page, heading: string) =>
  settings(page).getByRole('tabpanel', { name: heading, exact: true, includeHidden: true });

const CONTROLS: readonly Control[] = [
  {
    name: 'property IRI',
    find: (page) => card(page).getByLabel('Property IRI', { exact: true }),
    expected: () => false,
  },
  {
    name: 'requirement',
    find: (page) => card(page).getByLabel('Requirement', { exact: true }),
    expected: allowsStatus,
  },
  {
    name: 'allow multiple',
    find: (page) => card(page).getByRole('checkbox', { name: 'Allow multiple', exact: true }),
    expected: allowsMultiple,
  },
  {
    name: 'options list',
    find: (page) => card(page).getByRole('button', { name: /Add option/, includeHidden: true }),
    expected: allowsOptions,
  },
  {
    name: 'default value',
    find: (page) => card(page).locator('app-field-default-value'),
    expected: allowsDefault,
  },
  {
    name: 'controlled-term panel',
    find: (page) => card(page).locator('app-controlled-term-config'),
    expected: (type) => accepts(type, 'controlledTermConstraints'),
  },
  {
    name: 'text constraints',
    find: (page) => disclosure(page, 'Text constraints'),
    expected: (type) => accepts(type, 'textLength'),
  },
  {
    name: 'numeric constraints',
    find: (page) => disclosure(page, 'Numeric constraints'),
    expected: (type) => accepts(type, 'numericBounds'),
  },
  {
    name: 'temporal settings',
    find: (page) => disclosure(page, 'Temporal settings'),
    expected: (type) => accepts(type, 'temporalPrecision'),
  },
  {
    name: 'media dimensions',
    find: (page) => disclosure(page, 'Media size'),
    expected: (type) => accepts(type, 'mediaDimensions'),
  },
  {
    name: 'static content',
    find: (page) => card(page).getByLabel(/Content|Image URL|YouTube video ID/),
    expected: (type) => contentKindOf(type) !== undefined,
  },
  {
    name: 'display settings',
    find: (page) => disclosure(page, 'Display'),
    expected: () => true,
  },
  {
    name: 'field metadata',
    find: (page) => disclosure(page, 'Field details'),
    expected: () => true,
  },
  {
    name: 'field identity',
    find: (page) => disclosure(page, 'Field metadata'),
    expected: () => true,
  },
];

/**
 * A designer holding exactly one card, of the named type.
 *
 * `query` reaches the host fixture, which is how the term-picker stub is asked for.
 * `bundle` names a sibling script to load before the card exists, since the controls
 * those siblings provide are mounted as the card renders.
 */
async function oneCardOf(
  page: Page,
  paletteType: string,
  options: { query?: string; bundle?: string } = {},
): Promise<void> {
  await openDesigner(page, options.query ?? '');
  if (options.bundle) {
    await page.addScriptTag({ path: options.bundle });
    await page.waitForFunction(() => !!customElements.get('cedar-embeddable-field'));
  }
  await applyPreset(page, 'modular');
  const designer = page.locator(DESIGNER);
  const cards = designer.locator('[id^=field-card-]');
  for (let remaining = await cards.count(); remaining > 0; remaining--) {
    await designer.locator('[id^=field-card-]').first().getByTitle('Delete field').first().click();
  }
  await expect.poll(async () => cards.count(), { timeout: SETTLE }).toBe(0);
  await designer
    .getByRole('button', { name: /Add Field/ })
    .first()
    .click();
  await designer.getByRole('button', { name: LABEL_OF[paletteType], exact: true }).click();
  await expect.poll(async () => cards.count(), { timeout: SETTLE }).toBe(1);
}

const paletteTypes = Object.keys(FIELD_TYPES);

for (const width of WIDTHS) {
  test.describe(`at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test.describe('the controls a card offers', () => {
      for (const paletteType of paletteTypes) {
        test(`match what a ${paletteType} accepts`, async ({ page }) => {
          await oneCardOf(page, paletteType);

          const wrong: string[] = [];
          for (const control of CONTROLS) {
            const present = (await control.find(page).count()) > 0;
            const should = control.expected(paletteType);
            if (present !== should) {
              wrong.push(
                `${control.name}: ${present ? 'offered but the type cannot carry it' : 'missing though the type accepts it'}`,
              );
            }
          }
          expect.soft(wrong, `${paletteType}: the card and the descriptor disagree`).toEqual([]);

          await expectLaidOut(page, `${paletteType} collapsed`);

          await settings(page).getByRole('button', { name: 'Expand field settings' }).click();
          const tabs = settings(page).getByRole('tab');
          for (let index = 0; index < (await tabs.count()); index++) {
            await tabs.nth(index).click();
            await expectLaidOut(page, `${paletteType} ${await tabs.nth(index).textContent()}`);
            const leadingGap = await settings(page).evaluate((el) => {
              const panel = el.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
              const first = [
                ...panel.querySelectorAll<HTMLElement>(
                  'label, dt, app-controlled-term-config, [field-values] input, [field-values] textarea',
                ),
              ]
                .filter((node) => node.getClientRects().length > 0)
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
              return first
                ? first.getBoundingClientRect().top -
                    el.querySelector('[role="tablist"]')!.getBoundingClientRect().bottom
                : 0;
            });
            expect
              .soft(leadingGap, `${paletteType} ${await tabs.nth(index).textContent()} leading gap`)
              .toBeLessThanOrEqual(8);
          }
        });
      }
    });
  });
}

/**
 * Every control, set and then put back.
 *
 * The claim that covers all of them is reversibility: after setting a control and
 * returning it to where it started, the template the host receives must equal the one
 * it received before. That is a stronger statement than it sounds, and it is where
 * this kind of bug lives — a cleared control that leaves a key behind, a checkbox that
 * writes `false` where absence was meant, a list that keeps an emptied entry. The
 * artifact looks reasonable and no longer says what the interface shows.
 *
 * Exact keys are deliberately not asserted here. The model matrices under
 * `src/app/core/model/` already own which property a parameter lands in, against the
 * library that defines it; repeating that through the interface would test the same
 * thing twice and go red in two places for one cause. What only this file can see is
 * whether an author can reach the control at all, whether using it reaches the model,
 * and whether undoing it undoes everything. A handful of controls carry an exact read
 * as well, where the key is worth pinning from this side too.
 *
 * "Put it back" is not always "empty it". A field must have a name, so that control's
 * reversal is typing the original name again. Everywhere else the initial state is
 * empty and clearing means clearing.
 */
interface Lifecycle {
  readonly control: string;
  readonly paletteType: string;
  /** Passed to the host fixture, for a row that needs the term-picker stub. */
  readonly query?: string;
  /** An environment variable naming a sibling bundle this row needs. */
  readonly requires?: 'CEF_BUNDLE';
  /** Bring the control into view, or into existence, before touching it. */
  readonly prepare?: (page: Page) => Promise<void>;
  readonly set: (page: Page) => Promise<void>;
  readonly restore: (page: Page) => Promise<void>;
  /** An exact assertion after `set`, where the key is worth pinning here as well. */
  readonly read?: (template: Record<string, unknown>) => unknown;
  readonly whenSet?: unknown;
}

const property = (template: Record<string, unknown>, key: string): Record<string, unknown> => {
  const properties = template['properties'] as Record<string, Record<string, unknown>>;
  const found = properties[key];
  return (found?.['items'] as Record<string, unknown>) ?? found ?? {};
};

const constraints = (template: Record<string, unknown>, key: string): Record<string, unknown> =>
  (property(template, key)['_valueConstraints'] as Record<string, unknown>) ?? {};

const open = async (page: Page, heading: string) => {
  const expand = settings(page).getByRole('button', { name: 'Expand field settings' });
  if (await expand.count()) await expand.click();
  await settings(page).getByRole('tab', { name: heading, exact: true }).click();
};

/** Use real keyboard input when clearing numeric controls, then verify the DOM value. */
const putValue = async (control: ReturnType<Page['locator']>, value: string) => {
  if (value === '') {
    await control.click();
    await control.selectText();
    await control.press('Delete');
  } else {
    await control.fill(value);
  }
  await expect(control).toHaveValue(value);
};

/** Editing a control updates the artifact without a separate submission. */
const fillSetting = (page: Page, heading: string, label: string, value: string) => async () => {
  await disclosure(page, heading).getByLabel(label, { exact: true }).fill(value);
};

const setIn = async (page: Page, heading: string, label: string, value: string) => {
  await putValue(disclosure(page, heading).getByLabel(label, { exact: true }), value);
};

const chooseIn = async (page: Page, heading: string, label: string, value: string) => {
  const control = disclosure(page, heading).getByLabel(label, { exact: true });
  await control.selectOption(value);
  await expect(control).toHaveValue(value);
};

const tickIn = async (page: Page, heading: string, label: string, on: boolean) => {
  const box = disclosure(page, heading).getByRole('checkbox', { name: label, exact: true });
  if (on) await box.check();
  else await box.uncheck();
  await expect(box).toBeChecked({ checked: on });
};

const LIFECYCLES: readonly Lifecycle[] = [
  // ── The card's own header ────────────────────────────────────────────────────
  {
    control: 'field name',
    paletteType: 'text',
    set: async (page) => card(page).getByLabel('Field name', { exact: true }).fill('Renamed'),
    // A field must have a name, so putting this back means the name it began with.
    restore: async (page) => card(page).getByLabel('Field name', { exact: true }).fill('Text'),
  },
  {
    control: 'requirement',
    paletteType: 'text',
    set: async (page) => card(page).getByLabel('Requirement', { exact: true }).selectOption('required'),
    restore: async (page) => card(page).getByLabel('Requirement', { exact: true }).selectOption('optional'),
    read: (template) => constraints(template, 'Text')['requiredValue'],
    whenSet: true,
  },
  {
    control: 'allow multiple',
    paletteType: 'text',
    set: async (page) => card(page).getByRole('checkbox', { name: 'Allow multiple', exact: true }).check(),
    restore: async (page) => card(page).getByRole('checkbox', { name: 'Allow multiple', exact: true }).uncheck(),
  },
  {
    control: 'help text',
    paletteType: 'text',
    set: async (page) => putValue(card(page).getByLabel('Help Text', { exact: true }), 'Some help'),
    restore: async (page) => putValue(card(page).getByLabel('Help Text', { exact: true }), ''),
    read: (template) => property(template, 'Text')['schema:description'],
    whenSet: 'Some help',
  },

  // ── Choice options ──────────────────────────────────────────────────────────
  {
    control: 'an option label',
    paletteType: 'multipleChoice',
    // A fresh choice field has one option whose value is empty: "Option 1" is its
    // placeholder, not its content.
    set: async (page) => card(page).getByLabel('Option 1', { exact: true }).fill('Alpha'),
    restore: async (page) => card(page).getByLabel('Option 1', { exact: true }).fill(''),
  },
  {
    control: 'adding and removing an option',
    paletteType: 'multipleChoice',
    /*
     * Added and then named, because an unnamed option is not written: two empty options
     * serialise exactly as one does, so clicking Add alone changes nothing in the
     * artifact and there would be nothing to reverse.
     *
     * `clickCentred`, because adding scrolls the card in smoothly and the runner and the
     * page disagree about where the button is until it stops moving.
     */
    set: async (page) => {
      await clickCentred(card(page).getByRole('button', { name: /Add option/, includeHidden: true }));
      await card(page).getByLabel('Option 2', { exact: true }).fill('Beta');
    },
    restore: async (page) =>
      clickCentred(card(page).getByRole('button', { name: 'Delete option', exact: true }).last()),
  },

  // ── A static field's one value ──────────────────────────────────────────────
  {
    control: 'rich text content',
    paletteType: 'richText',
    set: async (page) => card(page).getByLabel('Content', { exact: true }).fill('<p>Some markup</p>'),
    restore: async (page) => card(page).getByLabel('Content', { exact: true }).fill(''),
  },
  {
    control: 'an image address',
    paletteType: 'image',
    set: async (page) => card(page).getByLabel('Image URL', { exact: true }).fill('https://example.org/p.png'),
    restore: async (page) => card(page).getByLabel('Image URL', { exact: true }).fill(''),
  },
  {
    control: 'a video id',
    paletteType: 'youtube',
    set: async (page) => card(page).getByLabel('YouTube video ID', { exact: true }).fill('dQw4w9WgXcQ'),
    restore: async (page) => card(page).getByLabel('YouTube video ID', { exact: true }).fill(''),
  },

  // ── Display ─────────────────────────────────────────────────────────────────
  {
    control: 'display label',
    paletteType: 'text',
    prepare: (page) => open(page, 'Display'),
    set: async (page) => setIn(page, 'Display', 'Display label', 'Shown'),
    restore: async (page) => setIn(page, 'Display', 'Display label', ''),
    read: (template) => (template['_ui'] as { propertyLabels?: Record<string, string> }).propertyLabels?.['Text'],
    whenSet: 'Shown',
  },
  {
    control: 'display description',
    paletteType: 'text',
    prepare: (page) => open(page, 'Display'),
    set: async (page) => setIn(page, 'Display', 'Display description', 'Shown help'),
    restore: async (page) => setIn(page, 'Display', 'Display description', ''),
  },
  {
    control: 'hidden',
    paletteType: 'text',
    prepare: (page) => open(page, 'Display'),
    set: async (page) => tickIn(page, 'Display', 'Hidden', true),
    restore: async (page) => tickIn(page, 'Display', 'Hidden', false),
  },
  {
    control: 'continue previous line',
    paletteType: 'text',
    prepare: (page) => open(page, 'Display'),
    set: async (page) => tickIn(page, 'Display', 'Continue previous line', true),
    restore: async (page) => tickIn(page, 'Display', 'Continue previous line', false),
  },

  // ── Text constraints ────────────────────────────────────────────────────────
  {
    control: 'minimum length',
    paletteType: 'text',
    prepare: (page) => open(page, 'Text constraints'),
    set: async (page) => setIn(page, 'Text constraints', 'Minimum length', '4'),
    restore: async (page) => setIn(page, 'Text constraints', 'Minimum length', ''),
    read: (template) => constraints(template, 'Text')['minLength'],
    whenSet: 4,
  },
  {
    control: 'maximum length',
    paletteType: 'text',
    prepare: (page) => open(page, 'Text constraints'),
    set: async (page) => setIn(page, 'Text constraints', 'Maximum length', '40'),
    restore: async (page) => setIn(page, 'Text constraints', 'Maximum length', ''),
  },
  {
    control: 'a regular expression',
    paletteType: 'text',
    prepare: (page) => open(page, 'Text constraints'),
    set: async (page) => setIn(page, 'Text constraints', 'Regular expression', '^[A-Z]+$'),
    restore: async (page) => setIn(page, 'Text constraints', 'Regular expression', ''),
  },

  // ── Numeric constraints ─────────────────────────────────────────────────────
  {
    control: 'numeric datatype',
    paletteType: 'number',
    prepare: (page) => open(page, 'Numeric constraints'),
    set: async (page) => chooseIn(page, 'Numeric constraints', 'Datatype', 'xsd:int'),
    restore: async (page) => chooseIn(page, 'Numeric constraints', 'Datatype', 'xsd:decimal'),
  },
  {
    control: 'minimum value',
    paletteType: 'number',
    prepare: (page) => open(page, 'Numeric constraints'),
    set: async (page) => setIn(page, 'Numeric constraints', 'Minimum value', '1'),
    restore: async (page) => setIn(page, 'Numeric constraints', 'Minimum value', ''),
  },
  {
    control: 'maximum value',
    paletteType: 'number',
    prepare: (page) => open(page, 'Numeric constraints'),
    set: async (page) => setIn(page, 'Numeric constraints', 'Maximum value', '99'),
    restore: async (page) => setIn(page, 'Numeric constraints', 'Maximum value', ''),
    read: (template) => constraints(template, 'Number')['maxValue'],
    whenSet: 99,
  },
  {
    control: 'decimal places',
    paletteType: 'number',
    prepare: (page) => open(page, 'Numeric constraints'),
    set: async (page) => setIn(page, 'Numeric constraints', 'Decimal places', '2'),
    restore: async (page) => setIn(page, 'Numeric constraints', 'Decimal places', ''),
  },
  {
    control: 'unit of measure',
    paletteType: 'number',
    prepare: (page) => open(page, 'Numeric constraints'),
    set: async (page) => setIn(page, 'Numeric constraints', 'Unit of measure', 'mg'),
    restore: async (page) => setIn(page, 'Numeric constraints', 'Unit of measure', ''),
  },

  // ── Temporal settings ───────────────────────────────────────────────────────
  {
    control: 'temporal datatype',
    paletteType: 'date',
    prepare: (page) => open(page, 'Temporal settings'),
    set: async (page) => chooseIn(page, 'Temporal settings', 'Temporal datatype', 'xsd:dateTime'),
    restore: async (page) => chooseIn(page, 'Temporal settings', 'Temporal datatype', 'xsd:date'),
  },
  {
    control: 'precision',
    paletteType: 'date',
    prepare: (page) => open(page, 'Temporal settings'),
    set: async (page) => chooseIn(page, 'Temporal settings', 'Precision', 'month'),
    restore: async (page) => chooseIn(page, 'Temporal settings', 'Precision', 'day'),
  },
  {
    control: 'the timezone control',
    paletteType: 'time',
    prepare: (page) => open(page, 'Temporal settings'),
    set: async (page) => tickIn(page, 'Temporal settings', 'Show timezone', true),
    restore: async (page) => tickIn(page, 'Temporal settings', 'Show timezone', false),
  },
  {
    control: 'time format',
    paletteType: 'time',
    prepare: (page) => open(page, 'Temporal settings'),
    set: async (page) => chooseIn(page, 'Temporal settings', 'Time format', '24h'),
    // "Automatic" is bound with `ngValue` and so carries no plain value; choosing it by
    // the label is both what works and what an author does.
    restore: async (page) => {
      await disclosure(page, 'Temporal settings')
        .getByLabel('Time format', { exact: true })
        .selectOption({ label: 'Automatic' });
    },
  },

  // ── Media size ──────────────────────────────────────────────────────────────
  {
    control: 'width',
    paletteType: 'image',
    prepare: (page) => open(page, 'Media size'),
    set: async (page) => setIn(page, 'Media size', 'Width', '640'),
    restore: async (page) => setIn(page, 'Media size', 'Width', ''),
  },
  {
    control: 'height',
    paletteType: 'image',
    prepare: (page) => open(page, 'Media size'),
    set: async (page) => setIn(page, 'Media size', 'Height', '360'),
    restore: async (page) => setIn(page, 'Media size', 'Height', ''),
  },

  // ── Occurrences, which exist only once several values are allowed ───────────
  {
    control: 'minimum occurrences',
    paletteType: 'text',
    prepare: async (page) => {
      await card(page).getByRole('checkbox', { name: 'Allow multiple', exact: true }).check();
      await open(page, 'Occurrences');
    },
    set: async (page) => setIn(page, 'Occurrences', 'Minimum', '2'),
    restore: async (page) => setIn(page, 'Occurrences', 'Minimum', ''),
  },
  {
    control: 'maximum occurrences',
    paletteType: 'text',
    prepare: async (page) => {
      await card(page).getByRole('checkbox', { name: 'Allow multiple', exact: true }).check();
      await open(page, 'Occurrences');
    },
    set: async (page) => setIn(page, 'Occurrences', 'Maximum', '5'),
    restore: async (page) => setIn(page, 'Occurrences', 'Maximum', ''),
  },

  /*
   * The two controls a sibling component provides, and only CED's half of them.
   *
   * CEF and `<cedar-term-picker>` have thorough suites of their own, and
   * `cef-defaults.spec.ts` already covers what each of twenty types stores and clears
   * through CEF. None of that is repeated here. What no other suite asks is whether the
   * value a sibling emits reaches the template, whether undoing it returns the template
   * exactly rather than merely returning the value, and whether the card still holds its
   * shape with someone else's component inside it — which is the failure this matrix
   * exists to catch, and the annotations table proved it is not hypothetical.
   *
   * So one row each, not a cross. The constraint row uses the host's picker stub, which
   * emits what the real picker emits: the claim is that CED accepts it, and the picker's
   * own behaviour is the picker's business.
   */
  {
    control: 'a default value through CEF',
    paletteType: 'text',
    requires: 'CEF_BUNDLE',
    set: async (page) => card(page).locator('app-field-default-value input').first().fill('Example'),
    restore: async (page) => card(page).locator('app-field-default-value input').first().fill(''),
    read: (template) => constraints(template, 'Text')['defaultValue'],
    whenSet: 'Example',
  },

];

for (const width of WIDTHS) {
  test.describe(`setting and restoring at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    for (const lifecycle of LIFECYCLES) {
      test(`${lifecycle.control} on a ${lifecycle.paletteType} field`, async ({ page }) => {
        const bundle = lifecycle.requires ? process.env[lifecycle.requires] : undefined;
        test.skip(
          lifecycle.requires !== undefined && !bundle,
          `${lifecycle.requires} names the sibling bundle this control comes from.`,
        );
        await oneCardOf(page, lifecycle.paletteType, { query: lifecycle.query, bundle });
        await open(page, 'Values');
        await lifecycle.prepare?.(page);

        /*
         * Wait for the template to stop moving before snapshotting it.
         *
         * Most rows only open a disclosure to prepare, which changes nothing. The
         * occurrence rows have to switch the field to several values first, and
         * `templateChange` is published a tick after the click — so a baseline taken
         * straight afterwards could be the template from before that change, and the
         * comparison at the end would then be against a state the field never returns
         * to. Two equal reads in a row is enough: the only writer is the click that has
         * already happened.
         */
        let before = await currentTemplate(page);
        await expect
          .poll(
            async () => {
              const again = await currentTemplate(page);
              const settled = JSON.stringify(again) === JSON.stringify(before);
              before = again;
              return settled;
            },
            { timeout: SETTLE },
          )
          .toBe(true);

        await lifecycle.set(page);
        await expect
          .poll(async () => JSON.stringify(await currentTemplate(page)) !== JSON.stringify(before), { timeout: SETTLE })
          .toBe(true);
        if (lifecycle.read) {
          expect(
            lifecycle.read(await currentTemplate(page)),
            `${lifecycle.control} did not reach the template`,
          ).toEqual(lifecycle.whenSet);
        }
        await expectLaidOut(page, `${lifecycle.control} set`);

        await lifecycle.restore(page);
        await expect.poll(async () => await currentTemplate(page), { timeout: SETTLE }).toEqual(before);
        await expectLaidOut(page, `${lifecycle.control} restored`);
      });
    }
  });
}

/**
 * The controls a sibling component provides, from CED's side of the boundary only.
 *
 * CEF and `<cedar-term-picker>` are separately and thoroughly tested, and
 * `cef-defaults.spec.ts` already covers what twenty types store and clear through CEF
 * while `constraints.spec.ts` drives the real picker through choosing and removing
 * constraints. None of that belongs here twice.
 *
 * Two things do, because no other suite asks them. Whether what a sibling emits reaches
 * the template — the contract CED is on the hook for. And whether a card still holds
 * its shape with someone else's component inside it, which is the failure this matrix
 * exists to catch and which the annotations table showed is not hypothetical.
 *
 * The constraint case is not a set-and-restore row for a reason worth stating: removing
 * a constraint is a control the picker owns, so reversing one is not CED's half of
 * anything. Setting is.
 */
test.describe('what a sibling component contributes', () => {
  for (const width of WIDTHS) {
    test(`a constraint the picker emits reaches the template at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      // The host's stub emits what the real picker emits; accepting it is the claim.
      await oneCardOf(page, 'controlledTerms', { query: '?picker=stub' });
      await open(page, 'Values');
      const panel = card(page).locator('app-controlled-term-config');
      const before = await currentTemplate(page);

      await clickCentred(panel.getByRole('button', { name: /Edit controlled-term constraints/ }));
      await page.locator('#stub-pick').click();

      await expect
        .poll(async () => JSON.stringify(await currentTemplate(page)) !== JSON.stringify(before), { timeout: SETTLE })
        .toBe(true);
      await expectLaidOut(page, `a constraint at ${width}`);
    });

    test(`the picker overlay keeps the keyboard at ${width}`, async ({ page }) => {
      test.skip(!process.env.PICKER_BUNDLE, 'PICKER_BUNDLE names the picker whose controls are trapped.');
      await page.setViewportSize({ width, height: 900 });
      await openDesigner(page);
      await page.addScriptTag({ path: process.env.PICKER_BUNDLE! });
      await page.waitForFunction(() => !!customElements.get('cedar-term-picker'));
      await applyPreset(page, 'modular');
      const designer = page.locator(DESIGNER);
      await designer
        .getByRole('button', { name: /Add Field/ })
        .first()
        .click();
      await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
      await expect(designer.locator('app-controlled-term-config')).toBeAttached();
      await openSettings(
        designer.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') }),
      );
      const panel = designer.locator('[id^=field-card-]').last().locator('app-controlled-term-config');
      await clickCentred(panel.getByRole('button', { name: /Edit controlled-term constraints/ }));
      await expect(designer.locator('[role=dialog]')).toBeVisible();

      /*
       * Where focus really is, which `document.activeElement` cannot say: it stops at a
       * shadow host, and every control worth tabbing to is inside the picker's own root.
       */
      const outside = () =>
        page.evaluate(() => {
          let element: Element | null = document.activeElement;
          while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
          const root = document.querySelector('cedar-embeddable-designer')!.shadowRoot!;
          const dialog = root.querySelector('[role=dialog]');
          if (!dialog || !element) return true;
          if (dialog === element || dialog.contains(element)) return false;
          return ![...dialog.querySelectorAll('*')].some((node) =>
            (node as HTMLElement).shadowRoot?.contains(element!),
          );
        });

      // Focus is moved in when the overlay opens, rather than left on the card behind it.
      expect(await outside(), 'focus stayed outside the overlay when it opened').toBe(false);

      const escapes: string[] = [];
      for (const key of ['Tab', 'Shift+Tab']) {
        for (let press = 0; press < 30; press++) {
          await page.keyboard.press(key);
          if (await outside()) escapes.push(`${key} #${press + 1}`);
        }
      }
      expect(escapes, 'the keyboard left an overlay that covers the card behind it').toEqual([]);

      // Escape closes it and gives focus back, rather than dropping the author at the top.
      await page.keyboard.press('Escape');
      await expect(designer.locator('[role=dialog]')).toHaveCount(0);
      await expect(panel.getByRole('button', { name: /Edit controlled-term constraints/ })).toBeFocused();
    });

    test(`the card holds its shape with CEF inside it at ${width}`, async ({ page }) => {
      test.skip(!process.env.CEF_BUNDLE, 'CEF_BUNDLE names the bundle that provides the control.');
      await page.setViewportSize({ width, height: 900 });
      await oneCardOf(page, 'text', { bundle: process.env.CEF_BUNDLE });

      await open(page, 'Values');
      // The real control, not the panel's "unavailable" placeholder.
      await expect(card(page).locator('app-field-default-value input').first()).toBeVisible();
      await expectLaidOut(page, `CEF mounted at ${width}`);

      await page.evaluate(() => {
        const root = document.querySelector('cedar-embeddable-designer')!.shadowRoot!;
        for (const details of root.querySelectorAll('details')) (details as HTMLDetailsElement).open = true;
      });
      await page.waitForTimeout(150);
      await expectLaidOut(page, `CEF mounted, every panel open, at ${width}`);
    });
  }
});
