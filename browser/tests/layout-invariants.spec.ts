/**
 * What the designer's own layout must hold for, whatever is on the page.
 *
 * The visual half of the test strategy usually means screenshots, and screenshots
 * answer a different question from this one. A baseline says "this is what it looked
 * like when someone approved it", and every deliberate change makes it red. These
 * say "no card clips its own text, nothing escapes its box, the column is a column",
 * which stays true across every redesign and needs no approval to remain meaningful.
 * So they cost nothing to keep and they never teach anyone to reach for
 * --update-snapshots.
 *
 * Every claim here passed the first time it was run, which is worth saying plainly:
 * this is a ratchet, not a bug report. It holds the layout where it already is. The
 * numbers in it were measured rather than chosen — 292 to 377 pixels tall and 848
 * wide across all twenty-six types — and the budget sits just above the range so
 * that growth is caught while ordinary variation is not.
 *
 * The palette is read off the page rather than listed here, so a field type added to
 * the designer is covered by every claim below without this file being touched. That
 * is the same rule the model matrices follow, for the same reason: a list of types
 * written into a test is a list that goes stale.
 *
 * Soft assertions throughout. One setup places all twenty-six cards, and a layout
 * failure is nearly always several failures at once — the first offender is rarely
 * the informative one, and re-running to find the next is how a suite like this
 * becomes something people skip.
 */
import { test, expect, type Page } from '@playwright/test';
import { openDesigner, applyPreset } from './support';

const DESIGNER = 'cedar-embeddable-designer';

/**
 * The tallest a field card may be, measured and then rounded up.
 *
 * Cards ran 292 to 377 pixels across the whole palette when this was written, all of
 * them showing their name, their preview and four collapsed disclosure rows. The
 * budget is a ratchet on the designer's appetite for vertical space, which is the
 * complaint an author makes first about a form builder: raise it deliberately, with
 * a reason, or not at all.
 */
const HEIGHT_BUDGET = 420;

/** Every field type the palette offers, by the label its button shows. */
async function paletteLabels(page: Page): Promise<string[]> {
  const designer = page.locator(DESIGNER);
  await designer
    .getByRole('button', { name: /Add Field/ })
    .first()
    .click();
  const picker = designer.locator('app-field-type-picker');
  await picker.locator('.btn-field-item').first().waitFor({ state: 'visible' });
  const labels = await picker.locator('.btn-field-item .field-item-label').allTextContents();
  await page.keyboard.press('Escape');
  return labels.map((label) => label.trim()).filter(Boolean);
}

/**
 * The designer with one card of every type on it.
 *
 * Modular is the preset that hides no type, so it is the one that can show the whole
 * palette at once. Waiting on the card count rather than on the last click: adding a
 * field scrolls its card in smoothly, so the click resolves before the card is laid
 * out and a measurement taken straight afterwards reads a card that is still moving.
 */
async function everyTypeOnPage(page: Page): Promise<string[]> {
  await openDesigner(page);
  await applyPreset(page, 'modular');
  const designer = page.locator(DESIGNER);
  const cardsBefore = await designer.locator('[id^=field-card-]').count();
  const labels = await paletteLabels(page);

  for (const label of labels) {
    await designer
      .getByRole('button', { name: /Add Field/ })
      .first()
      .click();
    await designer.getByRole('button', { name: label, exact: true }).click();
  }
  await expect
    .poll(async () => designer.locator('[id^=field-card-]').count(), { timeout: 15_000 })
    .toBe(cardsBefore + labels.length);
  return labels;
}

/** Everything the invariants need, read in one pass so the page is measured once. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('cedar-embeddable-designer')!.shadowRoot!;
    const cards = [...root.querySelectorAll('[id^=field-card-]')];

    /** An element that scrolls on purpose is not an element that clips by accident. */
    const scrolls = (element: Element): boolean => {
      const style = getComputedStyle(element);
      return /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY);
    };

    /** Controls hold their own value and scroll it; their content is not the layout's business. */
    const OWN_SCROLL = ['input', 'textarea', 'select', 'svg', 'path', 'img'];

    const clipped: string[] = [];
    const escaped: string[] = [];
    const misaligned: string[] = [];
    const geometry: { id: string; label: string; width: number; height: number }[] = [];

    for (const card of cards) {
      const box = card.getBoundingClientRect();
      const label = (card.querySelector('input') as HTMLInputElement | null)?.value || card.id;
      geometry.push({ id: card.id, label, width: Math.round(box.width), height: Math.round(box.height) });

      for (const element of card.querySelectorAll('*')) {
        if (OWN_SCROLL.includes(element.tagName.toLowerCase()) || scrolls(element)) continue;

        const text = (element.textContent ?? '').trim();
        if (element.children.length === 0 && text && element.scrollWidth > element.clientWidth + 1) {
          clipped.push(`${label}: "${text.slice(0, 30)}" needs ${element.scrollWidth}px in ${element.clientWidth}px`);
        }

        const inner = element.getBoundingClientRect();
        if (inner.width > 0 && inner.right > box.right + 1) {
          escaped.push(
            `${label}: ${element.tagName.toLowerCase()} reaches ${Math.round(inner.right)}px past ${Math.round(box.right)}px`,
          );
        }
      }

      const lefts = [
        ...new Set([...card.querySelectorAll('summary')].map((row) => Math.round(row.getBoundingClientRect().left))),
      ];
      if (lefts.length > 1) misaligned.push(`${label}: disclosure rows start at ${lefts.join(', ')}`);
    }

    const doc = document.documentElement;
    return {
      clipped,
      escaped,
      misaligned,
      geometry,
      pageScrollWidth: doc.scrollWidth,
      pageClientWidth: doc.clientWidth,
    };
  });
}

test('the whole palette lays out without clipping, escaping or drifting', async ({ page }) => {
  const labels = await everyTypeOnPage(page);
  const { clipped, escaped, misaligned, geometry } = await measure(page);

  // The palette itself, so a type that stopped being offered is not silently uncovered.
  expect(labels.length).toBe(26);

  expect.soft(clipped, 'text a card cannot show in the space it gives it').toEqual([]);
  expect.soft(escaped, 'content reaching outside the card that holds it').toEqual([]);
  expect.soft(misaligned, 'disclosure rows that do not share a left edge').toEqual([]);

  // One column: every card the same width, whatever it holds.
  const widths = [...new Set(geometry.map((card) => card.width))];
  expect.soft(widths, 'cards of differing widths in one column').toHaveLength(1);

  const overBudget = geometry.filter((card) => card.height > HEIGHT_BUDGET);
  expect
    .soft(
      overBudget.map((card) => `${card.label} at ${card.height}px`),
      `cards taller than ${HEIGHT_BUDGET}px`,
    )
    .toEqual([]);
});

/**
 * Sideways scrolling, at the width the designer is built for and at a narrow one.
 *
 * Its own test because it is a property of the page rather than of a card, and
 * because the narrow case is the one that breaks: a fixed width or an unwrapped row
 * shows up nowhere else and makes every card unreachable at the right edge.
 */
test.describe('the page never scrolls sideways', () => {
  /*
   * 375 is the width that earned its place. At 1280 and 768 the designer was clean,
   * and at 375 three separate rules pushed content out: a settings label that would
   * not shrink below its input, the header's action group, and the template header's
   * own row — together scrolling the page 109px sideways and putting the right edge
   * of every card out of reach. None of that was visible at the two wider sizes.
   */
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'narrow', width: 768, height: 900 },
    { name: 'phone', width: 375, height: 900 },
  ]) {
    test(`at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await everyTypeOnPage(page);
      const { pageScrollWidth, pageClientWidth } = await measure(page);

      expect(
        pageScrollWidth,
        `${viewport.name} scrolls ${pageScrollWidth - pageClientWidth}px sideways`,
      ).toBeLessThanOrEqual(pageClientWidth);
    });
  }
});
