import { TestBed } from '@angular/core/testing';
import { FieldSettingsComponent } from './field-settings.component';
import { TemplateService } from '../../core/services/template.service';
import { readContainer } from '../../core/model/cedar-template';

it('restores incomplete numeric settings without showing the accepted bound or clearing it on another edit', () => {
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  service.addField('number', 0);
  const id = service.fields()[0].id;
  service.updateFieldName(id, 'Number');
  service.updateFieldSettings(id, {
    numeric: { type: 'xsd:decimal', min: 0, max: 100, decimalPlaces: null, unit: null },
  });
  const create = () => {
    const fixture = TestBed.createComponent(FieldSettingsComponent);
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
    return fixture;
  };
  const first = create();
  const input = first.nativeElement.querySelector('[name=numericMax]') as HTMLInputElement;
  Object.defineProperty(input, 'validity', { value: { badInput: true } });
  first.componentInstance.numeric.max = null;
  first.componentInstance.saveNumeric(input.form!, 'numericMax');
  first.destroy();
  const restored = create();
  const panel = restored.componentInstance;
  expect(panel.numeric.max).toBeNull();
  expect(service.fields()[0].numeric?.max).toBe(100);
  expect(service.validationReport().canSave).toBe(false);
  panel.numeric.unit = 'mg';
  panel.saveNumeric(undefined, 'unit');
  expect(service.validationReport().canSave).toBe(false);
  expect(service.fields()[0].numeric?.unit).toBeNull();
  panel.numeric.max = 200;
  panel.saveNumeric(undefined, 'numericMax');
  expect(service.fields()[0].numeric).toMatchObject({ max: 200, unit: 'mg' });
  expect(service.validationReport().canSave).toBe(true);
});

it('edits identifier and key while preserving a hidden preferred label', async () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  service.updateFieldSettings(service.fields()[0].id, { preferredLabel: 'Study subject' });
  const fixture = TestBed.createComponent(FieldSettingsComponent);
  fixture.componentRef.setInput('field', service.fields()[0]);
  fixture.detectChanges();
  await fixture.whenStable();
  const edit = async (name: string, value: string) => {
    const input = fixture.nativeElement.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await edit('schemaIdentifier', 'local field 42');
  await edit('deploymentName', 'subject');
  expect(fixture.nativeElement.querySelector('input[name="preferredLabel"]')).toBeNull();
  const field = service.fields()[0];
  expect(field.schemaIdentifier).toBe('local field 42');
  expect(field.preferredLabel).toBe('Study subject');
  expect(field.displayLabel).toBeUndefined();
  const restored = readContainer(service.templateJson()).children[0];
  expect(restored.kind).toBe('field');
  if (restored.kind === 'field') {
    expect(restored.definition.schemaIdentifier).toBe('local field 42');
    expect(restored.definition.preferredLabel).toBe('Study subject');
  }
  await edit('schemaIdentifier', '');
  expect(service.fields()[0].deploymentName).toBe('subject');
  expect(service.fields()[0].schemaIdentifier).toBeUndefined();
  expect(service.fields()[0].preferredLabel).toBe('Study subject');
});
