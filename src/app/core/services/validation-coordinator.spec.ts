import { TestBed } from '@angular/core/testing';
import { fieldView } from '../model/container-draft';
import { TemplateService } from './template.service';

describe('central editing validation', () => {
  let service: TemplateService;
  beforeEach(() => {
    service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
  });

  it('commits a corrected bound and its pending default together', () => {
    const id = service.fields()[0].id;
    service.updateFieldSettings(id, { textConstraints: { minLength: null, maxLength: 2, regex: null } });
    expect(service.updateDefaultValue(id, { kind: 'literal', value: 'ABC' })).not.toBeNull();
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'none' });
    service.updateFieldSettings(id, { textConstraints: { minLength: null, maxLength: 3, regex: null } });
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'literal', value: 'ABC' });
    expect(service.validationReport()).toMatchObject({ canSave: true, issues: [] });
  });

  it('keeps a rejected bound through another edit and retries it after the default is corrected', () => {
    const id = service.fields()[0].id;
    service.updateDefaultValue(id, { kind: 'literal', value: 'ABC' });
    service.updateFieldSettings(id, { textConstraints: { minLength: null, maxLength: 2, regex: null } });
    service.updateFieldSettings(id, { schemaIdentifier: 'local-identifier' });
    expect(service.fields()[0].textConstraints).toBeUndefined();
    expect(service.editingField(service.fields()[0]).textConstraints?.maxLength).toBe(2);
    expect(service.validationReport().issues.map((issue) => issue.setting)).toEqual(['textConstraints']);
    service.updateDefaultValue(id, { kind: 'literal', value: 'AB' });
    expect(service.fields()[0].textConstraints?.maxLength).toBe(2);
    expect(service.validationReport().canSave).toBe(true);
  });

  it('retains a rejected element bound when a different placement setting succeeds', () => {
    const id = service.addElement(service.document().id);
    service.updateContainerDefinition(id, { name: 'Details' });
    service.updateElementPlacement(id, { allowMultiple: true, minItems: 2 });
    service.updateElementPlacement(id, { allowMultiple: true, minItems: 2, maxItems: 1 });
    service.updateElementPlacement(id, { deploymentName: 'details' }, 'key', 'Element metadata');
    expect(service.validation.changes(id)).toMatchObject({ minItems: 2, maxItems: 1 });
    expect(service.validationReport().issues.map((issue) => issue.setting)).toEqual(['placement']);
    service.updateElementPlacement(id, { allowMultiple: true, minItems: 2, maxItems: 3 });
    expect(service.validationReport().canSave).toBe(true);
    expect(service.document().children.find((node) => node.id === id)?.placement).toMatchObject({
      deploymentName: 'details',
      maxItems: 3,
    });
  });

  it('repairs invalid siblings independently and recovers serialization', () => {
    const source = structuredClone(service.templateJson()) as {
      properties: Record<string, { _ui: object; _valueConstraints: object }>;
    };
    for (const key of ['Title', 'Publication Date']) {
      source['properties'][key]._ui = { inputType: 'textfield' };
      source['properties'][key]._valueConstraints = { minLength: 2, maxLength: 1 };
    }
    service.loadTemplate(source);
    expect(service.previewState().artifact).toBeNull();
    const [first, , last] = service.fields();
    expect(
      service.updateFieldSettings(first.id, { textConstraints: { minLength: 2, maxLength: 3, regex: null } }),
    ).toBeNull();
    expect(service.validationReport().issues.map((issue) => issue.nodeId)).toEqual([last.id]);
    expect(
      service.updateFieldSettings(last.id, { textConstraints: { minLength: 2, maxLength: 3, regex: null } }),
    ).toBeNull();
    expect(service.validationReport().canSave).toBe(true);
    expect(service.previewState().artifact).not.toBeNull();
  });

  it.each(['multipleChoice', 'checkboxes'])('reveals the unfinished %s option when naming finishes', (type) => {
    service.addField(type, 0);
    const id = service.fields()[0].id;
    service.updateFieldDisplayName(id, 'Decision');
    expect(service.visibleIssues()).toEqual([]);
    service.touchName(id);
    expect(service.visibleIssues().map((issue) => issue.setting)).toEqual(['option-0']);
    expect(service.validationReport().canSave).toBe(false);
    service.updateOption(id, 0, 'Yes');
    expect(service.validationReport().canSave).toBe(true);
  });

  it('prunes pending edits when their node is deleted or their setting ceases to apply', () => {
    const id = service.fields()[0].id;
    service.toggleAllowMultiple(id);
    service.updateFieldSettings(id, { minItems: 2, maxItems: 1 });
    service.updateFieldSettings(id, { textConstraints: { minLength: 2, maxLength: 1, regex: null } });
    service.toggleAllowMultiple(id);
    expect(service.validationReport().issues.map((issue) => issue.setting)).toEqual(['textConstraints']);
    service.deleteField(id);
    expect(service.validationReport().canSave).toBe(true);
    expect(service.validation.changes(id)).toEqual({});
  });

  it('copies drafts at submission so controls cannot mutate the validation snapshot', () => {
    const field = service.fields()[0];
    const textConstraints = { minLength: 3, maxLength: 1, regex: null };
    service.updateFieldSettings(field.id, { textConstraints });
    textConstraints.maxLength = 5;
    expect(service.editingField(field).textConstraints?.maxLength).toBe(1);
    service.editingField(field).textConstraints!.maxLength = 8;
    expect(service.editingField(field).textConstraints?.maxLength).toBe(1);
    service.updateFieldSettings(field.id, { schemaIdentifier: 'Other edit' });
    expect(service.validationReport().canSave).toBe(false);
  });

  it.each(['checkboxes', 'multipleChoiceList', 'attributeValue'])(
    'retains occurrence failures for always-multiple %s fields',
    (type) => {
      service.addField(type, 0);
      const field = service.fields()[0];
      service.updateFieldSettings(field.id, { minItems: 2, maxItems: 1 });
      expect(service.validationReport().issues.some((issue) => issue.setting === 'occurrences')).toBe(true);
      service.updateFieldSettings(field.id, { minItems: 2, maxItems: 3 });
      expect(service.validationReport().issues.some((issue) => issue.setting === 'occurrences')).toBe(false);
    },
  );

  it('retries a conflicting property key once its sibling releases it', () => {
    service.addField('text', 0);
    const field = service.fields()[0];
    service.updateFieldDisplayName(field.id, 'Details');
    expect(service.updateFieldSettings(field.id, { deploymentName: 'Title' })).not.toBeNull();
    service.updateFieldSettings(service.fields()[1].id, { deploymentName: 'heading' });
    expect(service.childKey(field.id)).toBe('Title');
    service.updateFieldDisplayName(field.id, 'Renamed');
    expect(service.childKey(field.id)).toBe('Title');
    expect(service.validationReport().canSave).toBe(true);
  });

  it('reports independent occurrence and definition defects on one imported field', () => {
    const id = service.fields()[0].id;
    service.fields.update((fields) =>
      fields.map((field) =>
        field.id === id
          ? {
              ...field,
              allowMultiple: true,
              minItems: 2,
              maxItems: 1,
              textConstraints: { minLength: 2, maxLength: 1, regex: null },
            }
          : field,
      ),
    );
    expect(service.validationReport().issues.map((issue) => issue.setting)).toEqual(['settings', 'occurrences']);
    expect(service.updateFieldSettings(id, { minItems: 2, maxItems: 3 })).toBeNull();
    expect(service.validationReport().issues.map((issue) => issue.setting)).toEqual(['settings']);
    expect(
      service.updateFieldSettings(id, { textConstraints: { minLength: 2, maxLength: 3, regex: null } }),
    ).toBeNull();
    expect(service.validationReport().canSave).toBe(true);
  });

  it('rejects an edit to a removed node without retaining a ghost draft', () => {
    const id = service.fields()[0].id;
    service.deleteField(id);
    expect(service.updateFieldSettings(id, { allowMultiple: true, minItems: 2, maxItems: 1 })).not.toBeNull();
    expect(service.validation.changes(id)).toEqual({});
    expect(service.validationReport().canSave).toBe(true);
  });

  it('keeps parser failures distinct from typed drafts and clears both on load', () => {
    const original = service.templateJson();
    const id = service.fields()[0].id;
    service.updateDefaultValue(id, { kind: 'literal', value: 'ABC' });
    service.updateFieldSettings(id, { textConstraints: { minLength: null, maxLength: 2, regex: null } });
    service.setSettingsError(id, 'textConstraints', 'Incomplete number');
    service.updateDefaultValue(id, { kind: 'literal', value: 'AB' });
    expect(service.validationReport().issues[0].message).toBe('Incomplete number');
    service.loadTemplate(original);
    expect(service.validationReport().canSave).toBe(true);
  });

  it('does not attribute a descendant failure to an element placement edit', () => {
    const id = service.addElement(service.document().id);
    service.updateContainerDefinition(id, { name: 'Details' });
    service.addField('text', 0, id);
    const children = service.session.fieldBinding(id);
    const field = children()[0];
    service.updateFieldName(field.id, 'Child');
    children.update((fields) =>
      fields.map((item) => ({ ...item, textConstraints: { minLength: 3, maxLength: 1, regex: null } })),
    );
    expect(service.updateElementPlacement(id, { allowMultiple: true, minItems: 2 })).toBeNull();
    expect(service.validationReport().issues.every((issue) => issue.nodeId === field.id)).toBe(true);
    const node = service.document().children.find((child) => child.id === id);
    if (node?.kind !== 'element') throw new Error('Missing test element');
    const child = node.definition.children[0];
    expect(child.kind === 'field' && fieldView(child).textConstraints?.maxLength).toBe(1);
  });
});
