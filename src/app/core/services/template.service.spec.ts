import { CedJsonObject } from '../../ced-public-api';
import { fieldToJson, newContainer } from '../model/cedar-template';
import { findContainer } from '../model/container-draft';
import { childKeyError } from '../model/child-key-policy';
import { buildContainer } from '../model/cedar-template';
import { TestBed } from '@angular/core/testing';
import nestedTemplate from '../model/fixtures/corpus/template-028.json';
import { TemplateService } from './template.service';
import { Field } from '../models/types';
import { templateToJson, templateToYaml } from '../model/cedar-template';

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

  it('names new fields through their display name and rejects clearing that name', () => {
    service.addField('text', 0);
    const id = service.selectedField()!;
    expect(service.updateFieldDisplayName(id, 'Disease')).toBeNull();
    expect(service.fields().find((field) => field.id === id)?.name).toBe('Disease');
    expect(service.childKey(id)).toBe('disease');
    expect(service.validationReport().issues.filter((issue) => issue.nodeId === id)).toEqual([]);
    service.updateFieldDisplayName(id, '');
    expect(service.validationReport().issues.some((issue) => issue.nodeId === id && issue.setting === 'name')).toBe(
      true,
    );
    service.updateFieldDisplayName(id, 'Condition');
    expect(service.childKey(id)).toBe('condition');
    expect(service.fields().find((field) => field.id === id)?.preferredLabel).toBe('Condition');
  });

  it('keeps established field names and keys when editing their display name', () => {
    const field = service.fields()[0];
    const key = service.childKey(field.id);
    expect(service.updateFieldDisplayName(field.id, 'Changed display label')).toBeNull();
    expect(service.fields().find((item) => item.id === field.id)?.name).toBe(field.name);
    expect(service.childKey(field.id)).toBe(key);
    expect(service.fields().find((item) => item.id === field.id)?.preferredLabel).toBe('Changed display label');
  });

  it('generates usable unique keys for reserved-prefix display names without looping', () => {
    // Bound a recurrence of the synchronous loop so it fails instead of hanging the test worker.
    const internals = service as unknown as { keyError(id: number, key: string): string | null };
    const original = internals.keyError.bind(service);
    let attempts = 0;
    internals.keyError = (id, key) => {
      if (++attempts > 100) throw new Error('Unbounded automatic naming');
      return original(id, key);
    };
    for (const name of ['@id', '@context', '@anything', 'bad\u0000key']) {
      service.addField('text', 0);
      const id = service.selectedField()!;
      service.updateFieldName(id, name);
      expect(service.childKey(id)).toMatch(/^field(?:_\d+)?$/);
    }
    expect(() => buildContainer(service.session.document())).not.toThrow();
    service.addElement(service.session.document().id);
    const element = service.session.document().children.find((n) => n.kind === 'element')!;
    service.updateContainerDefinition(element.id, { name: '@id' });
    expect(service.childKey(element.id)).toMatch(/^field(?:_\d+)?$/);
  });

  it('validates element field settings in their real parent', () => {
    service.addElement(service.session.document().id);
    const element = service.session.document().children.find((n) => n.kind === 'element')!;
    service.updateContainerDefinition(element.id, { name: 'Section' });
    service.addField('attributeValue', 0, element.id);
    const field = findContainer(service.session.document(), element.id)!.children[0];
    // annotations belongs to the template envelope, but neither element envelope.
    expect(service.updateFieldSettings(field.id, { deploymentName: 'annotations' })).toBeNull();
    expect(service.updateFieldSettings(field.id, { displayLabel: 'Details' })).toBeNull();
    expect(service.updateFieldSettings(field.id, { deploymentName: 'name' })).not.toBeNull();
  });

  it('inserts a mixed reusable batch in order, retaining definitions and resolving placement names', () => {
    const field = fieldToJson(service.fields()[0]) as CedJsonObject;
    const element = templateToJson(buildContainer(newContainer('element', 'Section'))) as CedJsonObject;
    const root = service.session.document();
    service.importChildren(
      [
        { type: 'field', artifact: field },
        { type: 'element', artifact: element },
      ],
      root.id,
      1,
    );
    const inserted = service.session.document().children.slice(1, 3);
    expect(inserted[0]).toMatchObject({
      kind: 'field',
      definition: { name: 'Title', atId: field['@id'] },
      placement: { deploymentName: 'title' },
    });
    expect(inserted[1]).toMatchObject({ kind: 'element', definition: { identifier: element['@id'], name: 'Section' } });
    expect(((service.templateJson() as CedJsonObject)['_ui'] as CedJsonObject)['order']).toEqual([
      'Title',
      'title',
      'section',
      'Category',
      'Publication Date',
    ]);
  });

  // An imported child's key is made from its name, and a name can lower-case into a key no child may
  // have. Import must choose a key the policy accepts, as a rename does.
  it.each(['Prototype', 'Constructor', 'Schema:Name', 'Notes\u0007'])(
    'imports a reusable field named %s under a key the key policy accepts',
    (name) => {
      const field = { ...(fieldToJson(service.fields()[0]) as CedJsonObject), 'schema:name': name };
      const root = service.session.document();
      service.importChildren([{ type: 'field', artifact: field }], root.id, 0);
      const key = service.session.document().children[0].placement.deploymentName!;
      expect(childKeyError(key)).toBeNull();
    },
  );
  // The model refuses a field whose name is itself a reserved key, so such an import is refused whole.
  it.each(['__proto__', '@type', '@Type', 'schema:name'])(
    'refuses a reusable field named %s and inserts nothing',
    (name) => {
      const before = service.templateJson();
      const field = { ...(fieldToJson(service.fields()[0]) as CedJsonObject), 'schema:name': name };
      expect(() =>
        service.importChildren([{ type: 'field', artifact: field }], service.session.document().id, 0),
      ).toThrow();
      expect(service.templateJson()).toEqual(before);
    },
  );

  it('does not insert any children when one selected artifact is invalid', () => {
    const before = service.templateJson();
    const field = fieldToJson(service.fields()[0]) as CedJsonObject;
    expect(() =>
      service.importChildren(
        [
          { type: 'field', artifact: field },
          { type: 'element', artifact: {} },
        ],
        service.session.document().id,
        0,
      ),
    ).toThrow();
    expect(service.templateJson()).toEqual(before);
  });

  it('targets inline edits and field-type validation independently of the selected container', () => {
    const rootId = service.session.document().id;
    const rootFieldId = service.fields()[0].id;
    service.addElement(rootId);
    const element = service.session.document().children.find((node) => node.kind === 'element')!;
    service.addField('text', 0, element.id);
    const nestedId = findContainer(service.session.document(), element.id)!.children[0].id;
    service.openContainer(rootId);
    service.updateFieldName(nestedId, 'Nested text');
    expect(service.updateFieldSettings(nestedId, { displayLabel: 'Nested label' })).toBeNull();
    service.addField('pageBreak', 0, element.id);
    expect(service.loadError()).toContain('Page breaks');
    service.openContainer(element.id);
    service.updateFieldName(rootFieldId, 'Root text');
    const root = service.session.document();
    expect(root.children[0]).toMatchObject({ definition: { name: 'Root text', type: 'text' } });
    expect(root.children.find((node) => node.id === element.id)).toMatchObject({
      definition: {
        children: [{ definition: { name: 'Nested text', type: 'text' }, placement: { displayLabel: 'Nested label' } }],
      },
    });
    service.toggleElement(element.id);
    service.openContainer(element.id);
    expect(service.collapsedElements().has(element.id)).toBe(false);
  });

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
      deploymentName: 'title',
      customFieldId: undefined,
      libraryId: undefined,
    });
    copy.annotations![0].value = 'copy only';
    expect(definition.annotations![0].value).toBe('original');
    service.customFields.set([{ ...custom, definition: { ...definition, name: 'Library revision' } }]);
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
    it('keeps root provenance during edits and clears it for a new document', () => {
      const source = {
        ...service.templateJson(),
        'bibo:status': 'bibo:published',
        'pav:createdOn': '2026-09-01T00:00:00Z',
      };
      service.loadTemplate(source);
      service.templateName.set('Renamed');
      expect(service.templateJson()).toMatchObject({
        'bibo:status': 'bibo:published',
        'pav:createdOn': source['pav:createdOn'],
      });
      service.resetTemplate();
      expect(service.templateJson()['bibo:status']).toBe('bibo:draft');
      expect(service.templateJson()['pav:createdOn']).toBeNull();
    });
    it('opens nested content without losing descendants, and keeps navigation out of dirty state', () => {
      service.loadTemplate(nestedTemplate);
      const before = service.templateJson();
      const nested = service.children().find((child) => child.kind === 'element')!;
      expect(nested).toBeDefined();
      service.openContainer(nested.id);
      expect(service.templateJson()).toEqual(before);
      expect(service.isDirty()).toBe(false);
      service.templateName.set('Edited nested element');
      expect(service.isDirty()).toBe(true);
      expect(service.templateJson()).not.toEqual(before);
      service.loadTemplate(before);
      expect(service.templateJson()).toEqual(before);
    });
    it('rejects a non-container without replacing the open document', () => {
      const before = service.templateJson();
      expect(() => service.loadTemplate({ '@type': 'unknown' })).toThrow();
      expect(service.templateJson()).toEqual(before);
      expect(service.loadError()).toBeTruthy();
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
      const yaml = templateToYaml(service.template());

      service.resetTemplate();
      service.loadTemplate(yaml);

      expect((service.templateJson() as Record<string, unknown>)['schema:name']).toBe('Study');
      expect(service.fields().map((f) => f.name)).toEqual((written['_ui'] as Record<string, string[]>)['order']);
    });

    it('states at once a name the template arrived without, so a refused Save has a reason on screen', () => {
      service.addField('text', 0);
      const written = service.templateJson();
      const key = (written['_ui'] as { order: string[] }).order[0];
      (written['properties'] as Record<string, Record<string, unknown>>)[key]['schema:name'] = '';

      service.loadTemplate(written);

      const field = service.fields()[0];
      expect(service.visibleIssues().some((issue) => issue.nodeId === field.id && issue.setting === 'name')).toBe(true);
      expect(service.validationReport().canSave).toBe(false);
    });

    it('keeps the name of a field added after loading quiet until the author touches it', () => {
      service.loadTemplate(templateToJson(service.template()));
      service.addField('text', 0);
      const id = service.selectedField()!;
      service.updateFieldDisplayName(id, '');

      expect(service.visibleIssues().some((issue) => issue.nodeId === id && issue.setting === 'name')).toBe(false);
    });

    it('reports a file it cannot read instead of silently keeping the old template', () => {
      service.templateName.set('Keep me');

      expect(() => service.loadTemplate('this is not a template')).toThrow();
      expect(service.templateName()).toBe('Keep me');
    });
  });
});

describe('preview paths', () => {
  let service: TemplateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
  });

  it('names a field inside an element by the keys the written template holds it under', () => {
    service.loadTemplate(nestedTemplate);
    const element = service.children().find((child) => child.kind === 'element')!;
    const child = element.definition.children[0];

    const path = service.previewPath(child.id)!;

    type Holder = { properties?: Record<string, unknown>; items?: { properties?: Record<string, unknown> } };
    const holder = (service.templateJson()['properties'] as Record<string, Holder>)[path[0]];
    expect((holder.items ?? holder).properties?.[path[1]]).toBeDefined();
    expect(service.previewPath(element.id)).toEqual([path[0]]);
    expect(service.previewPath(service.session.document().id)).toBeNull();
  });

  it('starts an element designed on its own with the name the preview holds it under', () => {
    service.resetTemplate('element');
    service.templateName.set('Address');
    service.addField('text', 0);
    const id = service.selectedField()!;

    expect(service.previewPath(id)).toEqual(['Address', service.childKey(id)]);
  });
});

describe('default editing', () => {
  let service: TemplateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
  });

  it('rejects an invalid numeric default before the template signal can throw', () => {
    service.fields.set([{ ...service.fields()[0], type: 'number' }]);
    service.updateDefaultValue(1, { kind: 'number', value: 0 });
    service.updateDefaultValue(1, { kind: 'number', value: Number.NaN });
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'number', value: 0 });
    expect(() => service.templateJson()).not.toThrow();
  });

  it('validates text defaults and prevents incompatible constraint changes', () => {
    expect(
      service.updateFieldSettings(1, { textConstraints: { minLength: 2, maxLength: 4, regex: '^[A-Z]+$' } }),
    ).toBeNull();
    service.updateDefaultValue(1, { kind: 'literal', value: 'ABC' });
    service.updateDefaultValue(1, { kind: 'literal', value: 'abc' });
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'literal', value: 'ABC' });
    expect(
      service.updateFieldSettings(1, { textConstraints: { minLength: 2, maxLength: 2, regex: null } }),
    ).not.toBeNull();
    expect(service.fields()[0].textConstraints?.maxLength).toBe(4);
  });

  it('validates numeric defaults and prevents incompatible bounds', () => {
    const numeric = { type: 'xsd:byte', min: 0, max: 100, decimalPlaces: null, unit: null };
    service.fields.set([{ ...service.fields()[0], type: 'number', numeric }]);
    service.updateDefaultValue(1, { kind: 'number', value: 50 });
    for (const value of [-1, 101, 22222, 2.5]) service.updateDefaultValue(1, { kind: 'number', value });
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'number', value: 50 });
    expect(service.updateFieldSettings(1, { numeric: { ...numeric, max: 40 } })).not.toBeNull();
    expect(service.fields()[0].numeric?.max).toBe(100);
  });

  it('rejects invalid temporal defaults but trims reduced precision', () => {
    const temporal = { type: 'xsd:date', granularity: 'day', timezoneEnabled: false, inputTimeFormat: null } as const;
    service.fields.set([{ ...service.fields()[0], type: 'date', temporal }]);
    service.updateDefaultValue(1, { kind: 'temporal', value: '2024-02-29' });
    service.updateDefaultValue(1, { kind: 'temporal', value: '2025-02-29' });
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'temporal', value: '2024-02-29' });
    expect(service.updateFieldSettings(1, { temporal: { ...temporal, granularity: 'year' } })).toBeNull();
    expect(service.fields()[0].temporal?.granularity).toBe('year');
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'temporal', value: '2024' });
  });

  it('renames selected defaults and removes them when their options are deleted', () => {
    service.fields.set([{ ...service.fields()[0], type: 'checkboxes', options: [''] }]);
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
  it('rejects invalid element cardinality without modifying the document', () => {
    service.updateContainerDefinition(service.addElement(), { name: 'Element' });
    const node = service.children().find((child) => child.kind === 'element')!;
    const before = service.templateJson();
    expect(
      service.updateElementPlacement(node.id, { ...node.placement, allowMultiple: true, minItems: 5, maxItems: 2 }),
    ).toMatch(/minimum/);
    expect(service.templateJson()).toEqual(before);
  });
  it('rejects property-name collisions between fields and elements', () => {
    service.updateContainerDefinition(service.addElement(), { name: 'Element' });
    const before = service.templateJson();
    const field = service.fields()[0];
    expect(service.updateFieldSettings(field.id, { deploymentName: 'element' })).toMatch(/key/);
    expect(service.templateJson()).toEqual(before);
  });
});
