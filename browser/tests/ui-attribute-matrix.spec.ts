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
import { applyPreset, currentTemplate, openDesigner } from './support';
import { expectLaidOut, DESIGNER } from './support-layout';
import {
  accepts,
  allowsDefault,
  allowsMultiple,
  allowsOptions,
  allowsStatus,
  contentKindOf,
} from '../../src/app/core/model/cedar-template';
import { FIELD_TYPES } from '../../src/app/core/models/types';

const WIDTHS = [1280, 375] as const;

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
  settings(page)
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: heading }) });

const CONTROLS: readonly Control[] = [
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
    find: (page) => card(page).getByRole('button', { name: /Add option/ }),
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
    find: (page) => disclosure(page, 'Media'),
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
    find: (page) => disclosure(page, 'Field metadata'),
    expected: () => true,
  },
  {
    name: 'field identity',
    find: (page) => disclosure(page, 'Field identity'),
    expected: () => true,
  },
];

/** A designer holding exactly one card, of the named type. */
async function oneCardOf(page: Page, paletteType: string): Promise<void> {
  await openDesigner(page);
  await applyPreset(page, 'modular');
  const designer = page.locator(DESIGNER);
  const cards = designer.locator('[id^=field-card-]');
  for (let remaining = await cards.count(); remaining > 0; remaining--) {
    await designer.locator('[id^=field-card-]').first().getByTitle('Delete field').first().click();
  }
  await expect.poll(async () => cards.count(), { timeout: 10_000 }).toBe(0);
  await designer
    .getByRole('button', { name: /Add Field/ })
    .first()
    .click();
  await designer.getByRole('button', { name: LABEL_OF[paletteType], exact: true }).click();
  await expect.poll(async () => cards.count(), { timeout: 10_000 }).toBe(1);
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

          // Open every panel: the state an author spends the longest in, and the one
          // where a control that does not fit has room to prove it.
          await page.evaluate(() => {
            const root = document.querySelector('cedar-embeddable-designer')!.shadowRoot!;
            for (const details of root.querySelectorAll('details')) (details as HTMLDetailsElement).open = true;
          });
          await page.waitForTimeout(150);
          await expectLaidOut(page, `${paletteType} expanded`);
        });
      }
    });
  });
}

/**
 * Setting a value and taking it away again, through the controls an author uses.
 *
 * One representative type per control rather than the whole cross: the inventory pass
 * above already covers every type, and what is being tested here is the control's own
 * behaviour, which does not differ between two types that both have it.
 */
interface Lifecycle {
  readonly control: string;
  readonly paletteType: string;
  readonly set: (page: Page) => Promise<void>;
  readonly unset: (page: Page) => Promise<void>;
  readonly read: (template: Record<string, unknown>) => unknown;
  readonly whenSet: unknown;
  readonly whenUnset: unknown;
}

const property = (template: Record<string, unknown>, key: string): Record<string, unknown> => {
  const properties = template['properties'] as Record<string, Record<string, unknown>>;
  const found = properties[key];
  return (found?.['items'] as Record<string, unknown>) ?? found ?? {};
};

const applyIn = async (page: Page, heading: string) =>
  disclosure(page, heading).getByRole('button', { name: 'Apply', exact: true }).click();

const LIFECYCLES: readonly Lifecycle[] = [
  {
    control: 'help text',
    paletteType: 'text',
    set: async (page) => card(page).getByPlaceholder('Add helper instructions for users...').fill('Some help'),
    unset: async (page) => card(page).getByPlaceholder('Add helper instructions for users...').fill(''),
    read: (template) => property(template, 'Text')['schema:description'],
    whenSet: 'Some help',
    // Cleared means absent, not empty: the writer passes null rather than inventing a
    // description, which is what keeps an empty help box out of the artifact.
    whenUnset: null,
  },
  {
    control: 'display label',
    paletteType: 'text',
    set: async (page) => {
      await disclosure(page, 'Display').locator('summary').click();
      await disclosure(page, 'Display').getByLabel('Display label', { exact: true }).fill('Shown');
      await applyIn(page, 'Display');
    },
    unset: async (page) => {
      await disclosure(page, 'Display').getByLabel('Display label', { exact: true }).fill('');
      await applyIn(page, 'Display');
    },
    read: (template) => (template['_ui'] as { propertyLabels?: Record<string, string> }).propertyLabels?.['Text'],
    whenSet: 'Shown',
    whenUnset: undefined,
  },
  {
    control: 'minimum length',
    paletteType: 'text',
    set: async (page) => {
      await disclosure(page, 'Text constraints').locator('summary').click();
      await disclosure(page, 'Text constraints').getByLabel('Minimum length', { exact: true }).fill('4');
      await applyIn(page, 'Text constraints');
    },
    unset: async (page) => {
      await disclosure(page, 'Text constraints').getByLabel('Minimum length', { exact: true }).fill('');
      await applyIn(page, 'Text constraints');
    },
    read: (template) => (property(template, 'Text')['_valueConstraints'] as Record<string, unknown>)?.['minLength'],
    whenSet: 4,
    whenUnset: undefined,
  },
  {
    control: 'numeric maximum',
    paletteType: 'number',
    set: async (page) => {
      await disclosure(page, 'Numeric constraints').locator('summary').click();
      await disclosure(page, 'Numeric constraints').getByLabel('Maximum value', { exact: true }).fill('99');
      await applyIn(page, 'Numeric constraints');
    },
    unset: async (page) => {
      await disclosure(page, 'Numeric constraints').getByLabel('Maximum value', { exact: true }).fill('');
      await applyIn(page, 'Numeric constraints');
    },
    read: (template) => (property(template, 'Number')['_valueConstraints'] as Record<string, unknown>)?.['maxValue'],
    whenSet: 99,
    whenUnset: undefined,
  },
  {
    control: 'preferred label',
    paletteType: 'text',
    set: async (page) => {
      await disclosure(page, 'Field metadata').locator('summary').click();
      await disclosure(page, 'Field metadata').getByLabel('Preferred label', { exact: true }).fill('Preferred');
      await applyIn(page, 'Field metadata');
    },
    unset: async (page) => {
      await disclosure(page, 'Field metadata').getByLabel('Preferred label', { exact: true }).fill('');
      await applyIn(page, 'Field metadata');
    },
    read: (template) => property(template, 'Text')['skos:prefLabel'],
    whenSet: 'Preferred',
    whenUnset: undefined,
  },
];

for (const width of WIDTHS) {
  test.describe(`setting and clearing at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    for (const lifecycle of LIFECYCLES) {
      test(`${lifecycle.control} on a ${lifecycle.paletteType} field`, async ({ page }) => {
        await oneCardOf(page, lifecycle.paletteType);

        await lifecycle.set(page);
        await expect
          .poll(async () => lifecycle.read(await currentTemplate(page)), { timeout: 10_000 })
          .toEqual(lifecycle.whenSet);
        await expectLaidOut(page, `${lifecycle.control} set`);

        await lifecycle.unset(page);
        await expect
          .poll(async () => lifecycle.read(await currentTemplate(page)), { timeout: 10_000 })
          .toEqual(lifecycle.whenUnset);
        await expectLaidOut(page, `${lifecycle.control} cleared`);
      });
    }
  });
}
