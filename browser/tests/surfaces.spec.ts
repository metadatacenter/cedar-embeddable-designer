import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { openDesigner, openSettings, openPreview, applyPreset, addElementFixture } from './support';
import { buildTemplate, templateToJson } from '../../src/app/core/model/cedar-template';
import { surfaceCases, checkSurface } from './surface-contracts.generated.mjs';
const registry = JSON.parse(readFileSync(new URL('../../.ui-surfaces.json', import.meta.url), 'utf8'));
const scenarios: Record<string, (page: Page) => Promise<void>> = {
  annotations: async (page) => {
    const d = await openDesigner(page);
    await openSettings(d.locator('app-field-card').first(), 'Annotations');
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
  'designer-page': async (page) => {
    await openDesigner(page);
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
    await settings.getByRole('tab', { name: 'Template metadata', exact: true }).click();
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
scenarios['import-fields-and-elements'] = async (page) => {
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
scenarios['field-library'] = async (page) => {
  const d = await openDesigner(page);
  await d.getByRole('button', { name: 'User Menu', exact: true }).click();
  await d.locator('.user-menu-dropdown').getByRole('button', { name: 'Preferences', exact: true }).click();
  await d.getByRole('radio', { name: /Library Sidebar/ }).check();
  await d.getByRole('button', { name: 'Done', exact: true }).click();
};
scenarios['default-value-error'] = async (page) => {
  const d = await openDesigner(page);
  await applyPreset(page, 'semantic');
  const panel = await openSettings(d.locator('app-field-card').first(), 'Constraints');
  await panel.getByLabel('Minimum length', { exact: true }).fill('8');
  await panel.getByRole('textbox', { name: 'Default value', exact: true }).fill('abc');
};
scenarios['import-error'] = async (page) => {
  const d = await openDesigner(page);
  await applyPreset(page, 'modular');
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as any).childSource = {
      async search() {
        throw new Error('The repository is unreachable.');
      },
      async load() {
        throw new Error('The repository is unreachable.');
      },
    };
  });
  await d.getByRole('button', { name: 'Add field', exact: true }).first().click();
  await d.getByRole('button', { name: 'Import fields and elements', exact: true }).first().click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
};
// The test host loads no CEE, so the preview reports the component it needs.
scenarios['preview-unavailable'] = async (page) => {
  const d = await openDesigner(page);
  await openPreview(page);
  await expect(d.locator('app-cee-preview .cee-preview__missing')).toBeVisible();
};
// Without `?picker=stub` the host has not loaded the term picker.
scenarios['picker-unavailable'] = async (page) => {
  const d = await openDesigner(page);
  await applyPreset(page, 'semantic');
  await d.getByRole('button', { name: /^Add field$/ }).click();
  await d.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  const card = d.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') });
  await card.getByRole('textbox', { name: 'Field display name', exact: true }).fill('Controlled Terms');
  await openSettings(card);
};
scenarios['invalid-field'] = async (page) => {
  const d = await openDesigner(page);
  const panel = await openSettings(d.locator('app-field-card').first(), 'Constraints');
  await panel.getByLabel('Minimum length', { exact: true }).fill('8');
  await panel.getByLabel('Maximum length', { exact: true }).fill('2');
};
// One of each authoring control kind in each context the authoring matrix spans. The field-type
// and label-weight suites cover every type and tab; these hold representatives to the central contracts.
scenarios['field-metadata'] = async (page) => {
  const d = await openDesigner(page);
  await openSettings(d.locator('app-field-card').first(), 'Field metadata');
};
scenarios['temporal-constraints'] = async (page) => {
  const d = await openDesigner(page);
  await d.getByRole('button', { name: /^Add field$/ }).click();
  await d.getByRole('button', { name: 'Temporal', exact: true }).click();
  const card = d.locator('app-field-card').last();
  await card.getByRole('textbox', { name: 'Field display name', exact: true }).fill('Temporal');
  await openSettings(card);
};
scenarios['element-metadata'] = async (page) => {
  const d = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, d);
  const card = d.locator('app-element-card').first();
  await card.getByRole('button', { name: 'Expand element settings', exact: true }).click();
  await card.getByRole('tab', { name: 'Element metadata', exact: true }).click();
};
scenarios['nested-field'] = async (page) => {
  const d = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, d);
  const nested = d.locator('app-container-editor').nth(1);
  await nested.getByRole('button', { name: 'Add field', exact: true }).click();
  await nested.getByRole('button', { name: 'Text', exact: true }).click();
  await openSettings(nested.locator('app-field-card').first());
};
// CI supplies the real sibling bundle; local runs opt in by setting CEF_BUNDLE.
scenarios['cef-default'] = async (page) => {
  test.skip(!process.env.CEF_BUNDLE, 'CEF_BUNDLE names the real CEF bundle.');
  const d = await openDesigner(page);
  await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
  await page.waitForFunction(() => !!customElements.get('cedar-embeddable-field'));
  const artifact = templateToJson(
    buildTemplate({
      name: 'Defaults',
      description: '',
      identifier: 'urn:template:defaults',
      version: '0.0.1',
      fields: [
        {
          id: 1,
          type: 'singleChoiceList',
          name: 'Value',
          status: 'optional',
          allowMultiple: false,
          options: ['A', 'B'],
          defaultValue: { kind: 'none' },
        },
      ],
    }),
  );
  await page.evaluate((artifact) => {
    (document.querySelector('cedar-embeddable-designer') as any).template = artifact;
  }, artifact);
  await openSettings(d.locator('app-field-card').first());
  await expect(d.locator('app-field-default-value cedar-embeddable-field')).toBeVisible();
};
// The contracts resolve each token where the surface sits, so a host's override of a shared role
// must reach the authoring surfaces. Asserting the override arrived keeps the check from passing vacuously.
scenarios['host-override'] = async (page) => {
  const d = await openDesigner(page);
  await d.evaluate((host) => (host as HTMLElement).style.setProperty('--cedar-font-size', '16px'));
  const panel = await openSettings(d.locator('app-field-card').first(), 'Field metadata');
  await expect(panel.locator('label[for^="field-key-"]')).toHaveCSS('font-size', '16px');
};
for (const { surface, state, width, title } of surfaceCases(registry, scenarios))
  test(title, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await scenarios[surface.scenario](page);
    await checkSurface(page, surface, state, expect, testInfo);
  });
