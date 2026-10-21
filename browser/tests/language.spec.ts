import { applyPreset } from './support';
import { addElementFixture } from './support';
import { Locator, expect, test } from '@playwright/test';
import { openDesigner, openSettings } from './support';
import { buildTemplate, templateToJson } from '../../src/app/core/model/cedar-template';
import { Field } from '../../src/app/core/models/types';

for (const width of [1280, 375]) {
  test(`language selectors on templates fields and elements at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const root = designer.locator('app-container-editor').first();
    const rootSettings = root.locator(':scope > .template-header-card > app-container-settings');
    await rootSettings.getByRole('button', { name: 'Expand template settings' }).click();
    const language = rootSettings.getByRole('combobox', { name: 'Language', exact: true });
    await expect(language).toHaveValue('');
    await language.selectOption('fr');
    await expect(language).toHaveValue('fr');
    await language.selectOption('');
    await rootSettings.getByRole('button', { name: 'Collapse template settings' }).click();
    const field = designer.locator('app-field-card').first();
    await openSettings(field, 'Presentation');
    await field.getByRole('combobox', { name: 'Language', exact: true }).selectOption('en');
    await field.locator('app-field-settings').screenshot({ path: testInfo.outputPath('language.png') });
    await applyPreset(page, 'modular');
    await addElementFixture(page, root);
    const element = designer.locator('app-element-card').first();
    await element.getByRole('button', { name: 'Expand element settings' }).click();
    await element.getByRole('tab', { name: 'Presentation', exact: true }).click();
    await element.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
    await expect(element.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('de');
  });
}

/**
 * WCAG 3.1.2: a field declares the language of its values, so a value the designer shows is
 * marked with it and read in that language inside the designer's own. A text default, a choice
 * option and a rich text block's markup are values. A number has no language, and the names and
 * descriptions the author writes declare none, so they keep the designer's.
 */
test("marks a field's values with the language it declares, and nothing else", async ({ page }) => {
  const designer = await openDesigner(page);
  const fields: Partial<Field>[] = [
    { type: 'text', name: 'Titre', language: 'fr', defaultValue: { kind: 'literal', value: 'Bonjour' } },
    { type: 'paragraph', name: 'Résumé', language: 'fr', defaultValue: { kind: 'literal', value: 'Un texte' } },
    { type: 'number', name: 'Nombre', language: 'fr', defaultValue: { kind: 'number', value: 3 } },
    { type: 'multipleChoice', name: 'Couleur', language: 'fr', options: ['Rouge', 'Bleu'] },
    { type: 'richText', name: 'Note', language: 'fr', content: '<p>Lisez ceci.</p>' },
    { type: 'text', name: 'Plain', defaultValue: { kind: 'literal', value: 'Hello' } },
  ];
  const template = templateToJson(
    buildTemplate({
      name: 'Languages',
      description: '',
      identifier: 'urn:template:languages',
      version: '0.0.1',
      fields: fields.map((field, index) => ({
        id: index + 1,
        status: 'optional',
        allowMultiple: false,
        options: [],
        defaultValue: { kind: 'none' },
        ...field,
      })) as Field[],
    }),
  );
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, template);
  // Semantic shows the default value.
  await applyPreset(page, 'semantic');
  const cards = designer.locator('app-field-card');
  await expect(cards).toHaveCount(fields.length);
  /** The `lang` attribute `box` carries, and whether the browser takes its text to be in `language`. */
  const language = (box: Locator, language: string) =>
    box.evaluate(
      (element, language) => ({ lang: element.getAttribute('lang'), reads: element.matches(`:lang(${language})`) }),
      language,
    );
  const defaultBox = (card: Locator) => card.getByRole('textbox', { name: 'Default value', exact: true });

  await openSettings(cards.nth(0));
  expect(await language(defaultBox(cards.nth(0)), 'fr')).toEqual({ lang: 'fr', reads: true });
  // The field's name is template text, which declares no language.
  expect(await language(cards.nth(0).getByRole('textbox', { name: 'Enter field name' }), 'en')).toEqual({
    lang: null,
    reads: true,
  });
  await openSettings(cards.nth(1));
  expect(await language(defaultBox(cards.nth(1)), 'fr')).toEqual({ lang: 'fr', reads: true });
  await openSettings(cards.nth(2));
  expect(await language(defaultBox(cards.nth(2)), 'en')).toEqual({ lang: null, reads: true });
  await openSettings(cards.nth(3));
  for (const option of await cards
    .nth(3)
    .getByRole('textbox', { name: /^Option \d$/ })
    .all())
    expect(await language(option, 'fr')).toEqual({ lang: 'fr', reads: true });
  await openSettings(cards.nth(4));
  expect(await language(cards.nth(4).locator('textarea.field-content-control'), 'fr')).toEqual({
    lang: 'fr',
    reads: true,
  });
  await openSettings(cards.nth(5));
  expect(await language(defaultBox(cards.nth(5)), 'en')).toEqual({ lang: null, reads: true });

  // The mark follows the declaration as the author changes it, and leaves with it.
  const text = cards.nth(0);
  await openSettings(text, 'Presentation');
  await text.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
  await openSettings(text);
  expect(await language(defaultBox(text), 'de')).toEqual({ lang: 'de', reads: true });
  await openSettings(text, 'Presentation');
  await text.getByRole('combobox', { name: 'Language', exact: true }).selectOption('');
  await openSettings(text);
  expect(await language(defaultBox(text), 'en')).toEqual({ lang: null, reads: true });
});
