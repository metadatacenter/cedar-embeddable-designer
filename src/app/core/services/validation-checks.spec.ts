import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';

describe('asynchronous validation lifetime matrix', () => {
  for (const setting of ['defaultValue', 'controlledTerms']) {
    for (const transition of ['rename', 'valid-setting', 'rejected-setting', 'raw-input', 'delete', 'load', 'reset']) {
      it(`${setting}: start → ${transition} → stale response → fresh check`, () => {
        const service = TestBed.inject(TemplateService);
        service.templateName.set('Study');
        const saved = service.templateJson();
        const id = service.fields()[0].id;
        const check = service.validation.beginCheck(id, setting, 'Checking');
        expect(check.active()).toBe(true);
        expect(service.validationReport().canSave).toBe(false);
        if (transition === 'rename') service.updateFieldName(id, 'Renamed');
        if (transition === 'valid-setting') service.updateFieldSettings(id, { schemaIdentifier: 'other' });
        if (transition === 'rejected-setting')
          service.updateFieldSettings(id, { minItems: 3, maxItems: 1, allowMultiple: true });
        if (transition === 'raw-input')
          service.validation.setInputError(id, 'defaultValue', 'Incomplete', 'Constraints', '1e');
        if (transition === 'delete') service.deleteField(id);
        if (transition === 'load') service.loadTemplate(saved);
        if (transition === 'reset') service.resetTemplate();
        expect(check.active()).toBe(false);
        expect(check.signal.aborted).toBe(true);
        expect(service.validationReport().issues.some((issue) => issue.message === 'Checking')).toBe(false);
        const nextId = service.fields()[0].id;
        const next = service.validation.beginCheck(nextId, setting, 'New check');
        check.cancel();
        expect(next.active()).toBe(true);
        next.cancel();
        expect(service.validationReport().issues.some((issue) => issue.message === 'New check')).toBe(false);
      });
    }
    it(`${setting}: unrelated edit preserves check, replacement supersedes it, cancellation cannot clear a newer check`, () => {
      const service = TestBed.inject(TemplateService);
      service.templateName.set('Study');
      const id = service.fields()[0].id;
      const first = service.validation.beginCheck(id, setting, 'First');
      service.updateFieldName(service.fields()[1].id, 'Other field');
      expect(first.active()).toBe(true);
      expect(first.signal.aborted).toBe(false);
      const second = service.validation.beginCheck(id, setting, 'Second');
      expect(first.active()).toBe(false);
      expect(first.signal.aborted).toBe(true);
      first.cancel();
      expect(second.active()).toBe(true);
      expect(second.signal.aborted).toBe(false);
      second.cancel();
      expect(service.validationReport().canSave).toBe(true);
    });
  }
});

it('an in-flight editing intent is dirty until cancellation restores the saved state', () => {
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  service.markSaved();
  const ticket = service.validation.beginCheck(service.fields()[0].id, 'defaultValue', 'Checking');
  expect(service.isDirty()).toBe(true);
  ticket.cancel();
  expect(service.isDirty()).toBe(false);
});
