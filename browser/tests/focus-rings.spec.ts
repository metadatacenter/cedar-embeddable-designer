import { expect, test } from '@playwright/test';
import { expectSharedFocusRing, openDesigner, openSettings } from './support';

// These editors once switched the ring off and showed focus another way, or not at all.

test('the field picker searches libraries in a field that draws the shared focus ring', async ({ page }) => {
  // The library dropdown appears once the author keeps a library of their own fields.
  await page.addInitScript(() =>
    localStorage.setItem(
      'ced-field-library-v1',
      JSON.stringify({ libraries: [{ id: 1, name: 'Lab fields', description: '', icon: '' }], fields: [] }),
    ),
  );
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await expect(designer.getByRole('heading', { name: 'Choose field' })).toBeVisible();
  await designer.locator('.btn-library-dropdown').click();
  await expectSharedFocusRing(designer.getByPlaceholder('Search libraries...'));
});

test("a field card's name, option labels and content draw the shared focus ring", async ({ page }) => {
  const designer = await openDesigner(page);
  const addField = async (type: string) => {
    await designer
      .getByRole('button', { name: /^Add field$/ })
      .first()
      .click();
    await designer.getByRole('button', { name: type, exact: true }).click();
    const id = await designer
      .locator('input[aria-label="Field display name"]:focus')
      .evaluate((input) => input.closest('[id^=field-card-]')!.id);
    return designer.locator('#' + id);
  };
  const choice = await addField('Multiple Choice');
  await expectSharedFocusRing(choice.getByLabel('Field display name', { exact: true }));
  // Option labels and content are edited in the card's settings.
  await expectSharedFocusRing((await openSettings(choice)).locator('.choice-option-input').first());
  const text = await addField('Rich Text');
  await expectSharedFocusRing((await openSettings(text)).locator('.field-content-control'));
});
