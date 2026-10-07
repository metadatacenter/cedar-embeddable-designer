import type { ElementNode } from '../model/container-draft';
import { elementDisplayDescription, fieldDisplayName } from '../model/field-display-name';
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
    expect(service.childKey(id)).toBe('Disease');
    expect(service.validationReport().issues.filter((issue) => issue.nodeId === id)).toEqual([]);
    service.updateFieldDisplayName(id, '');
    expect(service.validationReport().issues.some((issue) => issue.nodeId === id && issue.setting === 'name')).toBe(
      true,
    );
    service.updateFieldDisplayName(id, 'Condition');
    expect(service.childKey(id)).toBe('Condition');
    expect(service.fields().find((field) => field.id === id)?.preferredLabel).toBeUndefined();
    // Once the name has been left, the key is the author's and stays put.
    service.touchName(id);
    service.updateFieldDisplayName(id, 'Diagnosis');
    expect(service.fields().find((field) => field.id === id)?.name).toBe('Diagnosis');
    expect(service.childKey(id)).toBe('Condition');
  });

  it('renames a draft field with its display name, and keeps an established key', () => {
    const field = service.fields()[0];
    const key = service.childKey(field.id);
    expect(service.updateFieldDisplayName(field.id, 'Changed name')).toBeNull();
    expect(service.fields()[0]).toMatchObject({ name: 'Changed name' });
    expect(fieldDisplayName(service.fields()[0])).toBe('Changed name');
    expect(service.childKey(field.id)).toBe(key);
    service.updateOwnFieldName(field.id, 'Own name');
    expect(fieldDisplayName(service.fields()[0])).toBe('Own name');
  });

  it('keeps a display name and an own name apart once the parent shows the field differently', () => {
    const id = service.fields()[0].id;
    expect(service.updateFieldSettings(id, { displayLabel: 'Shown title' })).toBeNull();
    service.updateFieldDisplayName(id, 'Shown again');
    expect(service.fields()[0]).toMatchObject({ name: 'Title', displayLabel: 'Shown again' });
    service.updateOwnFieldName(id, 'Own title');
    expect(service.fields()[0]).toMatchObject({ name: 'Own title', displayLabel: 'Shown again' });
    expect(service.updateFieldSettings(id, { displayDescription: 'Shown help' })).toBeNull();
    service.updateHelpText(id, 'Own help');
    service.updateFieldDisplayDescription(id, 'Shown help again');
    expect(service.fields()[0]).toMatchObject({ helpText: 'Own help', displayDescription: 'Shown help again' });
  });

  it('keeps a usable key for a reserved or unusable name and reports the one the name gives', () => {
    for (const name of ['@id', '@context', '@anything', 'bad\u0000key']) {
      service.addField('text', 0);
      const id = service.selectedField()!;
      service.updateFieldName(id, name);
      expect(service.childKey(id)).toMatch(/^field(?:_\d+)?$/);
      expect(service.validation.changes(id).deploymentName).toBe(name);
      expect(service.validationReport().issues).toContainEqual(
        expect.objectContaining({ nodeId: id, setting: 'key', shown: true }),
      );
    }
    expect(() => buildContainer(service.session.document())).not.toThrow();
    service.addElement(service.session.document().id);
    const element = service.session.document().children.find((n) => n.kind === 'element')!;
    service.updateContainerDefinition(element.id, { name: '@id' });
    expect(service.childKey(element.id)).toMatch(/^element(?:_\d+)?$/);
    expect(service.validation.changes(element.id).deploymentName).toBe('@id');
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
      placement: { displayLabel: 'Title' },
    });
    expect(inserted[1]).toMatchObject({
      kind: 'element',
      definition: { identifier: element['@id'], name: 'Section' },
      placement: { deploymentName: 'Section', displayLabel: 'Section' },
    });
    // The field's name is a sibling's key already: that key is reported at once, and the field waits
    // under a usable one until the author chooses.
    expect(service.validation.changes(inserted[0].id).deploymentName).toBe('Title');
    expect(service.validationReport().issues).toContainEqual(
      expect.objectContaining({ nodeId: inserted[0].id, setting: 'key', shown: true }),
    );
    expect(((service.templateJson() as CedJsonObject)['_ui'] as CedJsonObject)['order']).toEqual([
      'Title',
      'Title_2',
      'Section',
      'Category',
      'Publication Date',
    ]);
  });

  // An imported child's key is its name. A name the key policy refuses is reported at once, and the
  // child waits under a key the policy accepts until the author chooses one.
  it.each(['Prototype', 'Constructor', 'Schema:Name', 'Notes\u0007', '__proto__', '@type', '@Type', 'schema:name'])(
    'imports a reusable field named %s under its name, or reports that name as a key',
    (name) => {
      const field = { ...(fieldToJson(service.fields()[0]) as CedJsonObject), 'schema:name': name };
      service.importChildren([{ type: 'field', artifact: field }], service.session.document().id, 0);
      const imported = service.session.document().children[0];
      expect(imported.definition.name).toBe(name);
      expect(childKeyError(service.childKey(imported.id))).toBeNull();
      const refused = !!childKeyError(name);
      expect(service.childKey(imported.id) === name).toBe(!refused);
      expect(
        service.validationReport().issues.some((issue) => issue.nodeId === imported.id && issue.setting === 'key'),
      ).toBe(refused);
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
    // A library copy takes its name and description as its display name and description, and its
    // name as its key; Title is a sibling's already, so that key waits as a reported edit.
    expect({ ...copy, id: definition.id, customFieldId: undefined, libraryId: undefined }).toEqual({
      ...definition,
      deploymentName: undefined,
      displayLabel: definition.name,
      displayDescription: definition.helpText ?? '',
      customFieldId: undefined,
      libraryId: undefined,
    });
    expect(service.validation.changes(copy.id).deploymentName).toBe('Title');
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

  const published = () => {
    const source = JSON.parse(JSON.stringify(service.templateJson()));
    source.properties.Title['bibo:status'] = 'bibo:published';
    source.properties.Title['pav:version'] = '1.2.0';
    source.properties.Title['pav:createdOn'] = '2026-01-01T00:00:00Z';
    service.loadTemplate(source);
    return service.fields()[0].id;
  };
  const titleProperty = () =>
    (service.templateJson() as { properties: Record<string, Record<string, unknown>> }).properties;

  it("blocks a published field's definition and preserves it", () => {
    const id = published();
    const before = service.templateJson();
    expect(service.definitionLocked(id)).toBe(true);
    expect(service.placementLocked(id)).toBe(false);
    service.updateFieldName(id, 'Changed');
    service.updateOwnFieldName(id, 'Changed');
    service.updateDefaultValue(id, { kind: 'literal', value: 'Changed' });
    service.updateHelpText(id, 'Changed');
    service.updateContent(id, 'Changed');
    service.updateControlledTermConstraints(id, { constraints: [], actions: [] });
    service.addOption(id);
    expect(service.updateFieldSettings(id, { preferredLabel: 'Changed' })).toContain('published');
    expect(service.templateJson()).toEqual(before);
    expect(service.isDirty()).toBe(false);
  });

  it('lets the parent configure and remove a published field', () => {
    const id = published();
    const name = service.fields()[0].name;
    service.updateFieldDisplayName(id, 'Shown title');
    service.updateFieldDisplayDescription(id, 'Shown help');
    service.updateFieldStatus(id, 'recommended');
    service.toggleAllowMultiple(id);
    const field = service.fields()[0];
    expect(field).toMatchObject({ name, displayLabel: 'Shown title', displayDescription: 'Shown help' });
    expect(field).toMatchObject({ status: 'recommended', allowMultiple: true });
    const template = service.templateJson() as { _ui: { propertyLabels: Record<string, string> } };
    expect(template._ui.propertyLabels['Title']).toBe('Shown title');
    expect(titleProperty()['Title']['items']).toBeDefined();
    service.deleteField(id);
    expect(service.fields().some((candidate) => candidate.id === id)).toBe(false);
  });

  /** A template holding Section, a published element with one field, beside the starter fields. */
  const publishedSection = () => {
    const id = service.addElement(service.session.document().id);
    service.updateContainerDefinition(id, { name: 'Section' });
    service.addField('text', 0, id);
    const inner = findContainer(service.session.document(), id)!.children[0].id;
    service.updateFieldName(inner, 'Inner');
    const source = JSON.parse(JSON.stringify(service.templateJson()));
    source.properties.Section['bibo:status'] = 'bibo:published';
    service.loadTemplate(source);
    const section = service.session.document().children.find((node) => node.kind === 'element')!;
    if (section.kind !== 'element') throw new Error('Section is an element');
    return section;
  };

  it('locks a published element and everything in it, and leaves its placement to its parent', () => {
    const section = publishedSection();
    const inner = section.definition.children[0];
    expect([service.definitionLocked(section.id), service.placementLocked(section.id)]).toEqual([true, false]);
    expect([service.definitionLocked(inner.id), service.placementLocked(inner.id)]).toEqual([true, true]);
    const before = JSON.stringify(section.definition);
    service.updateContainerDefinition(section.id, { name: 'Renamed', description: 'Changed' });
    service.addField('text', 0, section.id);
    expect(service.addElement(section.id)).toBe(-1);
    service.updateFieldName(inner.id, 'Changed');
    service.deleteField(inner.id);
    service.moveChild(inner.id, service.session.document().id);
    service.moveChild(service.fields()[0].id, section.id);
    expect(service.updateFieldSettings(inner.id, { displayLabel: 'Changed' })).toContain('published');
    const current = () => service.session.document().children.find((node) => node.id === section.id)!;
    expect(JSON.stringify(current().definition)).toBe(before);
    // Its parent still places it: display name and description, key, multiplicity, and removal.
    expect(service.updateElementDisplayName(current() as ElementNode, 'Shown section')).toBeNull();
    expect(service.updateElementDisplayDescription(current() as ElementNode, 'Shown help')).toBeNull();
    expect(service.updateElementPlacement(section.id, { deploymentName: 'Placed', allowMultiple: true })).toBeNull();
    expect(current().placement).toMatchObject({
      displayLabel: 'Shown section',
      displayDescription: 'Shown help',
      deploymentName: 'Placed',
      allowMultiple: true,
    });
    expect(current().definition.name).toBe('Section');
    service.deleteChild(section.id);
    expect(service.session.document().children.some((node) => node.id === section.id)).toBe(false);
  });

  it('renames a draft element with its display name, and keeps them apart once they differ', () => {
    const id = service.addElement(service.session.document().id);
    service.updateContainerDefinition(id, { name: 'Section' });
    const node = () => service.session.document().children.find((child) => child.id === id) as ElementNode;
    service.updateElementDisplayName(node(), 'Samples');
    expect(node().definition.name).toBe('Samples');
    service.updateOwnElementDescription(node(), 'About samples');
    expect(node().definition.description).toBe('About samples');
    expect(elementDisplayDescription(node())).toBe('About samples');
    expect(service.updateElementPlacement(id, { displayLabel: 'Shown samples' }, 'display')).toBeNull();
    service.updateOwnElementName(node(), 'Own samples');
    expect(node().definition.name).toBe('Own samples');
    expect(node().placement.displayLabel).toBe('Shown samples');
  });

  it("copies an imported child's name and description into its display name and description", () => {
    const element = newContainer('element', 'Specimen');
    element.description = 'A collected specimen';
    const artifact = templateToJson(buildContainer(element)) as CedJsonObject;
    service.importChildren([{ type: 'element', artifact }], service.session.document().id, 0);
    const imported = service.session.document().children[0] as ElementNode;
    expect(imported.placement).toMatchObject({
      deploymentName: 'Specimen',
      displayLabel: 'Specimen',
      displayDescription: 'A collected specimen',
    });
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
    expect(service.updateFieldSettings(field.id, { deploymentName: 'Element' })).toMatch(/key/);
    expect(service.templateJson()).toEqual(before);
  });
});
