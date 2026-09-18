import { TestBed } from '@angular/core/testing';
import { FieldSettingsComponent } from './field-settings.component';
import { TemplateService } from '../../core/services/template.service';
import { readContainer } from '../../core/model/cedar-template';

it('edits field identifier and preferred name, retains them on reload, and permits clearing', async () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
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
  await edit('preferredLabel', 'Study subject');
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
  await edit('preferredLabel', '');
  expect(service.fields()[0].schemaIdentifier).toBeUndefined();
  expect(service.fields()[0].preferredLabel).toBeUndefined();
});
