import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { openDesigner, openSettings, applyPreset, addElementFixture } from './support';
import { buildTemplate, templateToJson } from '../../src/app/core/model/cedar-template';
import { surfaceCases, checkSurface } from './surface-contracts.generated.mjs';
const registry = JSON.parse(readFileSync(new URL('../../.ui-surfaces.json', import.meta.url), 'utf8'));
const scenarios: Record<string, (page: Page) => Promise<void>> = {
  'profile-menu': async (page) => {
    const d = await openDesigner(page);
    await d.getByRole('button', { name: 'Basic', exact: true }).click();
  },
  'user-menu': async (page) => {
    const d = await openDesigner(page);
    await d.getByRole('button', { name: 'User Menu', exact: true }).click();
  },
  preferences: async (page) => {
    await scenarios['user-menu'](page);
    await page.locator('.user-menu-dropdown').getByRole('button', { name: 'Preferences', exact: true }).click();
  },
  presets: async (page) => {
    await scenarios['user-menu'](page);
    await page.locator('.user-menu-dropdown').getByRole('button', { name: 'Define Presets', exact: true }).click();
  },
  'field-type': async (page) => {
    await page.goto('/field-host.html');
  },
  'library-menu': async (page) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'ced-field-library-v1',
        JSON.stringify({ libraries: [{ id: 'lab', name: 'Lab' }], fields: [] }),
      ),
    );
    const d = await openDesigner(page);
    await d.getByRole('button', { name: 'Add field', exact: true }).last().click();
    await d.locator('.btn-library-dropdown').click();
  },
  property: async (page) => {
    const d = await openDesigner(page, '?picker=stub');
    const panel = await openSettings(d.locator('app-field-card').first(), 'Field metadata');
    await panel.getByRole('button', { name: 'Replace property IRI', exact: true }).click();
  },
  types: async (page) => {
    const d = await openDesigner(page, '?picker=stub');
    const settings = d.locator('app-container-settings').first();
    await settings.getByRole('button', { name: 'Expand template settings', exact: true }).click();
    await settings.getByRole('tab', { name: 'Template Metadata', exact: true }).click();
    await settings.getByRole('button', { name: 'Add types', exact: true }).click();
  },
  validation: async (page) => {
    const d = await openDesigner(page);
    await d.getByRole('textbox', { name: 'Template name', exact: true }).fill('');
    await d.getByRole('textbox', { name: 'Template name', exact: true }).blur();
  },
  'delete-element': async (page) => {
    const d = await openDesigner(page);
    await applyPreset(page, 'modular');
    await addElementFixture(page, d);
    const nested = d.locator('app-container-editor').nth(1);
    await nested.getByRole('button', { name: 'Add field', exact: true }).click();
    await nested.getByRole('button', { name: 'Text', exact: true }).click();
    await nested.getByRole('button', { name: 'Delete element Element', exact: true }).click();
  },
};
for (const kind of ['field', 'element'])
  scenarios['import-' + kind + 's'] = async (page) => {
    const d = await openDesigner(page);
    await applyPreset(page, 'modular');
    await d.getByRole('button', { name: 'Add field', exact: true }).first().click();
    await d.getByRole('button', { name: 'Import fields and elements', exact: true }).first().click();
  };
async function termField(page: Page) {
  // Only the CED-owned dialog is under test. Sibling internals have their own suite.
  await page.addInitScript(() => customElements.define('cedar-embeddable-field', class extends HTMLElement {}));
  const d = await openDesigner(page, '?picker=stub');
  const artifact = templateToJson(
    buildTemplate({
      name: 'Terms',
      description: '',
      identifier: 'urn:terms',
      version: '0.0.1',
      fields: [
        {
          id: 1,
          type: 'controlledTerms',
          name: 'Disease',
          status: 'optional',
          allowMultiple: false,
          defaultValue: { kind: 'none' },
          controlledTermConstraints: {
            constraints: [{ sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Disease Ontology' }],
            actions: [],
          },
        },
      ],
    }),
  );
  await page.evaluate((artifact) => {
    (document.querySelector('cedar-embeddable-designer') as any).template = artifact;
  }, artifact);
  await applyPreset(page, 'semantic');
  await openSettings(d.locator('app-field-card').first(), 'Constraints');
}
scenarios.constraints = async (page) => {
  await termField(page);
  await page.getByRole('button', { name: 'Edit controlled-term constraints', exact: true }).click();
};
scenarios['default-term'] = async (page) => {
  await termField(page);
  await page.getByRole('button', { name: 'Edit default term', exact: true }).click();
};
for (const { surface, state, width, title } of surfaceCases(registry, scenarios))
  test(title, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await scenarios[surface.scenario](page);
    await checkSurface(page, surface, state, expect, testInfo);
  });
