import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import nestedTemplate from '../model/fixtures/corpus/template-028.json';
import { parentOf } from '../model/container-draft';

describe('Designer recovery draft', () => {
  let service: TemplateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
  });

  it('restores invalid names and unfinished controls without serializing them as an artifact', () => {
    service.resetTemplate('template', false);
    service.templateName.set('Working template');
    service.addField('text', 0);
    const id = service.selectedField()!;
    service.updateOwnFieldName(id, '');
    service.validation.setInputError(id, 'textConstraints', 'unfinished length', 'Constraints', 'not-a-number');
    const before = service.captureDraft();
    const report = service.validationReport();
    service.resetTemplate('template', false);
    service.validation.setReadOnly(true);
    service.restoreDraft(JSON.parse(JSON.stringify(before)));
    expect(service.templateName()).toBe('Working template');
    expect(service.validation.inputValue(id, 'textConstraints')).toBe('not-a-number');
    expect(service.validationReport().issues).toEqual(report.issues);
    expect(service.validationReport().canSave).toBe(false);
    expect(service.access.hostReadOnly()).toBe(true);
    expect(service.isDirty()).toBe(true);
    service.validation.setReadOnly(false);
    service.addField('text', 1);
    expect(service.selectedField()).not.toBe(id);
    expect(parentOf(service.document(), id)).toBeDefined();
  });

  it('round-trips nested schema content and its clean baseline', () => {
    service.loadTemplate(nestedTemplate);
    const artifact = service.templateJson();
    const draft = service.captureDraft();
    service.resetTemplate('template', false);
    service.restoreDraft(draft);
    expect(service.templateJson()).toEqual(artifact);
    expect(service.isDirty()).toBe(false);
    expect(service.captureDraft()).toEqual(draft);
  });

  it('preserves the current document when imported state or a control address is malformed', () => {
    const before = service.captureDraft();
    const parsed = JSON.parse(before.state);
    const malformed = [
      { ...before, version: 2 },
      { ...before, state: '{' },
      { ...before, state: JSON.stringify({ ...parsed, document: {} }) },
      {
        ...before,
        state: JSON.stringify({
          ...parsed,
          validation: { ...parsed.validation, inputs: { '99999999:numeric': { message: 'bad', tab: 'Constraints' } } },
        }),
      },
    ];
    for (const draft of malformed) {
      expect(() => service.restoreDraft(draft as typeof before)).toThrow();
      expect(service.captureDraft()).toEqual(before);
    }
  });
});
