import { CedarWriters } from 'cedar-model-typescript-library';
import { buildTemplate } from '../core/model/cedar-template';
import { TestBed } from '@angular/core/testing';
import { CedarEmbeddableFieldDesignerElementComponent } from './cedar-embeddable-field-designer.element';
import { FIELD_TYPES } from '../core/models/types';
import { CedFieldType } from '../ced-public-api';
import { TerminologyService } from '../core/services/terminology.service';

function create(type?: CedFieldType) {
  const fixture = TestBed.createComponent(CedarEmbeddableFieldDesignerElementComponent);
  const editor = fixture.componentInstance;
  if (type) editor.newArtifact(type);
  fixture.detectChanges();
  return { fixture, editor, service: editor.service };
}
function name(editor: CedarEmbeddableFieldDesignerElementComponent, value = 'Standalone field') {
  editor.service.updateFieldName(editor.field()!.id, value);
}

beforeEach(() => {
  localStorage.clear();
  TestBed.configureTestingModule({});
});

for (const type of Object.keys(FIELD_TYPES) as CedFieldType[]) {
  it(`creates, edits and reloads a standalone ${type} without changing its identity`, () => {
    const { editor, service } = create(type);
    expect(editor.isDirty).toBe(false);
    name(editor);
    if (['image', 'youtube', 'richText'].includes(type)) {
      service.fields.update((fields) =>
        fields.map((field) => ({
          ...field,
          content:
            type === 'image' ? 'https://example.org/image.png' : type === 'youtube' ? 'dQw4w9WgXcQ' : '<p>Content</p>',
        })),
      );
    }
    if (['multipleChoice', 'checkboxes', 'singleChoiceList', 'multipleChoiceList'].includes(type)) {
      service.fields.update((fields) => fields.map((field) => ({ ...field, options: ['One', 'Two'] })));
    }
    expect(editor.canSave, JSON.stringify(editor.validationReport)).toBe(true);
    const artifact = editor.currentArtifact;
    expect(editor.currentArtifact).toEqual(artifact);
    expect(editor.isDirty).toBe(true);
    editor.loadArtifact(artifact!);
    expect(editor.isDirty).toBe(false);
    expect(editor.currentArtifact).toEqual(artifact);
    expect(editor.field()!.type).toBe(type);
  });
}

it('starts with a type chooser and rejects unknown types without losing edits', () => {
  const { editor } = create();
  expect(editor.currentArtifact).toBeNull();
  expect(editor.canSave).toBe(false);
  editor.newArtifact('text');
  name(editor);
  const before = editor.currentArtifact;
  expect(() => editor.newArtifact('bogus' as CedFieldType)).toThrow();
  expect(editor.currentArtifact).toEqual(before);
});
it('failed loads preserve the draft and its dirty baseline', () => {
  const { editor } = create('text');
  name(editor);
  const before = editor.currentArtifact;
  for (const input of ['invalid', '{}', { '@type': 'https://schema.metadatacenter.org/core/Template' }]) {
    expect(() => editor.loadArtifact(input)).toThrow();
    expect(editor.currentArtifact).toEqual(before);
    expect(editor.isDirty).toBe(true);
  }
});
it('includes invalid settings drafts in dirty and validation state and clears them on reload', () => {
  const { editor, service } = create('number');
  name(editor);
  const saved = editor.currentArtifact!;
  editor.loadArtifact(saved);
  service.setSettingsError(editor.field()!.id, 'numeric', 'Not a number');
  expect(editor.canSave).toBe(false);
  expect(editor.isDirty).toBe(true);
  editor.loadArtifact(saved);
  expect(editor.isDirty).toBe(false);
  expect(editor.canSave).toBe(true);
});
it('returns detached artifacts and reports, including detached load input', () => {
  const { editor } = create('text');
  name(editor);
  const input = editor.currentArtifact as Record<string, unknown>;
  editor.loadArtifact(input);
  input['schema:name'] = 'Changed outside';
  expect((editor.currentArtifact as Record<string, unknown>)['schema:name']).toBe('Standalone field');
  const output = editor.currentArtifact as Record<string, unknown>;
  output['schema:name'] = 'Mutated output';
  editor.validationReport.issues.push({} as never);
  expect(editor.validationReport.issues).toHaveLength(0);
  expect((editor.currentArtifact as Record<string, unknown>)['schema:name']).toBe('Standalone field');
});
it('supports host read-only toggles and keeps published definitions read only', () => {
  const { editor } = create('text');
  name(editor);
  editor.readOnly = true;
  expect(editor.canSave).toBe(false);
  editor.readOnly = false;
  expect(editor.canSave).toBe(true);
  const published = { ...editor.currentArtifact, 'bibo:status': 'bibo:published' };
  editor.loadArtifact(published);
  editor.readOnly = false;
  expect(editor.readOnly).toBe(true);
  expect(editor.canSave).toBe(false);
});
it('isolates simultaneous documents and terminology configuration', () => {
  const a = create('text'),
    b = create('number');
  name(a.editor, 'First');
  name(b.editor, 'Second');
  a.editor.config = { terminologyBaseUrl: 'https://first.example/' };
  a.editor.config = { terminologyBaseUrl: 'https://ignored.example/' };
  b.editor.config = { terminologyBaseUrl: 'https://second.example/' };
  expect(a.fixture.debugElement.injector.get(TerminologyService).baseUrl()).toBe('https://first.example/');
  expect(b.fixture.debugElement.injector.get(TerminologyService).baseUrl()).toBe('https://second.example/');
  expect(a.editor.field()!.name).toBe('First');
  expect(b.editor.field()!.name).toBe('Second');
});
it('emits live changes and suppresses artifact events while a settings draft is invalid', () => {
  const { fixture, editor, service } = create('text');
  const changes = vi.fn(),
    dirty = vi.fn();
  editor.artifactChange.subscribe(changes);
  editor.dirtyChange.subscribe(dirty);
  name(editor);
  fixture.detectChanges();
  TestBed.tick();
  expect(changes).toHaveBeenCalled();
  expect(dirty).toHaveBeenCalledWith(true);
  changes.mockClear();
  service.setSettingsError(editor.field()!.id, 'text', 'Invalid bound');
  name(editor, 'New name');
  fixture.detectChanges();
  TestBed.tick();
  expect(changes).not.toHaveBeenCalled();
});

for (const type of ['text', 'number', 'controlledTerms', 'sectionBreak'] as CedFieldType[]) {
  it(`preserves repository metadata for a ${type} while editing its description`, () => {
    const { editor, service } = create(type);
    name(editor);
    const source = {
      ...editor.currentArtifact,
      '@id': 'https://example.org/fields/stored',
      'pav:version': '2.3.4',
      'bibo:status': 'bibo:draft',
      'pav:createdOn': '2026-01-01T00:00:00Z',
      'pav:lastUpdatedOn': '2026-02-01T00:00:00Z',
      'pav:createdBy': 'https://example.org/users/creator',
      'oslc:modifiedBy': 'https://example.org/users/editor',
      'pav:derivedFrom': 'https://example.org/fields/source',
      'pav:previousVersion': 'https://example.org/fields/previous',
    };
    editor.loadArtifact(source);
    expect(editor.currentArtifact).toEqual(source);
    service.fields.update((fields) => fields.map((field) => ({ ...field, helpText: 'New help' })));
    expect(editor.currentArtifact).toEqual({ ...source, 'schema:description': 'New help' });
  });
}

it('clears old invalid control drafts when choosing a new type', () => {
  const { editor, service } = create('number');
  name(editor);
  service.setSettingsError(editor.field()!.id, 'numeric', 'Invalid number');
  editor.newArtifact('text');
  name(editor, 'New text');
  expect(editor.canSave).toBe(true);
  expect(editor.validationReport.issues).toHaveLength(0);
});

for (const type of ['text', 'number', 'date', 'controlledTerms'] as CedFieldType[]) {
  it(`loads full YAML for ${type} and refuses compact YAML without replacing it`, () => {
    const { editor } = create(type);
    name(editor, 'YAML field');
    const built = buildTemplate({
      name: 'Container',
      description: '',
      identifier: '',
      version: '0.0.1',
      fields: [editor.field()!],
    }).getField('YAML field')!;
    const writer = CedarWriters.yaml().getStrict().getFieldWriterForField(built);
    editor.loadArtifact(writer.getAsYamlString(built, false));
    expect(editor.field()!.name).toBe('YAML field');
    expect(editor.field()!.type).toBe(type);
    expect(editor.isDirty).toBe(false);
    const loaded = editor.currentArtifact;
    expect(() => editor.loadArtifact(writer.getAsYamlString(built, true))).toThrow(/compact YAML/);
    expect(editor.currentArtifact).toEqual(loaded);
  });
}
