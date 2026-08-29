import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { templateToJson } from '../model/cedar-template';

/**
 * The service as the rest of the application sees it: one template, built once,
 * and a dirty flag that cannot be forgotten.
 *
 * Both were defects rather than gaps. Four places built the template separately
 * through a serializer that minted fresh identifiers, so the two export panels
 * and the custom element each showed a different artifact for the same editor
 * state. The dirty flag was set in exactly one place — field reordering — so
 * every other edit left the unsaved-changes guard believing there was nothing to
 * lose.
 */
describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
  });

  describe('the template it builds', () => {
    it('is the same artifact on every read', () => {
      expect(JSON.stringify(service.templateJson())).toBe(JSON.stringify(service.templateJson()));
    });

    it('keeps its identifier when the template changes', () => {
      const before = (service.templateJson() as Record<string, unknown>)['@id'];
      service.templateName.set('Renamed');
      const after = (service.templateJson() as Record<string, unknown>)['@id'];

      expect(after).toBe(before);
    });

    it('keeps a field identifier when the template changes', () => {
      const idOf = () => service.fields()[0].atId;
      const before = idOf();
      service.updateFieldName(service.fields()[0].id, 'Renamed');

      expect(idOf()).toBe(before);
    });

    it('gives a new template a new identifier', () => {
      const before = (service.templateJson() as Record<string, unknown>)['@id'];
      service.resetTemplate();

      expect((service.templateJson() as Record<string, unknown>)['@id']).not.toBe(before);
    });

    it('gives a newly added field an identity of its own', () => {
      service.addField('text', 0);
      const identifiers = service.fields().map((field) => field.atId);

      expect(identifiers.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
      expect(new Set(identifiers).size).toBe(identifiers.length);
    });

    it('writes the same template the JSON writer would', () => {
      expect(service.templateJson()).toEqual(templateToJson(service.template()));
    });
  });

  describe('unsaved changes', () => {
    it('starts clean', () => {
      expect(service.isDirty()).toBe(false);
    });

    it.each([
      ['a field is added', (s: TemplateService) => s.addField('text', 0)],
      ['a field is renamed', (s: TemplateService) => s.updateFieldName(s.fields()[0].id, 'Other')],
      ['a field is deleted', (s: TemplateService) => s.deleteField(s.fields()[0].id)],
      ['a field is reordered', (s: TemplateService) => s.moveField(0, 1)],
      ['a field type changes', (s: TemplateService) => s.updateFieldType(s.fields()[0].id, 'email')],
      ['a status changes', (s: TemplateService) => s.updateFieldStatus(s.fields()[0].id, 'recommended')],
      ['an option is added', (s: TemplateService) => s.addOption(s.fields()[1].id)],
      ['help text changes', (s: TemplateService) => s.updateHelpText(s.fields()[0].id, 'Help')],
      ['the template is renamed', (s: TemplateService) => s.templateName.set('Renamed')],
    ])('is reported after %s', (_case, mutate) => {
      mutate(service);
      expect(service.isDirty()).toBe(true);
    });

    it('is cleared by marking the template saved', () => {
      service.templateName.set('Renamed');
      service.markSaved();

      expect(service.isDirty()).toBe(false);
    });

    it('is cleared by loading a template', () => {
      service.templateName.set('Renamed');
      service.loadTemplate(templateToJson(service.template()));

      expect(service.isDirty()).toBe(false);
    });
  });

  describe('loading', () => {
    it('round-trips its own template', () => {
      service.templateName.set('Study');
      service.updateFieldStatus(service.fields()[0].id, 'recommended');
      const written = templateToJson(service.template());

      service.resetTemplate();
      service.loadTemplate(written);

      expect(templateToJson(service.template())).toEqual(written);
    });

    it('reads the YAML it wrote', () => {
      service.templateName.set('Study');
      const written = templateToJson(service.template());
      const yaml = service.templateYaml();

      service.resetTemplate();
      service.loadTemplate(yaml);

      expect((service.templateJson() as Record<string, unknown>)['schema:name']).toBe('Study');
      expect(service.fields().map((f) => f.name)).toEqual((written['_ui'] as Record<string, string[]>)['order']);
    });

    it('reports a file it cannot read instead of silently keeping the old template', () => {
      service.templateName.set('Keep me');

      expect(() => service.loadTemplate('this is not a template')).toThrow();
      expect(service.templateName()).toBe('Keep me');
    });
  });
});
