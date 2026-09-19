import { expect, test } from '@playwright/test';
import { openDesigner, applyPreset, openSettings, currentTemplate, child } from './support';
import { buildTemplate, templateToJson } from '../../src/app/core/model/cedar-template';

for (const width of [1280, 375]) {
  test(`labels retain sentence case and paragraph defaults start compact at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const designer = await openDesigner(page);
    const template = templateToJson(
      buildTemplate({
        name: 'Label density',
        description: '',
        identifier: '',
        version: '0.0.1',
        fields: [
          {
            id: 1,
            type: 'paragraph',
            name: 'Notes',
            status: 'optional',
            allowMultiple: false,
            helpText: 'Free text.',
            defaultValue: { kind: 'none' },
          },
        ],
      }),
    );
    await page.evaluate((template) => {
      (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
    }, template);
    await applyPreset(page, 'semantic');
    const card = designer.locator('app-field-card').first();
    await openSettings(card);
    const help = card.getByText('Help text', { exact: true });
    await expect(help).toBeVisible();
    await expect(help).toHaveCSS('text-transform', 'none');
    for (const label of await designer.locator('.template-field-label').all()) {
      await expect(label).toHaveCSS('text-transform', 'none');
    }
    const value = card.getByRole('textbox', { name: 'Default value', exact: true });
    await expect(value).toHaveAttribute('rows', '1');
    await expect(value).toHaveCSS('height', '32px');
    await expect(value).toHaveCSS('resize', 'none');
    await value.fill('First line\nSecond line');
    await expect(value).toHaveValue('First line\nSecond line');
    expect(
      (child(await currentTemplate(page), 'Notes')._valueConstraints as Record<string, unknown>).defaultValue,
    ).toBe('First line\nSecond line');
    await designer.evaluate((node) => (node as HTMLElement).style.setProperty('--cedar-control-height', '40px'));
    await expect(value).toHaveCSS('height', '40px');
  });
}
