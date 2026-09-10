import { TestBed } from '@angular/core/testing';
import nestedTemplate from '../model/fixtures/corpus/template-028.json';
import { TemplateService } from './template.service';
import { Field, FIELD_TYPES } from '../models/types';
import { templateToJson } from '../model/cedar-template';

/**
 * The service as the rest of the application sees it: one template, built once,
 * and a dirty flag that cannot be forgotten.
 *
 * Both were defects rather than gaps. Four places built the template separately
 * through a serializer that minted fresh identifiers, so the two export panels
 * and the custom element each showed a different artifact for the same designer
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

  it.each(Object.keys(FIELD_TYPES))('reselecting %s leaves the field and dirty state unchanged', (type) => {
    const field: Field = {
      ...service.fields()[0],
      type,
      options: ['Alpha', 'Beta'],
      defaultValue: { kind: 'literal', value: 'Alpha' },
      allowMultiple: true,
      textConstraints: { minLength: 2, maxLength: 20, regex: '^[A-Z]+$' },
      numeric: { type: 'xsd:decimal', min: 1, max: 10, decimalPlaces: 2, unit: 'mg' },
      temporal: { type: 'xsd:dateTime', granularity: 'second', timezoneEnabled: true, inputTimeFormat: '24h' },
      customFieldId: 42,
      libraryId: 7,
    };
    service.fields.set([field]);
    const before = service.fields();
    service.updateFieldType(field.id, type);
    expect(service.fields()).toBe(before);
    expect(service.fields()[0]).toEqual(field);
  });

  it.each(['multipleChoice', 'checkboxes', 'singleChoiceList', 'multipleChoiceList'])(
    'preserves option labels when converting to %s',
    (type) => {
      service.fields.set([{ ...service.fields()[0], type: 'checkboxes', options: ['Alpha', 'Beta'] }]);
      service.updateFieldType(1, type);
      expect(service.fields()[0].options).toEqual(['Alpha', 'Beta']);
    },
  );

  it('copies every field setting from a library without linking deployed copies', () => {
    const definition: Field = {
      ...service.fields()[0],
      options: ['one'],
      defaultValue: { kind: 'literal', value: 'one' },
      textConstraints: { minLength: 1, maxLength: 12, regex: null },
      annotations: [{ name: 'note', kind: 'literal', value: 'original' }],
    };
    const custom = { id: 73, libraryId: 9, definition };
    service.customFields.set([custom]);
    service.addCustomFieldToTemplate(custom, 0);
    const copy = service.fields()[0];
    expect({ ...copy, id: definition.id, customFieldId: undefined, libraryId: undefined }).toEqual({
      ...definition,
      customFieldId: undefined,
      libraryId: undefined,
    });
    copy.annotations![0].value = 'copy only';
    expect(definition.annotations![0].value).toBe('original');
    service.updateCustomField({ ...custom, definition: { ...definition, name: 'Library revision' } });
    expect(service.fields()[0].name).toBe(definition.name);
  });

  it('persists full field definitions and libraries across service recreation', () => {
    service.libraries.set([{ id: 9, name: 'Study', description: 'Reusable', icon: 'library' }]);
    service.customFields.set([{ id: 73, libraryId: 9, definition: structuredClone(service.fields()[0]) }]);
    TestBed.tick();
    const fields = service.customFields();
    TestBed.resetTestingModule();
    service = TestBed.inject(TemplateService);
    expect(service.customFields()).toEqual(fields);
    expect(service.libraries()[0].name).toBe('Study');
  });

  it('blocks published field mutations and preserves the published definition', () => {
    const source = JSON.parse(JSON.stringify(service.templateJson()));
    source.properties.Title['bibo:status'] = 'bibo:published';
    source.properties.Title['pav:version'] = '1.2.0';
    source.properties.Title['pav:createdOn'] = '2026-01-01T00:00:00Z';
    service.loadTemplate(source);
    const before = service.templateJson();
    const id = service.fields()[0].id;
    expect(service.isPublished(id)).toBe(true);
    service.updateFieldName(id, 'Changed');
    service.updateFieldType(id, 'number');
    service.updateFieldStatus(id, 'optional');
    service.updateDefaultValue(id, { kind: 'literal', value: 'Changed' });
    service.updateHelpText(id, 'Changed');
    service.updateContent(id, 'Changed');
    service.updateControlledTermConstraints(id, { constraints: [], actions: [] });
    service.toggleAllowMultiple(id);
    service.addOption(id);
    service.deleteField(id);
    expect(service.updateFieldSettings(id, { preferredLabel: 'Changed' })).toContain('read-only');
    expect(service.templateJson()).toEqual(before);
    expect(service.isDirty()).toBe(false);
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
    it('rejects nested content without replacing the open document or its dirty state', () => {
      service.templateName.set('Keep my edits');
      const before = service.templateJson();
      expect(() => service.loadTemplate(nestedTemplate)).toThrow(/Element editing is not supported/);
      expect(service.templateJson()).toEqual(before);
      expect(service.isDirty()).toBe(true);
      expect(service.loadError()).toContain('not opened');
      service.loadTemplate(before);
      expect(service.loadError()).toBeNull();
    });
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

describe('default editing', () => {
  let service: TemplateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
  });

  it('rejects an invalid numeric default before the template signal can throw', () => {
    service.updateFieldType(1, 'number');
    service.updateDefaultValue(1, { kind: 'number', value: 0 });
    service.updateDefaultValue(1, { kind: 'number', value: Number.NaN });
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'number', value: 0 });
    expect(() => service.templateJson()).not.toThrow();
  });

  it('renames selected defaults and removes them when their options are deleted', () => {
    service.updateFieldType(1, 'checkboxes');
    service.updateOption(1, 0, 'A');
    service.addOption(1);
    service.updateOption(1, 1, 'B');
    service.updateDefaultValue(1, { kind: 'literals', values: ['A', 'B'] });
    service.updateOption(1, 0, 'Renamed');
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'literals', values: ['Renamed', 'B'] });
    service.deleteOption(1, 0);
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'literals', values: ['B'] });
    service.deleteOption(1, 0);
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'none' });
    expect(() => service.templateJson()).not.toThrow();
  });
});
