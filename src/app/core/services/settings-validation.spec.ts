import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { findContainer } from '../model/container-draft';

describe('settings validation report', () => {
  let service: TemplateService;
  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(TemplateService);
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
    expect(other.validationReport().valid).toBe(true);
    service.loadTemplate(original);
    expect(service.validationReport().valid).toBe(true);
    service.setSettingsError(service.fields()[0].id, 'defaultValue', 'Invalid default.');
    service.resetTemplate();
    expect(service.validationReport().valid).toBe(true);
  });
});
