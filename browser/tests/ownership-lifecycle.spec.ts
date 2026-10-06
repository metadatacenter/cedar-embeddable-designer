import { expect, test } from '@playwright/test';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';
import { addElementFixture, applyPreset, currentTemplate, openDesigner } from './support';

for (const channel of ['load', 'getter', 'event'] as const)
  test(`host mutation through ${channel} cannot modify the live designer`, async ({ page }) => {
    const designer = await openDesigner(page);
    await designer.getByPlaceholder('Template name').fill('Study');
    const result = await page.evaluate(async (channel) => {
      const designer = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
      const source = designer.currentArtifact!;
      const expected = structuredClone(source);
      const mutate = (artifact: object) => {
        const value = artifact as Record<string, any>;
        value['schema:name'] = 'Host mutation';
        value._ui.order.length = 0;
      };
      if (channel === 'event') {
        designer.addEventListener('artifactChange', (event) => mutate((event as CustomEvent).detail), { once: true });
      }
      designer.loadArtifact(source);
      if (channel === 'load') mutate(source);
      if (channel === 'getter') mutate(designer.currentArtifact!);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return { expected, actual: designer.currentArtifact, dirty: designer.isDirty, canSave: designer.canSave };
    }, channel);
    expect(result.actual).toEqual(result.expected);
    expect(result.dirty).toBe(false);
    expect(result.canSave).toBe(true);
  });

for (const correction of ['clear', 'correct'] as const)
  test(`element occurrence controls retain malformed input across tab changes until ${correction}`, async ({
    page,
  }) => {
    const designer = await openDesigner(page);
    await designer.getByPlaceholder('Template name').fill('Study');
    await applyPreset(page, 'modular');
    await addElementFixture(page, designer);
    const settings = designer.locator('app-element-card').first();
    await settings.getByRole('button', { name: 'Expand element settings', exact: true }).click();
    await expect(settings.getByRole('tabpanel', { name: 'Configuration', exact: true })).toBeVisible();
    await settings.getByLabel('Allow multiple', { exact: true }).check();
    const min = settings.getByLabel('Minimum occurrences', { exact: true });
    const max = settings.getByLabel('Maximum occurrences', { exact: true });
    await max.fill('100');
    await max.fill('');
    await max.pressSequentially('1e');
    await expect.poll(() => max.evaluate((input: HTMLInputElement) => input.validity.badInput)).toBe(true);
    await expect(settings.getByRole('alert')).toBeVisible();
    await settings.getByRole('tab', { name: 'Display', exact: true }).click();
    await expect(max).toBeHidden();
    await settings.getByRole('tab', { name: 'Configuration', exact: true }).click();
    await expect(max).toHaveValue('');
    await min.fill('1');
    await expect(settings.getByRole('alert')).toBeVisible();
    const canSave = () =>
      page.evaluate(
        () => (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).canSave,
      );
    await expect.poll(canSave).toBe(false);
    // A number control exposes malformed input as an empty value.
    await max.fill(correction === 'correct' ? '200' : '');
    if (correction === 'clear') await max.dispatchEvent('input');
    await expect(settings.getByRole('alert')).toHaveCount(0);
    await expect.poll(canSave).toBe(true);
    const artifact = await currentTemplate(page);
    const placement = (artifact.properties as Record<string, Record<string, unknown>>).Element;
    expect(placement.minItems).toBe(1);
    expect(placement.maxItems).toBe(correction === 'correct' ? 200 : undefined);
  });
