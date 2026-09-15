import { test, expect } from '@playwright/test';
import { openDesigner, currentTemplate, applyPreset } from './support';

test('template settings preserve header, footer and multiple types, and element types are independent', async ({page}) => {
  const designer = await openDesigner(page, '?picker=stub');
  const settings = designer.locator('app-container-settings').first();
  await expect(settings.getByRole('tab')).toHaveCount(0);
  await settings.getByRole('button', {name: 'Expand template settings'}).click();
  await expect(settings.getByRole('tab')).toHaveText(['Display', 'Annotations', 'Template Metadata']);
  await settings.getByLabel('Header', {exact:true}).fill('Read before entering data');
  await settings.getByLabel('Footer', {exact:true}).fill('Thank you');
  await settings.getByRole('tab', {name: 'Template Metadata'}).click();
  await settings.getByRole('button', {name: 'Edit types'}).click();
  const picker = page.locator('cedar-embeddable-term-picker');
  expect(await picker.evaluate((p:any) => ({types:p.termTypes, max:p.maximumTerms}))).toEqual({types:['class'], max:undefined});
  const pick = async (iris:string[]) => picker.evaluate((p, iris) => p.dispatchEvent(new CustomEvent('constraintsSelected', {detail:{constraints:iris.map((iri,i) => ({sourceType:'ontology-term', termType:'OntologyClass', sourceId:iri, sourceName:'Class '+i, ontologyId:'TEST'})),actions:[]}})), iris);
  await pick(['urn:one','urn:two']);
  let artifact:any = await currentTemplate(page);
  expect(artifact._ui.header).toBe('Read before entering data');
  expect(artifact._ui.footer).toBe('Thank you');
  expect(artifact.properties['@type'].oneOf[0].enum).toEqual(['urn:one','urn:two']);
  await settings.getByRole('button', {name: 'Edit types'}).click();
  expect(await picker.evaluate((p:any) => p.constraintSet.constraints.length)).toBe(2);
  await picker.evaluate(p => p.dispatchEvent(new CustomEvent('cancelled')));
  await applyPreset(page,'modular');
  await designer.getByRole('button',{name:'Add Element',exact:true}).click();
  const element = designer.locator('app-element-card').first();
  await element.getByRole('button',{name:'Expand element settings'}).click();
  await element.getByRole('tab',{name:'Element metadata',exact:true}).click();
  await element.getByRole('button',{name:'Edit types'}).click();
  await pick(['urn:element-one','urn:element-two']);
  artifact = await currentTemplate(page);
  expect(artifact.properties.Element.properties['@type'].oneOf[0].enum).toEqual(['urn:element-one','urn:element-two']);
  expect(artifact.properties['@type'].oneOf[0].enum).toEqual(['urn:one','urn:two']);
  await page.evaluate(artifact => { (document.querySelector('cedar-embeddable-designer') as any).artifact=artifact; },artifact);
  expect(await currentTemplate(page)).toEqual(artifact);
  if (await settings.getByRole('button', {name: 'Expand template settings'}).count()) {
  await settings.getByRole('button', {name: 'Expand template settings'}).click();
  }
  await settings.getByRole('tab', {name: 'Template Metadata'}).click();
  await settings.getByRole('button', {name: 'Edit types'}).click();
  await pick([]);
  expect((await currentTemplate(page) as any).properties['@type'].oneOf[0]).not.toHaveProperty('enum');
});
