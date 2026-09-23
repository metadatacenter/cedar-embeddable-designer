import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { findContainer } from '../model/container-draft';

describe('settings validation report', () => {
  let service: TemplateService;
  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(TemplateService);
    service.templateName.set('Test template');
  });
  it('reports independent pending settings without changing the exported model', () => {
    const id = service.fields()[0].id;
    const saved = service.templateJson();
    expect(service.validationReport().canSave).toBe(true);
    service.setSettingsError(id, 'defaultValue', 'Default exceeds maximum.');
    service.setSettingsError(id, 'occurrences', 'Minimum exceeds maximum.', 'Occurrences');
    expect(service.validationReport().issues).toHaveLength(2);
    expect(service.validationReport().canSave).toBe(false);
    expect(service.templateJson()).toEqual(saved);
    service.setSettingsError(id, 'defaultValue', null);
    expect(service.validationReport().issues[0].setting).toBe('occurrences');
    service.setSettingsError(id, 'occurrences', null);
    expect(service.validationReport().valid).toBe(true);
  });
  it('aggregates nested errors, expands ancestors and ignores deleted nodes', () => {
    const root = service.session.document().id;
    service.addElement(root);
    const element = service.session.document().children.find((node) => node.kind === 'element')!;
    service.addField('text', 0, element.id);
    const id = findContainer(service.session.document(), element.id)!.children[0].id;
    service.updateContainerDefinition(element.id, { name: 'Element' });
    service.updateFieldName(id, 'Field');
    service.setSettingsError(id, 'defaultValue', 'Invalid default.');
    expect(service.issuesFor(element.id)).toHaveLength(1);
    expect(service.validationReport().issues[0].path).toEqual([root, element.id, id]);
    service.toggleElement(element.id);
    service.revealIssue(service.validationReport().issues[0]);
    expect(service.collapsedElements().has(element.id)).toBe(false);
    expect(service.selectedField()).toBe(id);
    service.deleteField(id);
    expect(service.validationReport().valid).toBe(true);
  });
  it('validates the model even if no settings panel has opened', () => {
    service.fields.update((fields) =>
      fields.map((field, i) =>
        i === 0
          ? {
              ...field,
              textConstraints: { minLength: 8, maxLength: 2, regex: null },
            }
          : field,
      ),
    );
    expect(service.validationReport().valid).toBe(false);
    expect(service.validationReport().issues[0].nodeId).toBe(service.fields()[0].id);
    expect(service.validationReport().issues[0].source).toBe('model');
  });
  it('attributes invalid occurrence settings to the field even with no panel mounted', () => {
    service.fields.update((fields) =>
      fields.map((field, index) =>
        index === 0
          ? {
              ...field,
              allowMultiple: true,
              minItems: 5,
              maxItems: 2,
            }
          : field,
      ),
    );
    expect(service.validationReport().issues[0].nodeId).toBe(service.fields()[0].id);
    expect(service.validationReport().canSave).toBe(false);
  });
  it('isolates designers and clears pending errors on document replacement', () => {
    const id = service.fields()[0].id;
    const original = service.templateJson();
    service.setSettingsError(id, 'defaultValue', 'Invalid default.');
    const other = TestBed.runInInjectionContext(() => new TemplateService());
    expect(other.validationReport().canSave).toBe(false);
    other.templateName.set('Other template');
    expect(other.validationReport().valid).toBe(true);
    service.loadTemplate(original);
    expect(service.validationReport().valid).toBe(true);
    service.setSettingsError(service.fields()[0].id, 'defaultValue', 'Invalid default.');
    service.resetTemplate();
    expect(service.validationReport().issues.map((issue) => issue.setting)).toEqual(['name']);
  });
});

describe('required artifact names', () => {
  it('rejects empty and whitespace names through the entire nested document and recovers', () => {
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Template');
    const root = service.session.document().id;
    service.addElement(root);
    const element = service.session.document().children.find((node) => node.kind === 'element')!;
    service.addField('text', 0, element.id);
    const field = findContainer(service.session.document(), element.id)!.children[0];
    for (const blank of ['', '  \t ']) {
      service.updateContainerDefinition(root, { name: blank });
      service.updateContainerDefinition(element.id, { name: blank });
      service.updateFieldName(field.id, blank);
      const report = service.validationReport();
      expect(report.canSave).toBe(false);
      expect(report.issues.filter((issue) => issue.setting === 'name').map((issue) => issue.nodeId)).toEqual([
        root,
        element.id,
        field.id,
      ]);
      expect(report.issues.find((issue) => issue.nodeId === field.id)?.path).toEqual([root, element.id, field.id]);
      expect(() => service.templateJson()).not.toThrow();
    }
    service.updateContainerDefinition(root, { name: 'Template' });
    service.updateContainerDefinition(element.id, { name: 'Element' });
    service.updateFieldName(field.id, 'Field');
    expect(service.validationReport().canSave).toBe(true);
  });
});

it('keeps unnamed siblings independent and editable while saving is disabled', () => {
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  service.addField('text', 0);
  service.addField('text', 1);
  const [first, second] = service.children();
  expect(first.definition.name).toBe('');
  expect(second.definition.name).toBe('');
  expect(first.id).not.toBe(second.id);
  expect(service.validationReport().canSave).toBe(false);
  expect(service.visibleIssues()).toHaveLength(0);
  service.touchName(first.id);
  expect(service.visibleIssues().map((issue) => issue.nodeId)).toEqual([first.id]);
  service.moveChild(second.id, service.document().id, 0);
  expect(service.children()[0].id).toBe(second.id);
  service.updateFieldName(first.id, 'First');
  service.updateFieldName(second.id, 'Second');
  expect(service.validationReport().canSave).toBe(true);
  const element = service.addElement(service.document().id);
  expect(findContainer(service.document(), element)!.name).toBe('');
  expect(service.updateElementPlacement(element, { allowMultiple: true, minItems: 0 })).toBeNull();
  expect(service.validationReport().canSave).toBe(false);
  service.updateContainerDefinition(element, { name: 'Details' });
  expect(service.validationReport().canSave).toBe(true);
});

it('keys are unique across sibling fields and elements, independently of names and display labels', () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  const [first, second] = service.fields();
  service.updateFieldName(second.id, first.name);
  expect(service.childKey(first.id)).toBe('Title');
  expect(service.childKey(second.id)).toBe('Title 2');
  expect(service.updateFieldSettings(first.id, { deploymentName: 'subject', displayLabel: 'Label' })).toBeNull();
  expect(service.updateFieldSettings(second.id, { deploymentName: 'subject' })).toContain('already uses');
  expect(service.updateFieldSettings(second.id, { deploymentName: '   ' })).toBe('Key is required.');
  expect(service.updateFieldSettings(second.id, { deploymentName: 'other', displayLabel: 'Label' })).toBeNull();
  const root = service.document().id;
  service.addElement(root);
  const element = service.document().children.find((node) => node.kind === 'element')!;
  service.updateContainerDefinition(element.id, { name: first.name });
  expect(service.updateElementPlacement(element.id, { deploymentName: 'subject', allowMultiple: false })).toContain(
    'already uses',
  );
  expect(service.updateElementPlacement(element.id, { deploymentName: 'nested', allowMultiple: false })).toBeNull();
  service.addField('text', 0, element.id);
  const nested = findContainer(service.document(), element.id)!.children[0];
  service.updateFieldName(nested.id, first.name);
  expect(service.updateFieldSettings(nested.id, { deploymentName: 'subject' })).toBeNull();
  service.updateFieldName(first.id, 'Renamed');
  expect(service.childKey(first.id)).toBe('subject');
  service.loadTemplate(service.templateJson());
  expect(service.document().children.map((node) => node.placement.deploymentName)).toContain('subject');
});

it('generates lowercase sibling-unique keys for newly named fields and preserves explicit keys', () => {
  const service = TestBed.inject(TemplateService);
  const root = service.document().id;
  service.addField('text', 0, root);
  const first = service.document().children[0].id;
  service.updateFieldName(first, 'Sample Name');
  expect(service.childKey(first)).toBe('sample_name');
  service.addField('text', 1, root);
  const second = service.document().children[1].id;
  service.updateFieldName(second, 'Sample Name');
  expect(service.childKey(second)).toBe('sample_name_2');
  expect(service.updateFieldSettings(first, { deploymentName: 'custom_key' })).toBeNull();
  service.updateFieldName(first, 'Renamed');
  expect(service.childKey(first)).toBe('custom_key');
  const field = service.fields().find((field) => field.id === first)!;
  expect(field.propertyIri).toMatch(/\/properties\/[0-9a-f]{8}-[0-9a-f-]{27}$/);
});

it('removes only the offset when timezone is disabled on a complete default', () => {
  const service = TestBed.inject(TemplateService);
  service.addField('date', 0);
  const id = service.document().children[0].id;
  service.updateFieldName(id, 'Date');
  const temporal = {
    type: 'xsd:dateTime',
    granularity: 'decimalSecond',
    timezoneEnabled: true,
    inputTimeFormat: '24h',
  } as const;
  expect(
    service.updateFieldSettings(id, {
      temporal,
      defaultValue: { kind: 'temporal', value: '2026-09-08T02:02:02.222-10:00' },
    }),
  ).toBeNull();
  expect(service.updateFieldSettings(id, { temporal: { ...temporal, timezoneEnabled: false } })).toBeNull();
  expect(service.fields().find((field) => field.id === id)?.defaultValue).toEqual({
    kind: 'temporal',
    value: '2026-09-08T02:02:02.222',
  });
});

it('accepts reduced numeric precision and truncates defaults and bounds together', () => {
  const service = TestBed.inject(TemplateService);
  service.addField('number', 0);
  const id = service.document().children[0].id;
  service.updateFieldName(id, 'Decimal');
  const numeric = { type: 'xsd:decimal', decimalPlaces: 3, min: -1.239, max: 9.999, unit: null } as const;
  expect(service.updateFieldSettings(id, { numeric, defaultValue: { kind: 'number', value: -1.238 } })).toBeNull();
  expect(service.updateFieldSettings(id, { numeric: { ...numeric, decimalPlaces: 2 } })).toBeNull();
  expect(service.fields().find((field) => field.id === id)).toMatchObject({
    numeric: { decimalPlaces: 2, min: -1.23, max: 9.99 },
    defaultValue: { kind: 'number', value: -1.23 },
  });
});

it.each(['multipleChoice', 'checkboxes', 'singleChoiceList', 'multipleChoiceList'])(
  'an unnamed %s option blocks saving until named or deleted',
  (type) => {
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Choices');
    service.addField(type, 0);
    const id = service.document().children[0].id;
    service.updateFieldName(id, 'Choices');
    service.fields.set(service.fields().map((field) => (field.id === id ? { ...field, options: ['First'] } : field)));
    expect(service.validationReport().canSave).toBe(true);
    service.addOption(id);
    expect(service.validationReport().canSave).toBe(false);
    expect(service.visibleIssuesFor(id)).toContainEqual(
      expect.objectContaining({ setting: 'option-1', tab: 'Constraints' }),
    );
    service.updateOption(id, 1, '   ');
    expect(service.validationReport().canSave).toBe(false);
    service.updateOption(id, 1, 'Second');
    expect(service.validationReport().canSave).toBe(true);
    service.addOption(id);
    service.deleteOption(id, 2);
    expect(service.validationReport().canSave).toBe(true);
  },
);
