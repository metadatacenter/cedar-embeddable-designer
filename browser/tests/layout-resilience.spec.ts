import { Page, expect, test } from '@playwright/test';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';
import { VIEWPORTS, check, type Check, type Exception } from './layout-resilience.generated.mjs';
import {
  DESIGNER,
  addElementFixture,
  applyPreset,
  clickCentred,
  nestFixtureFields,
  openDesigner,
  openSettings,
} from './support';

/**
 * Whether the designer's content survives a narrow host, a zoomed window and wider text, and whether
 * its placeholders, field boundaries, icons, focus indicators and selection marks can be seen.
 *
 * The checks are the shared ones the token package generates into `layout-resilience.generated.mjs`,
 * which say what WCAG asks and how each is measured. This spec reaches each of the designer's states
 * from a fresh page and records what the designer excuses. A finding fails the test unless it is
 * recorded below with the visible change it needs, and a recorded finding that no longer occurs fails
 * too, so the record cannot outlive what it describes.
 */

/** Containers that hold a data table and may scroll it both ways, which criterion 1.4.10 allows. */
const TABLE_SCROLLERS: readonly { readonly target: string; readonly holds: string }[] = [
  {
    target: 'app-child-picker .table-scroll',
    holds: "The child picker's Selected items and Search results: each row's type, name, date, version and actions.",
  },
  {
    target: 'app-annotations-editor .table-scroll',
    holds: "A field's annotations: each row's name, value type, value and Remove button.",
  },
  {
    target: 'app-preset-definitions-modal .preset-table-scroll',
    holds: "Each Define Presets table: each row's setting or field type and its checkbox in each preset.",
  },
];

/** Layout, placeholder and boundary findings that wait on a visible change. None waits now. */
const EXCEPTIONS: readonly Exclude<Exception, { check: 'indicators' }>[] = [];

/** Icons, focus indicators and selection marks that wait on a visible change. None waits now. */
const INDICATOR_EXCEPTIONS: readonly Extract<Exception, { check: 'indicators' }>[] = [];

interface State {
  /** The surface whose icons, focus indicators and selection marks are measured. */
  readonly surface?: string;
  /**
   * Open overlays that carry no dialog or menu role, whose cover hides the controls beneath until
   * they close: a menu of plain buttons, the backdrop of a dialog that is not a modal `<dialog>`,
   * and the Overview where it lies over the canvas.
   */
  readonly overlays?: readonly string[];
  readonly reach: (page: Page) => Promise<void>;
}

/** How to reach each state the checks run in, from a host already sized for the check. */
const STATES: Readonly<Record<string, State>> = {
  'fresh template': {
    reach: async (page) => {
      await openDesigner(page);
    },
  },
  // A selected field, its settings open on each tab in turn.
  ...Object.fromEntries(
    ['Configuration', 'Presentation', 'Constraints', 'Annotations', 'Metadata'].map((tab) => [
      `field selected, ${tab} tab`,
      {
        reach: async (page: Page) => {
          const designer = await openDesigner(page);
          const card = designer.locator('[id^=field-card-]').first();
          await card.getByRole('textbox', { name: 'Enter field name' }).focus();
          await openSettings(card, tab);
        },
      },
    ]),
  ),
  // A column beside the canvas on a wide host, and over the canvas on a narrow one.
  'Overview open': {
    surface: '.overview-panel',
    overlays: ['.overview-panel--overlay'],
    reach: async (page) => {
      const designer = await openDesigner(page);
      const open = designer.getByRole('button', { name: 'Open Overview', exact: true });
      if (await open.count()) await open.click();
      await expect(designer.locator('.overview-panel')).toBeVisible();
    },
  },
  'template settings, Metadata tab': {
    reach: async (page) => {
      const designer = await openDesigner(page, '?picker=stub');
      await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
      const settings = designer.locator('app-container-settings').first();
      await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
      await expect(settings.getByRole('button', { name: 'Add types', exact: true })).toBeVisible();
    },
  },
  'nested element': {
    reach: async (page) => {
      const designer = await openDesigner(page);
      await applyPreset(page, 'modular');
      await addElementFixture(page);
      await nestFixtureFields(page, ['Element']);
      await expect(
        designer.locator('app-container-editor app-container-editor [id^=field-card-]').first(),
      ).toBeVisible();
    },
  },
  'user menu': {
    surface: '.user-menu-container',
    overlays: ['.user-menu-dropdown'],
    reach: async (page) => {
      const designer = await openDesigner(page);
      await designer.getByRole('button', { name: 'User Menu' }).click();
      await expect(designer.getByRole('button', { name: 'Preferences', exact: true })).toBeVisible();
    },
  },
  Preferences: {
    surface: '[role="dialog"]',
    reach: async (page) => {
      const designer = await openDesigner(page);
      await designer.getByRole('button', { name: 'User Menu' }).click();
      await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
    },
  },
  'Define Presets': {
    surface: '[role="dialog"]',
    reach: async (page) => {
      const designer = await openDesigner(page);
      await designer.getByRole('button', { name: 'User Menu' }).click();
      await designer.getByRole('button', { name: 'Define Presets', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Define Presets' })).toBeVisible();
    },
  },
  'child picker': {
    surface: 'dialog',
    reach: async (page) => {
      const designer = await openDesigner(page);
      await applyPreset(page, 'modular');
      await page.evaluate(() => {
        const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
        const names = ['Title', 'Principal Investigator Contact Information and Institutional Affiliation', 'Section'];
        element.childSource = {
          async search() {
            return {
              results: names.map((name, index) => ({
                id: `https://repo.metadatacenter.org/template-fields/${index}`,
                name,
                type: index === 2 ? ('element' as const) : ('field' as const),
                version: '0.0.1',
                status: 'bibo:draft',
                modifiedOn: '2026-09-29T12:00:00Z',
              })),
            };
          },
          async load() {
            return {};
          },
        };
      });
      await designer.getByRole('button', { name: 'Import fields and elements', exact: true }).first().click();
      const dialog = designer.getByRole('dialog', { name: 'Import Fields and Elements' });
      await dialog.getByRole('button', { name: 'Search', exact: true }).click();
      await dialog.getByRole('row', { name: 'Select Title', exact: true }).click();
      await expect(dialog.getByRole('table', { name: 'Selected items' }).getByRole('row')).toHaveCount(2);
    },
  },
  'property dialog': {
    surface: '[role="dialog"]',
    overlays: ['app-property-picker .overlay'],
    reach: async (page) => {
      const designer = await openDesigner(page, '?picker=stub');
      const panel = await openSettings(designer.locator('[id^=field-card-]').first(), 'Configuration');
      await panel.getByRole('button', { name: 'Replace property IRI', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Choose property IRI', exact: true })).toBeVisible();
    },
  },
  'types dialog': {
    surface: '[role="dialog"]',
    overlays: ['app-types-picker .overlay'],
    reach: async (page) => {
      const designer = await openDesigner(page, '?picker=stub');
      await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
      const settings = designer.locator('app-container-settings').first();
      await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
      await settings.getByRole('button', { name: 'Add types', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Add types', exact: true })).toBeVisible();
    },
  },
};

const title = (state: string, measured: Check): string =>
  `${state} at ${VIEWPORTS[measured].width} by ${VIEWPORTS[measured].height}`;

/** Sizes the page for the check, then reaches the state. */
async function reach(page: Page, measured: Check, state: State): Promise<void> {
  await page.setViewportSize(VIEWPORTS[measured]);
  await state.reach(page);
  await expect(page.locator(DESIGNER)).toBeVisible();
}

test.describe('reflow', () => {
  for (const [state, entry] of Object.entries(STATES))
    test(title(state, 'reflow'), async ({ page }) => {
      await reach(page, 'reflow', entry);
      await check(page, expect, {
        check: 'reflow',
        state,
        overlays: entry.overlays,
        exceptions: EXCEPTIONS,
        scrollsInPlace: TABLE_SCROLLERS.map(({ target, holds }) => ({ selector: target, why: holds })),
      });
    });
});

test.describe('resize', () => {
  for (const [state, entry] of Object.entries(STATES))
    test(title(state, 'resize'), async ({ page }) => {
      await reach(page, 'resize', entry);
      await check(page, expect, { check: 'resize', state, overlays: entry.overlays, exceptions: EXCEPTIONS });
    });
});

test.describe('spacing', () => {
  for (const [state, entry] of Object.entries(STATES))
    test(title(state, 'spacing'), async ({ page }) => {
      await reach(page, 'spacing', entry);
      await check(page, expect, { check: 'spacing', state, exceptions: EXCEPTIONS });
    });
});

test.describe('placeholder', () => {
  for (const [state, entry] of Object.entries(STATES))
    test(title(state, 'placeholder'), async ({ page }) => {
      await reach(page, 'placeholder', entry);
      await check(page, expect, { check: 'placeholder', state, exceptions: EXCEPTIONS });
    });
});

test.describe('boundary', () => {
  for (const [state, entry] of Object.entries(STATES))
    test(title(state, 'boundary'), async ({ page }) => {
      await reach(page, 'boundary', entry);
      const { measured } = await check(page, expect, { check: 'boundary', state, exceptions: EXCEPTIONS });
      // A selector that stops matching would let the check pass by measuring nothing.
      if (state === 'fresh template') expect(measured.boundary, 'controls that draw a boundary').toBeGreaterThan(0);
    });
});

test.describe('indicators', () => {
  for (const [state, entry] of Object.entries(STATES))
    test(title(state, 'indicators'), async ({ page }) => {
      await reach(page, 'indicators', entry);
      const { measured } = await check(page, expect, {
        check: 'indicators',
        state,
        scope: entry.surface ?? DESIGNER,
        exceptions: INDICATOR_EXCEPTIONS,
      });
      // A selector that stops matching would let the check pass by measuring nothing.
      if (state === 'field selected, Configuration tab') {
        expect(measured.icon, 'icons').toBeGreaterThan(0);
        expect(measured.focus, 'focus indicators').toBeGreaterThan(0);
        expect(measured.selection, 'selection marks').toBeGreaterThan(0);
      }
    });
});
