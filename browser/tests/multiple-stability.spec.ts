import { test, expect } from '@playwright/test';
import { openDesigner, openPreview, openSettings } from './support';
for (const width of [1280, 375]) {
  test(`allow multiple preserves header geometry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1400 });
    const designer = await openDesigner(page);
    if (process.env.CEF_BUNDLE) {
      await page.addScriptTag({ path: process.env.CEF_BUNDLE });
      await openPreview(page);
      await expect(designer.locator('cedar-embeddable-editor')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
    }
    const cards = designer.locator('app-field-card');
    const count = await cards.count();
    let measured = 0;
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      // A card mounts its settings the first time they open, so whether it offers the checkbox is
      // known only once its Configuration tab is shown.
      const configuration = await openSettings(card, 'Configuration');
      const checkbox = configuration.getByLabel('Allow multiple', { exact: true });
      if (!(await checkbox.count())) continue;
      measured++;
      await checkbox.scrollIntoViewIfNeeded();
      await configuration.getByRole('combobox', { name: 'Requirement', exact: true }).selectOption('optional');
      await expect(card.getByLabel('Required', { exact: true })).toHaveCount(0);
      await checkbox.focus();
      const measure = () =>
        card.evaluate((el) =>
          Object.fromEntries(
            [
              '.field-header',
              '.field-heading',
              '.field-heading > input',
              '.field-type-icon',
              '.field-summary',
              '.field-actions',
            ].map((s) => {
              const r = el.querySelector(s)!.getBoundingClientRect();
              return [s, { y: r.y, height: r.height }];
            }),
          ),
        );
      const before = await measure();
      await checkbox.check();
      await expect(card.getByLabel('Occurrence range')).toBeVisible();
      const nameLineHeight = await card
        .locator('.field-heading > input')
        .evaluate((el) => getComputedStyle(el).lineHeight);
      await expect(card.getByLabel('Occurrence range')).toHaveCSS('line-height', nameLineHeight);
      const after = await measure();

      expect(after).toEqual(before);
      await checkbox.uncheck();
      await expect(card.getByLabel('Occurrence range')).toHaveCount(0);
      expect(await measure()).toEqual(before);
    }
    // The starter template offers the checkbox on its text and date fields. A loop that measured
    // nothing would pass whatever the header did.
    expect(measured).toBeGreaterThan(0);
  });
}
