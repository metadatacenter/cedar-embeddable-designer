import { expect, test, type Locator } from '@playwright/test';
import { applyPreset, openDesigner, openSettings } from './support';
import { newContainer, buildContainer, templateToJson } from '../../src/app/core/model/cedar-template';
import { fieldNode, newNodeId } from '../../src/app/core/model/container-draft';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';

async function ownsCenter(control: Locator) {
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const root = element.getRootNode() as ShadowRoot;
        const hit = root.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit === element || (!!hit && element.contains(hit));
      }),
    )
    .toBe(true);
}

async function separateActions(zone: Locator, card: Locator) {
  await expect(card).toHaveClass(/selected/);
  // Read one frame atomically: field insertion scrolls smoothly, so measurements
  // collected in separate browser calls can belong to different scroll positions.
  await expect
    .poll(() =>
      zone.evaluate((element) => {
        const area = element.getBoundingClientRect();
        const below = element.parentElement!.querySelector(':scope > .field-drag-container')!.getBoundingClientRect();
        const root = element.getRootNode() as ShadowRoot;
        const buttons = [...element.querySelectorAll('button')];
        return {
          separate: area.bottom <= below.top + 1,
          count: buttons.length,
          contained: buttons.every((button) => {
            const box = button.getBoundingClientRect();
            return box.top >= area.top && box.bottom <= area.bottom + 1;
          }),
          reachable: buttons.every((button) => {
            const box = button.getBoundingClientRect();
            const hit = root.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return hit === button || (!!hit && button.contains(hit));
          }),
        };
      }),
    )
    .toEqual({ separate: true, count: 3, contained: true, reachable: true });
}

for (const width of [375, 768, 1100]) {
  test.describe(`touch insertion at ${width}`, () => {
    test.use({ hasTouch: true, viewport: { width, height: 1000 } });
    test('wrapped actions leave names and Delete reachable and keep their space on dismissal', async ({
      page,
    }, info) => {
      const designer = await openDesigner(page);
      await applyPreset(page, 'modular');
      if (width === 1100) {
        for (const toggle of ['.overview-toggle', '.preview-toggle']) {
          const button = designer.locator(toggle);
          if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
        }
      }
      const field = designer.locator('app-field-card').first();
      await openSettings(field, 'Configuration');
      const card = designer.getByRole('group', { name: 'Title', exact: true });
      await card.focus();
      const zone = card.locator('..').locator(':scope > .insert-zone');
      await expect(zone).toHaveCSS('opacity', '1');
      await zone.scrollIntoViewIfNeeded();
      await separateActions(zone, card);
      const template = (await designer.locator('.template-header-card').first().boundingBox())!;
      expect((await zone.boundingBox())!.y).toBeGreaterThanOrEqual(template.y + template.height);
      await ownsCenter(field.getByRole('textbox', { name: 'Enter field name', exact: true }));
      await ownsCenter(field.getByRole('button', { name: 'Delete field', exact: true }));
      await page.screenshot({ path: info.outputPath('touch-insertion.png') });
      const before = (await card.boundingBox())!;
      await page.keyboard.press('Escape');
      await expect(zone).toHaveCSS('opacity', '0');
      expect((await card.boundingBox())!.y).toBeCloseTo(before.y, 1);

      // Focus reveals the same row again, and an ordinary tap reaches its action.
      const add = zone.getByRole('button', { name: 'Add field here', exact: true });
      await add.focus();
      await expect(zone).toHaveCSS('opacity', '1');
      await add.tap();
      await expect(designer.locator('app-field-type-picker')).toBeVisible();
      await page.keyboard.press('Escape');
      const next = designer.getByRole('group', { name: 'Category', exact: true });
      await next.focus();
      const nextZone = next.locator('..').locator(':scope > .insert-zone');
      await nextZone.scrollIntoViewIfNeeded();
      await separateActions(nextZone, next);
      await expect(zone).toHaveCSS('opacity', '0');
    });
  });
}

test.describe('nested touch insertion', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 1000 } });
  test('nested trailing actions and the next root insertion occupy separate rows', async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    const root = newContainer('template');
    root.name = 'Study';
    const visit = newContainer('element');
    visit.name = 'Visit';
    const field = (name: string) =>
      fieldNode({
        id: newNodeId(),
        name,
        type: 'text',
        status: 'optional',
        options: [],
        defaultValue: { kind: 'none' },
        allowMultiple: false,
      });
    visit.children = [field('Visit notes')];
    root.children = [
      { kind: 'element', id: visit.id, definition: visit, placement: { allowMultiple: false } },
      field('Age'),
    ];
    await designer.evaluate(
      (el, value) => (el as unknown as CedarEmbeddableDesignerElement).loadArtifact(value),
      templateToJson(buildContainer(root)),
    );
    const age = designer.getByRole('group', { name: 'Age', exact: true });
    await age.focus();
    const zone = age.locator('..').locator(':scope > .insert-zone');
    await zone.scrollIntoViewIfNeeded();
    await separateActions(zone, age);
    const nestedActions = designer.locator('app-container-editor app-container-editor .bottom-insert-zone');
    const nested = (await nestedActions.boundingBox())!;
    expect(nested.y + nested.height).toBeLessThan((await zone.boundingBox())!.y);
    await ownsCenter(nestedActions.getByRole('button', { name: 'Add field', exact: true }));
  });
});

test.describe('touch insertion on a short phone', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });
  test('adding a field brings its complete insertion row into view', async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    const first = designer.getByRole('group', { name: 'Title', exact: true });
    await first.focus();
    await first.locator('..').getByRole('button', { name: 'Add field here', exact: true }).tap();
    await designer.locator('app-field-type-picker').getByRole('button', { name: 'Text', exact: true }).tap();
    await expect(designer.locator('app-field-card')).toHaveCount(4);
    const selected = designer.locator('.field-drag-container.selected');
    await expect(selected.getByRole('textbox', { name: 'Enter field name', exact: true })).toHaveValue('');
    await separateActions(selected.locator('..').locator(':scope > .insert-zone'), selected);
  });
});
