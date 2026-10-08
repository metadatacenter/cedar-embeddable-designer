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

describe('the Configuration tab', () => {
  const panel = (fixture: { nativeElement: HTMLElement }) =>
    fixture.nativeElement.querySelector<HTMLElement>('[role="tabpanel"][id$="-Configuration"]');
  const control = (fixture: { nativeElement: HTMLElement }, name: string) =>
    panel(fixture)?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`) ?? null;
  const create = (type: string) => {
    localStorage.clear();
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
    service.addField(type, 0);
    const fixture = TestBed.createComponent(FieldSettingsComponent);
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
    return { service, fixture };
  };
  const refresh = async (service: TemplateService, fixture: ReturnType<typeof create>['fixture']): Promise<void> => {
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('comes first and holds the requirement, key, description, multiplicity, bounds and line placement', async () => {
    const { service, fixture } = create('text');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.tabs[0]).toBe('Configuration');
    expect(fixture.componentInstance.selectedTab).toBe('Configuration');
    const names = [
      'shownName',
      'shownDescription',
      'requirement',
      'hidden',
      'continue',
      'allowMultiple',
      'deploymentName',
      'min',
      'max',
    ];
    // In the order the panel sets them out.
    expect(
      [...panel(fixture)!.querySelectorAll<HTMLInputElement>('[name]')]
        .map((node) => node.name)
        .filter((name) => names.includes(name)),
    ).toEqual(names);
    expect(fixture.componentInstance.tabs).not.toContain('Occurrences');
    expect(control(fixture, 'min')!.disabled).toBe(true);
    expect(control(fixture, 'max')!.disabled).toBe(true);
    service.toggleAllowMultiple(service.fields()[0].id);
    await refresh(service, fixture);
    expect(control(fixture, 'min')!.disabled).toBe(false);
    expect(control(fixture, 'max')!.disabled).toBe(false);
    const display = fixture.nativeElement.querySelector('[role="tabpanel"][id$="-Display"]') as HTMLElement;
    expect(display.querySelector('[name="hidden"], [name="continue"], [name="shownName"]')).toBeNull();
    expect(display.querySelector('[name="name"]')).not.toBeNull();
    const metadata = fixture.nativeElement.querySelector('[role="tabpanel"][id$="-Field-metadata"]') as HTMLElement;
    expect(metadata.querySelector('[name="deploymentName"], app-property-picker')).toBeNull();
  });

  it('offers a static field only its display name and description, key and Hidden', () => {
    const { fixture } = create('richText');
    expect(control(fixture, 'shownName')).not.toBeNull();
    expect(control(fixture, 'deploymentName')).not.toBeNull();
    expect(control(fixture, 'shownDescription')).not.toBeNull();
    expect(control(fixture, 'hidden')).not.toBeNull();
    for (const name of ['requirement', 'allowMultiple', 'min', 'max', 'continue'])
      expect(control(fixture, name), name).toBeNull();
  });

  it('enables the bounds of a type that is always multiple, without an Allow multiple control', () => {
    const { fixture } = create('multipleChoiceList');
    expect(control(fixture, 'allowMultiple')).toBeNull();
    expect(control(fixture, 'min')!.disabled).toBe(false);
  });

  it('holds an attribute-value minimum at 0 unless a stated one must be cleared', async () => {
    const { service, fixture } = create('attributeValue');
    await refresh(service, fixture);
    expect(control(fixture, 'min')!.disabled).toBe(true);
    expect(control(fixture, 'max')!.disabled).toBe(false);
    // A panel opened on a field already stating a higher minimum leaves it open to be cleared.
    service.updateFieldSettings(service.fields()[0].id, { minItems: 2 });
    const stated = TestBed.createComponent(FieldSettingsComponent);
    stated.componentRef.setInput('field', service.fields()[0]);
    await refresh(service, stated);
    expect(control(stated, 'min')!.disabled).toBe(false);
    stated.componentInstance.min = 0;
    stated.componentInstance.saveBounds();
    await refresh(service, stated);
    expect(control(stated, 'min')!.disabled).toBe(true);
  });

  it('hides the requirement and Allow multiple where the profile does, and the bounds of a single field', async () => {
    const { service, fixture } = create('text');
    service.updatePreference('showRequired', false);
    service.updatePreference('showAllowMultiple', false);
    await refresh(service, fixture);
    for (const name of ['requirement', 'allowMultiple', 'min', 'max']) expect(control(fixture, name), name).toBeNull();
    service.toggleAllowMultiple(service.fields()[0].id);
    await refresh(service, fixture);
    expect(control(fixture, 'min')!.disabled).toBe(false);
  });

  it('is absent from a field edited as a document of its own', () => {
    const service = TestBed.inject(TemplateService);
    service.fieldDocumentMode.set(true);
    const fixture = TestBed.createComponent(FieldSettingsComponent);
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
    expect(fixture.componentInstance.tabs).not.toContain('Configuration');
    expect(fixture.componentInstance.selectedTab).toBe('Display');
    expect(panel(fixture)).toBeNull();
  });
});

it('edits one description from Configuration and from Display while the field is a draft', async () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  const fixture = TestBed.createComponent(FieldSettingsComponent);
  const render = async () => {
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await render();
  const input = (tab: string, name: string) =>
    fixture.nativeElement.querySelector(`[role="tabpanel"][id$="-${tab}"] input[name="${name}"]`) as HTMLInputElement;
  const type = async (control: HTMLInputElement, value: string) => {
    control.value = value;
    control.dispatchEvent(new Event('input'));
    await render();
  };
  await type(input('Configuration', 'shownDescription'), 'Shown help');
  expect(service.fields()[0].helpText).toBe('Shown help');
  expect(input('Display', 'helpText').value).toBe('Shown help');
  await type(input('Display', 'helpText'), 'Own help');
  expect(input('Configuration', 'shownDescription').value).toBe('Own help');
  await type(input('Display', 'name'), 'Study title');
  expect(input('Configuration', 'shownName').value).toBe('Study title');
});
