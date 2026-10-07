import { expect, Page, test } from '@playwright/test';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';
import { buildContainer, newContainer, templateToJson } from '../../src/app/core/model/cedar-template';
import { fieldNode } from '../../src/app/core/model/container-draft';
import type { Field } from '../../src/app/core/models/types';
import { applyPreset, child, clickCentred, currentTemplate, openDesigner, openPreview, openSettings } from './support';

const report = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).validate(),
  );
const load = (page: Page, artifact: object) =>
  page.evaluate(
    (artifact) =>
      (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).loadArtifact(artifact),
    artifact,
  );

function source(type: string, depth: number, kind: 'template' | 'element' = 'template', multiple = false) {
  const root = newContainer(kind);
  root.name = 'Imported';
  let parent = root;
  for (let level = 1; level <= depth; level++) {
    const definition = newContainer('element');
    definition.name = `Level ${level}`;
    parent.children = [{ id: definition.id, kind: 'element', definition, placement: { allowMultiple: multiple } }];
    parent = definition;
  }
  const field: Field = {
    id: 1,
    name: 'Value',
    type,
    status: 'optional',
    allowMultiple: multiple,
    options: [],
    defaultValue: { kind: 'none' },
  };
  if (type === 'number') field.numeric = { type: 'xsd:decimal', min: 10, max: 100, decimalPlaces: null, unit: null };
  parent.children = [fieldNode(field)];
  const artifact = templateToJson(buildContainer(root)) as Record<string, unknown>;
  let container = artifact;
  for (let level = 1; level <= depth; level++) container = child(container, `Level ${level}`);
  (child(container, 'Value')._valueConstraints as Record<string, unknown>).defaultValue =
    type === 'number'
      ? '1000'
      : type === 'controlledTerms'
        ? { termUri: 'relative/path', 'rdfs:label': 'Supplied' }
        : 'relative/path';
  return artifact;
}

for (const type of ['link', 'controlledTerms', 'orcid', 'ror', 'pfas', 'rrid', 'pubmed', 'nihGrantId', 'doi']) {
  for (const depth of [0, 3, 6]) {
    test(`${type} at depth ${depth}: imported default remains reachable without CEF and can be cleared`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const designer = await openDesigner(page, '?cee=stub');
      await applyPreset(page, 'modular');
      const preview = await openPreview(page);
      await load(page, source(type, depth));
      await expect.poll(async () => (await report(page)).canSave).toBe(false);
      const issues = (await report(page)).issues;
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ setting: 'defaultValue', tab: 'Constraints', shown: true });
      expect(issues[0].path).toHaveLength(depth + 2);
      await expect(preview.getByRole('status')).toContainText('Preview is unavailable');
      await expect(designer.locator('.outline-row.invalid')).toHaveCount(depth + 1);
      if (depth) await clickCentred(designer.locator('.element-toggle[aria-label="Collapse Level 1"]'));
      await designer.locator('.validation-summary summary').click();
      await designer.locator('.validation-summary button').click();
      const card = designer.locator('app-field-card');
      await expect(card.getByRole('tabpanel', { name: 'Constraints', exact: true })).toBeVisible();
      await expect(card).toContainText('Default value: relative/path');
      await expect(designer.locator('.outline-row.active .node-name')).toHaveText('Value');
      await card.getByLabel('Field display name', { exact: true }).fill('Renamed value');
      await openSettings(card, 'Metadata');
      await card.locator('input[name=schemaIdentifier]').fill('Identifier');
      await openSettings(card);
      await expect(card).toContainText('Default value: relative/path');
      expect((await report(page)).canSave).toBe(false);
      await card.getByRole('button', { name: 'Clear invalid default', exact: true }).click();
      await expect.poll(async () => (await report(page)).canSave).toBe(true);
      await expect(designer.locator('.outline-row.invalid')).toHaveCount(0);
      await expect(designer.locator('.validation-summary')).toHaveCount(0);
      await expect(preview.locator('cedar-embeddable-editor')).toBeVisible();
      const repaired = await currentTemplate(page);
      await load(page, repaired);
      expect((await report(page)).canSave).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

for (const kind of ['template', 'element'] as const)
  for (const depth of [0, 3, 6])
    for (const multiple of [false, true])
      for (const recovery of ['correct', 'clear', 'relax']) {
        test(`${kind}, depth ${depth}, multiple ${multiple}: min 10 / max 100 / default 1000 → ${recovery}`, async ({
          page,
        }) => {
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(error.message));
          const designer = await openDesigner(page, '?cee=stub');
          await applyPreset(page, 'modular');
          const preview = await openPreview(page);
          await load(page, source('number', depth, kind, multiple));
          await expect.poll(async () => (await report(page)).canSave).toBe(false);
          expect((await report(page)).issues).toHaveLength(1);
          expect((await report(page)).issues[0].path).toHaveLength(depth + 2);
          if (depth) await clickCentred(designer.locator('.element-toggle[aria-label="Collapse Level 1"]'));
          await expect(preview.getByRole('status')).toContainText('Preview is unavailable');
          await designer.locator('.validation-summary summary').click();
          await designer.locator('.validation-summary button').click();
          const card = designer.locator('app-field-card');
          const value = card.getByRole('textbox', { name: 'Default value', exact: true });
          await expect(value).toHaveValue('1000');
          await expect(value).toHaveAttribute('aria-invalid', 'true');
          await expect(designer.locator('.outline-row.active .node-name')).toHaveText('Value');
          await card.getByLabel('Field display name', { exact: true }).fill('Renamed number');
          await openSettings(card, 'Presentation');
          await openSettings(card);
          await expect(value).toHaveValue('1000');
          if (recovery === 'relax') await card.getByLabel('Maximum value', { exact: true }).fill('1000');
          else await value.fill(recovery === 'clear' ? '' : '50');
          await expect.poll(async () => (await report(page)).canSave).toBe(true);
          await expect(value).toHaveAttribute('aria-invalid', 'false');
          await expect(designer.locator('.outline-row.invalid')).toHaveCount(0);
          await expect(preview.locator('cedar-embeddable-editor')).toBeVisible();
          await load(page, await currentTemplate(page));
          expect((await report(page)).canSave).toBe(true);
          expect(errors).toEqual([]);
        });
      }

for (const depth of [0, 3, 6])
  for (const repairFirst of ['annotation', 'default']) {
    test(`depth ${depth}: buried annotation and default recover ${repairFirst} first`, async ({ page }) => {
      const designer = await openDesigner(page, '?cee=stub');
      await applyPreset(page, 'modular');
      const artifact = source('number', depth);
      let container = artifact;
      for (let level = 1; level <= depth; level++) container = child(container, `Level ${level}`);
      container._annotations = { source: { '@id': 'https://' } };
      await load(page, artifact);
      await expect.poll(async () => (await report(page)).issues.length).toBe(2);
      await designer.locator('.validation-summary summary').click();
      for (const setting of repairFirst === 'annotation'
        ? ['annotations', 'defaultValue']
        : ['defaultValue', 'annotations']) {
        const index = (await report(page)).issues.findIndex((issue) => issue.setting === setting);
        await designer.locator('.validation-summary button').nth(index).click();
        if (setting === 'defaultValue')
          await designer
            .locator('app-field-card')
            .getByRole('textbox', { name: 'Default value', exact: true })
            .fill('50');
        else {
          const panel = designer.getByRole('tabpanel', { name: 'Annotations', exact: true });
          await expect(panel.getByText('https://', { exact: true })).toBeVisible();
          await panel.getByRole('button', { name: 'Remove annotation 1', exact: true }).click();
        }
      }
      await expect.poll(async () => (await report(page)).canSave).toBe(true);
      await expect(designer.locator('.outline-row.invalid')).toHaveCount(0);
    });
  }
