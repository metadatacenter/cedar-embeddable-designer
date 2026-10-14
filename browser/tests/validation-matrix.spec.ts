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

// Read-only findings remain inspectable without inline authoring markers.
test('a read-only designer marks none of the problems its report lists', async ({ page }) => {
  const designer = await openDesigner(page, '?cee=stub');
  await applyPreset(page, 'modular');
  const setReadOnly = (value: boolean) =>
    page.evaluate((value) => {
      (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).readOnly = value;
    }, value);
  await setReadOnly(true);
  await load(page, source('number', 1));
  await expect.poll(async () => (await report(page)).issues.length).toBe(1);
  expect(await report(page)).toMatchObject({ canSave: false, issues: [{ setting: 'defaultValue', shown: true }] });
  const markers = designer.locator(
    '.outline-row.invalid, .field-drag-container.invalid, .validation-badge, .has-errors, .ced-field-error',
  );
  await expect(markers).toHaveCount(0);
  await expect(designer.locator('.validation-summary')).toContainText('Validation issues (1)');
  // Editable again, the designer points at the same problem.
  await setReadOnly(false);
  await expect(designer.locator('.validation-summary')).toHaveCount(1);
  await expect(designer.locator('.outline-row.invalid')).toHaveCount(2);
});

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

for (const kind of ['template', 'element'] as const)
  for (const mode of ['host', 'published'] as const)
    for (const depth of [0, 3])
      for (const width of [375, 1280]) {
        test(`read-only report: ${kind}, ${mode}, depth ${depth}, width ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 1000 });
          const designer = await openDesigner(page, '?cee=stub');
          const artifact = source('number', depth, kind);
          if (mode === 'published') artifact['bibo:status'] = 'bibo:published';
          await load(page, artifact);
          if (mode === 'host')
            await designer.evaluate((el: any) => {
              el.readOnly = true;
            });
          const findings = await report(page);
          const summary = designer.locator('.validation-summary');
          await expect(summary).toContainText('Validation issues (1)');
          const before = await page.evaluate(() => (window as any).__events);
          await expect(summary).not.toHaveAttribute('open');
          await expect(summary).toHaveCSS('background-color', 'rgb(244, 246, 246)');
          if (depth) await clickCentred(designer.locator('.element-toggle[aria-label="Collapse Level 1"]'));
          await summary.locator('summary').focus();
          await page.keyboard.press('Enter');
          const link = summary.getByRole('button');
          await expect(link).toHaveCount(1);
          await link.focus();
          await page.keyboard.press('Enter');
          const card = designer.locator('app-field-card');
          await expect(card.getByRole('tabpanel', { name: 'Constraints', exact: true })).toBeVisible();
          await expect(card.getByRole('tab', { name: 'Constraints', exact: true })).toBeFocused();
          await expect(card.getByRole('textbox', { name: 'Field display name', exact: true })).toBeDisabled();
          await expect(
            designer.locator(
              '.outline-row.invalid, .field-drag-container.invalid, .validation-badge, .has-errors, .ced-field-error:visible, [aria-invalid="true"]',
            ),
          ).toHaveCount(0);
          expect(await page.evaluate(() => (window as any).__events)).toEqual(before);
          expect(await report(page)).toEqual(findings);
          expect(await designer.evaluate((el: any) => el.isDirty)).toBe(false);
          await summary.locator('summary').click();
          await expect(summary).not.toHaveAttribute('open');
          await summary.locator('summary').click();
          if (kind === 'template' && mode === 'host' && depth === 0)
            await page.screenshot({ path: `/tmp/ced-inspection-report-${width}.png` });
          // A replacement with no findings removes the disclosure.
          const valid = structuredClone(artifact) as any;
          let parent = valid;
          for (let level = 1; level <= depth; level++) parent = child(parent, `Level ${level}`);
          delete (child(parent, 'Value')._valueConstraints as any).defaultValue;
          await load(page, valid);
          await expect(summary).toHaveCount(0);
        });
      }

test('read-only standalone report includes untouched names without revealing editable errors', async ({ page }) => {
  await page.goto('/field-host.html');
  await page.waitForFunction(() => typeof (document.getElementById('field') as any)?.newArtifact === 'function');
  const field = page.locator('#field');
  await field.evaluate((el: any) => {
    el.newArtifact('text');
    el.readOnly = true;
  });
  const before = await field.evaluate((el: any) => ({ artifact: el.currentArtifact, report: el.validate() }));
  expect(before.report.issues).toHaveLength(1);
  expect(before.report.issues[0].shown).toBe(false);
  const summary = field.locator('.validation-summary');
  await expect(summary).toContainText('Validation issues (1)');
  await summary.locator('summary').click();
  await summary.getByRole('button').click();
  await expect(field.locator('app-field-card')).toBeFocused();
  expect(await field.evaluate((el: any) => ({ artifact: el.currentArtifact, report: el.validate() }))).toEqual(before);
  await field.evaluate((el: any) => {
    el.language = 'hu';
  });
  await expect(summary).toContainText('Ellenőrzési problémák (1)');
  await field.evaluate((el: any) => {
    el.readOnly = false;
  });
  await expect(summary).toHaveCount(0);
});
