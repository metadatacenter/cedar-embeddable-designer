import { expect, test, type Locator } from '@playwright/test';
import { currentTemplate, openDesigner, openSettings } from './support';
import type { CedarEmbeddableDesignerElement as Designer, CedRecoveryDraft } from '../../src/app/ced-public-api';

/**
 * The element's recovery and validation methods, called the way a host calls them.
 *
 * The unit specs call the service behind each method. What only a page can show is the property
 * boundary: a draft that leaves the page as plain data and comes back, a payload the host built,
 * and a reveal that has to reach a control inside the shadow root.
 */
const nameBox = (designer: Locator) => designer.getByRole('textbox', { name: 'Template name', exact: true });

test('captures unfinished work and restores it from plain data', async ({ page }) => {
  const designer = await openDesigner(page);
  await nameBox(designer).fill('Working template');
  const constraints = await openSettings(designer.locator('app-field-card').first());
  await constraints.locator('input[name=regex]').fill('[unclosed');
  await expect(constraints.getByRole('alert')).toBeVisible();
  const accepted = await currentTemplate(page);

  // The draft leaves the page as JSON, as a host would keep it, and comes back the same way.
  const draft: CedRecoveryDraft = JSON.parse(
    await designer.evaluate((node) => JSON.stringify((node as unknown as Designer).captureDraft())),
  );
  await designer.evaluate((node) => (node as unknown as Designer).newArtifact('template'));
  await expect(nameBox(designer)).toHaveValue('');
  await designer.evaluate((node, saved) => (node as unknown as Designer).restoreDraft(saved), draft);

  await expect(nameBox(designer)).toHaveValue('Working template');
  const restored = await openSettings(designer.locator('app-field-card').first());
  await expect(restored.locator('input[name=regex]')).toHaveValue('[unclosed');
  await expect(restored.getByRole('alert')).toBeVisible();
  await expect
    .poll(() =>
      designer.evaluate((node) => {
        const element = node as unknown as Designer;
        return [element.canSave, element.isDirty];
      }),
    )
    .toEqual([false, true]);
  // The unfinished pattern is input, not content: the restored artifact is the one accepted before.
  expect(await currentTemplate(page)).toEqual(accepted);
});

test("judges a host's payload and reveals a host finding through the element's methods", async ({ page }) => {
  const designer = await openDesigner(page);
  await nameBox(designer).fill('Study');
  const open = await currentTemplate(page);

  const [own, merged] = await designer.evaluate((node) => {
    const element = node as unknown as Designer;
    const artifact = element.currentArtifact as Parameters<Designer['validateArtifact']>[0];
    // A retained `_ui.pages` is what a host's merged payload can carry and the server refuses.
    const withPages = { ...artifact, _ui: { ...(artifact['_ui'] as object), pages: [] } };
    return [element.validateArtifact(artifact), element.validateArtifact(withPages)];
  });
  expect(own.canSave).toBe(true);
  expect(merged.canSave).toBe(false);
  expect(merged.findings.map((finding) => finding.path)).toContainEqual(expect.stringMatching(/^\/_ui\/pages/));
  expect(await currentTemplate(page)).toEqual(open);

  const location = '/properties/Title/_valueConstraints/regex';
  await designer.evaluate((node, at) => {
    (node as unknown as Designer).validationFindings = [
      { location: at, message: 'Review this pattern', severity: 'error' },
    ];
  }, location);
  const reveal = (at: string) =>
    designer.evaluate((node, target) => (node as unknown as Designer).revealValidationFinding(target), at);
  expect(await reveal('/properties/Absent')).toBe(false);
  expect(await reveal(location)).toBe(true);
  await expect(designer.locator('input[name=regex]')).toBeFocused();
  await expect(designer.locator('app-field-settings').first().getByRole('alert')).toContainText('Review this pattern');
  expect(await currentTemplate(page)).toEqual(open);
});
