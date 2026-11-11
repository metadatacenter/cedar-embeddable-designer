import { Locator, expect, test } from '@playwright/test';
import { openDesigner, openSettings } from './support';

/**
 * Labels that stay once a box holds text: WCAG 3.3.2.
 *
 * A placeholder labels an empty box and disappears with the first character. The field-name box,
 * each option box and the library search each keep a visible label of their own: a Name caption, a
 * number and a magnifier. None of them makes a card taller.
 */

/** The element's height, or width, with `label` drawn and with it removed from the layout. */
async function sizeWithAndWithout(
  box: Locator,
  label: string,
  dimension: 'height' | 'width' = 'height',
): Promise<[number, number]> {
  return box.evaluate(
    (element, [selector, side]) => {
      const drawn = element.getBoundingClientRect()[side];
      const labels = [...element.querySelectorAll<HTMLElement>(selector)];
      for (const item of labels) item.style.display = 'none';
      const removed = element.getBoundingClientRect()[side];
      for (const item of labels) item.style.display = '';
      return [drawn, removed];
    },
    [label, dimension] as const,
  );
}

test('a field card draws Name before its name box, which holds a name', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').first();
  const name = card.getByRole('textbox', { name: 'Enter field name', exact: true });
  await expect(name).toHaveValue('Title');
  const caption = card.locator('.field-name-caption');
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText('Name');
  // The caption is drawn before the box, on the box's own line.
  const [captionBox, nameBox] = [(await caption.boundingBox())!, (await name.boundingBox())!];
  expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(nameBox.x);
  expect(captionBox.y).toBeGreaterThanOrEqual(nameBox.y);
  expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(nameBox.y + nameBox.height);
  // It adds no height to the card.
  const [drawn, removed] = await sizeWithAndWithout(card.locator('.field-drag-container'), '.field-name-caption');
  expect(drawn).toBe(removed);
});

test('a click on the Name caption toggles the settings and leaves the name box alone', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').first();
  const toggle = card.locator('app-field-settings .settings-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await card.locator('.field-name-caption').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('textbox', { name: 'Enter field name', exact: true })).not.toBeFocused();
  await card.locator('.field-name-caption').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('each option box draws its number before it, which holds text', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').nth(1);
  const panel = await openSettings(card);
  const rows = panel.locator('.choice-option-row');
  await expect(rows).toHaveCount(2);
  for (const [index, row] of (await rows.all()).entries()) {
    const box = row.getByRole('textbox', { name: `Option ${index + 1}`, exact: true });
    await expect(box).not.toHaveValue('');
    const number = row.locator('.choice-option-number');
    await expect(number).toHaveText(String(index + 1));
    const [numberBox, optionBox] = [(await number.boundingBox())!, (await box.boundingBox())!];
    expect(numberBox.x + numberBox.width).toBeLessThanOrEqual(optionBox.x);
    const [drawn, removed] = await sizeWithAndWithout(row, '.choice-option-number');
    expect(drawn).toBe(removed);
  }
  const [drawn, removed] = await sizeWithAndWithout(card.locator('.field-drag-container'), '.choice-option-number');
  expect(drawn).toBe(removed);
});

test('the library search draws a magnifier in its box and has an accessible name', async ({ page }) => {
  // The library dropdown appears once the author keeps a library of their own fields.
  await page.addInitScript(() =>
    localStorage.setItem(
      'ced-field-library-v1',
      JSON.stringify({ libraries: [{ id: 1, name: 'Lab fields', description: '', icon: '' }], fields: [] }),
    ),
  );
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.locator('.btn-library-dropdown').click();
  const search = designer.getByRole('textbox', { name: 'Search libraries...', exact: true });
  await search.fill('Lab');
  // The placeholder is gone, and the magnifier still says what the box is for.
  const outline = designer.locator('.dropdown-search-field');
  const icon = outline.locator('svg[data-cedar-icon="search"]');
  await expect(icon).toBeVisible();
  const [outer, glyph, input] = [
    (await outline.boundingBox())!,
    (await icon.boundingBox())!,
    (await search.boundingBox())!,
  ];
  expect(glyph.x).toBeGreaterThan(outer.x);
  expect(glyph.x + glyph.width).toBeLessThanOrEqual(input.x);
  expect(input.x + input.width).toBeLessThanOrEqual(outer.x + outer.width);
  // The magnifier takes room from the input rather than widening the panel.
  const [drawn, removed] = await sizeWithAndWithout(designer.locator('.dropdown-panel'), 'app-icon', 'width');
  expect(drawn).toBe(removed);
  // The focus ring goes round the whole box, magnifier included, and the input draws none of its own.
  await search.focus();
  const rings = await outline.evaluate((box) => {
    const input = box.querySelector('input')!;
    return [getComputedStyle(box).outlineStyle, getComputedStyle(input).outlineStyle];
  });
  expect(rings).toEqual(['solid', 'none']);
  // The filter still works through the box.
  await expect(designer.locator('.dropdown-option', { hasText: 'Lab fields' })).toBeVisible();
  await search.fill('zzz');
  await expect(designer.locator('.dropdown-option', { hasText: 'Lab fields' })).toHaveCount(0);
});
