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
import { applyPreset, clickCentred, currentTemplate, openDesigner } from './support';
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

const open = (page: Page, heading: string) => disclosure(page, heading).locator('summary').click();
const apply = (page: Page, heading: string) =>
  disclosure(page, heading).getByRole('button', { name: 'Apply', exact: true }).click();

/** Fill a field in one disclosure and apply it, which is how most settings are saved. */
const fillAndApply = (page: Page, heading: string, label: string, value: string) => async () => {
  await disclosure(page, heading).getByLabel(label, { exact: true }).fill(value);
  await apply(page, heading);
};

const setIn = async (page: Page, heading: string, label: string, value: string) => {
  await disclosure(page, heading).getByLabel(label, { exact: true }).fill(value);
  await apply(page, heading);
};

const chooseIn = async (page: Page, heading: string, label: string, value: string) => {
  await disclosure(page, heading).getByLabel(label, { exact: true }).selectOption(value);
  await apply(page, heading);
};

const tickIn = async (page: Page, heading: string, label: string, on: boolean) => {
  const box = disclosure(page, heading).getByRole('checkbox', { name: label, exact: true });
  if (on) await box.check();
  else await box.uncheck();
  await apply(page, heading);
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
    set: async (page) => card(page).getByLabel('Help Text', { exact: true }).fill('Some help'),
    restore: async (page) => card(page).getByLabel('Help Text', { exact: true }).fill(''),
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
      await clickCentred(card(page).getByRole('button', { name: /Add option/ }));
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
      await apply(page, 'Temporal settings');
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

  // ── Field metadata ──────────────────────────────────────────────────────────
  {
    control: 'property name',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => setIn(page, 'Field metadata', 'Property name', 'renamed_key'),
    restore: async (page) => setIn(page, 'Field metadata', 'Property name', 'Text'),
  },
  {
    control: 'schema title',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => setIn(page, 'Field metadata', 'Schema title', 'A title'),
    restore: async (page) => setIn(page, 'Field metadata', 'Schema title', 'Text field schema'),
  },
  {
    control: 'schema description',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => setIn(page, 'Field metadata', 'Schema description', 'A description'),
    restore: async (page) =>
      setIn(page, 'Field metadata', 'Schema description', 'Text field schema generated by the CEDAR Artifact Library'),
  },
  {
    control: 'preferred label',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => setIn(page, 'Field metadata', 'Preferred label', 'Preferred'),
    restore: async (page) => setIn(page, 'Field metadata', 'Preferred label', ''),
    read: (template) => property(template, 'Text')['skos:prefLabel'],
    whenSet: 'Preferred',
  },
  {
    control: 'identifier',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => setIn(page, 'Field metadata', 'Identifier', 'ID-42'),
    restore: async (page) => setIn(page, 'Field metadata', 'Identifier', ''),
  },
  {
    control: 'language',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => setIn(page, 'Field metadata', 'Language', 'fr'),
    restore: async (page) => setIn(page, 'Field metadata', 'Language', ''),
  },
  {
    control: 'alternate labels',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => setIn(page, 'Field metadata', 'Alternate labels', 'Alternate\nAutre'),
    restore: async (page) => setIn(page, 'Field metadata', 'Alternate labels', ''),
  },
  {
    control: 'an annotation',
    paletteType: 'text',
    prepare: (page) => open(page, 'Field metadata'),
    set: async (page) => {
      await disclosure(page, 'Field metadata').getByRole('button', { name: 'Add annotation' }).click();
      await disclosure(page, 'Field metadata').getByLabel('Annotation name', { exact: true }).fill('note');
      await disclosure(page, 'Field metadata').getByLabel('Annotation value', { exact: true }).fill('A note');
      await apply(page, 'Field metadata');
    },
    restore: async (page) => {
      await disclosure(page, 'Field metadata').getByRole('button', { name: 'Remove annotation' }).click();
      await apply(page, 'Field metadata');
    },
  },
];

for (const width of WIDTHS) {
  test.describe(`setting and restoring at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    for (const lifecycle of LIFECYCLES) {
      test(`${lifecycle.control} on a ${lifecycle.paletteType} field`, async ({ page }) => {
        await oneCardOf(page, lifecycle.paletteType);
        await lifecycle.prepare?.(page);

        const before = await currentTemplate(page);

        await lifecycle.set(page);
        await expect
          .poll(async () => JSON.stringify(await currentTemplate(page)) !== JSON.stringify(before), { timeout: 10_000 })
          .toBe(true);
        if (lifecycle.read) {
          expect(
            lifecycle.read(await currentTemplate(page)),
            `${lifecycle.control} did not reach the template`,
          ).toEqual(lifecycle.whenSet);
        }
        await expectLaidOut(page, `${lifecycle.control} set`);

        await lifecycle.restore(page);
        await expect.poll(async () => await currentTemplate(page), { timeout: 10_000 }).toEqual(before);
        await expectLaidOut(page, `${lifecycle.control} restored`);
      });
    }
  });
}
