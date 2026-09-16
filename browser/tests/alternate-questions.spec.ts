import { expect, test } from '@playwright/test';
import { openDesigner, openSettings, currentTemplate, child } from './support';

for (const width of [1280, 375]) {
  test(`alternate questions are added to a read-only table at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const card = designer.locator('app-field-card').first();
    await openSettings(card, 'Display');
    const editor = card.locator('app-alternate-questions');
    const input = editor.getByRole('textbox', { name: 'New alternate question' });
    await input.fill('   ');
    await expect(editor.getByRole('alert')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Add question', exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveText('Question cannot be blank.');
    await input.fill('What is the title?');
    await expect(editor.getByRole('alert')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Add question', exact: true }).click();
    await expect(input).toHaveValue('');
    await input.fill('  What is the title?  ');
    await expect(editor.getByRole('alert')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Add question', exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveText('Questions must be unique.');
    await expect(editor.locator('tbody tr')).toHaveCount(1);
    await input.fill('Which title should be used?');
    await editor.getByRole('button', { name: 'Add question', exact: true }).click();
    await expect(editor.locator('tbody input, tbody textarea, tbody [contenteditable]')).toHaveCount(0);
    expect(child(await currentTemplate(page), 'Title')['skos:altLabel']).toEqual([
      'What is the title?',
      'Which title should be used?',
    ]);
    await editor.screenshot({ path: testInfo.outputPath('alternate-questions.png') });
    await card.getByRole('tab', { name: 'Field details', exact: true }).click();
    await card.getByRole('tab', { name: 'Display', exact: true }).click();
    await expect(editor.getByRole('cell', { name: 'What is the title?', exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Remove question 1' }).click();
    expect(child(await currentTemplate(page), 'Title')['skos:altLabel']).toEqual(['Which title should be used?']);
  });
}
