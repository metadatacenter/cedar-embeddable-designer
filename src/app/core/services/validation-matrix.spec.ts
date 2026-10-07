import { TestBed } from '@angular/core/testing';
import {
  buildContainer,
  buildTemplate,
  containerArtifactMetadata,
  newContainer,
  readField,
  templateToJson,
} from '../model/cedar-template';
import { ContainerDraft, fieldNode, fieldView, parentOf } from '../model/container-draft';
import { Field, FieldDefaultValue } from '../models/types';
import { TemplateService } from './template.service';

const iriTypes = ['link', 'controlledTerms', 'orcid', 'ror', 'pfas', 'rrid', 'pubmed', 'nihGrantId', 'doi'];
const invalidIris = [
  'relative/path',
  'not an iri',
  'https://',
  'https://exa mple.org/x',
  'https://example.org/%ZZ',
  'https://example.org/<x>',
  'urn:',
  'https://example.org/\\x',
  '\nhttps://example.org/x',
  'https://example.org/a#b#c',
];
const validIris = [
  'https://example.org/item',
  'http://example.org/x%20y',
  'urn:example:item',
  'doi:10.1234/example',
  'https://例え.jp/項目',
];

function field(type: string, id = 1): Field {
  return {
    id,
    type,
    name: 'Value',
    status: 'optional',
    allowMultiple: false,
    options: [],
    defaultValue: { kind: 'none' },
  };
}
function sourceFor(
  value: Field,
  rawDefault: unknown,
  depth = 0,
  kind: 'template' | 'element' = 'template',
  multiple = false,
) {
  const root = newContainer(kind);
  root.name = 'Imported';
  let container = root;
  for (let level = 1; level <= depth; level++) {
    const definition = newContainer('element');
    definition.name = `Level ${level}`;
    container.children = [{ id: definition.id, kind: 'element', definition, placement: { allowMultiple: multiple } }];
    container = definition;
  }
  container.children = [fieldNode({ ...value, allowMultiple: multiple })];
  const source = templateToJson(buildContainer(root));
  let leaf = source as { properties: Record<string, unknown> };
  for (let level = 1; level <= depth; level++) {
    const child = leaf.properties[`Level ${level}`] as typeof leaf & { items?: typeof leaf };
    leaf = child.items ?? child;
  }
  const property = leaf.properties['Value'] as { items?: unknown };
  const child = (property.items ?? property) as { _valueConstraints: { defaultValue?: unknown } };
  child._valueConstraints.defaultValue = rawDefault;
  return source;
}
function deepest(root: ContainerDraft): ContainerDraft {
  const child = root.children[0];
  return child?.kind === 'element' ? deepest(child.definition) : root;
}
function supplied(type: string, iri: string, depth: number) {
  return sourceFor(
    field(type),
    type === 'controlledTerms' ? { termUri: iri, 'rdfs:label': 'Supplied label' } : iri,
    depth,
  );
}

describe('imported IRI default recovery matrix', () => {
  for (const type of iriTypes)
    for (const depth of [0, 1, 3, 6]) {
      it.each(invalidIris)(`${type}, depth=${depth}: preserves and repairs %j through multiple transitions`, (iri) => {
        const service = TestBed.inject(TemplateService);
        const source = supplied(type, iri, depth);
        service.loadTemplate(source);
        const root = service.document();
        const parent = deepest(root);
        const node = parent.children[0];
        if (node.kind !== 'field') throw new Error('Expected field');
        const id = node.id;
        const current = () => service.session.fieldBinding(parent.id)()[0];
        const invalid = () => {
          const report = service.validationReport();
          expect(report.canSave).toBe(false);
          expect(report.issues).toContainEqual(
            expect.objectContaining({ nodeId: id, setting: 'defaultValue', tab: 'Constraints', shown: true }),
          );
        };
        expect(current().defaultValue).toMatchObject({ kind: 'iri', iri });
        invalid();
        service.updateFieldDisplayName(id, 'Renamed');
        service.openContainer(parent.id);
        service.updateFieldSettings(id, { schemaIdentifier: 'metadata edit' });
        invalid();
        expect(current().defaultValue).toMatchObject({ iri });
        service.updateDefaultValue(id, { kind: 'iri', iri: 'https://example.org/repaired', label: 'Repaired' });
        expect(service.validationReport().canSave).toBe(true);
        service.loadTemplate(service.templateJson());
        expect(service.validationReport().canSave).toBe(true);
        service.loadTemplate(source);
        const recovered = deepest(service.document()).children[0];
        service.updateDefaultValue(recovered.id, { kind: 'none' });
        expect(service.validationReport().canSave).toBe(true);
      });
      it.each(validIris)(
        `${type}, depth=${depth}: accepts a well-formed identifier %j without network checks`,
        (iri) => {
          const service = TestBed.inject(TemplateService);
          service.loadTemplate(supplied(type, iri, depth));
          expect(service.validationReport().canSave).toBe(true);
          service.loadTemplate(service.templateJson());
          expect(service.validationReport().canSave).toBe(true);
        },
      );
    }
});

describe('an imported controlled-term default with no label', () => {
  it('is kept and reported when its term IRI is invalid, as a labelled one is', () => {
    const service = TestBed.inject(TemplateService);
    service.loadTemplate(sourceFor(field('controlledTerms'), { termUri: 'not an iri' }));
    const root = service.document();
    expect(service.session.fieldBinding(root.id)()[0].defaultValue).toMatchObject({ kind: 'iri', iri: 'not an iri' });
    expect(service.validationReport().canSave).toBe(false);
  });
});

describe('interacting imported defects', () => {
  it.each(['constraints-first', 'annotations-first'])('reveals both defects and permits repairs %s', (order) => {
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
    service.fields.set([
      {
        ...field('text'),
        textConstraints: { minLength: 3, maxLength: 1, regex: null },
        annotations: [{ name: 'source', kind: 'iri', value: 'relative' }],
      },
    ]);
    expect(
      service
        .validationReport()
        .issues.map((issue) => issue.setting)
        .sort(),
    ).toEqual(['annotations', 'textConstraints']);
    const constraints = () =>
      service.updateFieldSettings(1, { textConstraints: { minLength: 3, maxLength: 5, regex: null } });
    const annotations = () => service.updateFieldSettings(1, { annotations: [] });
    expect((order === 'constraints-first' ? constraints : annotations)()).toBeNull();
    expect(service.validationReport().issues).toHaveLength(1);
    service.updateFieldDisplayName(1, 'Renamed');
    expect((order === 'constraints-first' ? annotations : constraints)()).toBeNull();
    expect(service.validationReport().canSave).toBe(true);
  });

  it('does not hide an invalid IRI default behind an unrelated invalid annotation', () => {
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
    service.fields.set([
      {
        ...field('link'),
        defaultValue: { kind: 'iri', iri: 'relative', label: null },
        annotations: [{ name: 'source', kind: 'iri', value: 'relative' }],
      },
    ]);
    expect(
      service
        .validationReport()
        .issues.map((issue) => issue.setting)
        .sort(),
    ).toEqual(['annotations', 'defaultValue']);
    expect(service.updateDefaultValue(1, { kind: 'none' })).toBeNull();
    expect(service.validationReport().issues.map((issue) => issue.setting)).toEqual(['annotations']);
    expect(service.updateFieldSettings(1, { annotations: [] })).toBeNull();
    expect(service.validationReport().canSave).toBe(true);
  });

  it('keeps imported values visible in the model until an explicit repair', () => {
    const source = supplied('link', 'relative', 0);
    const service = TestBed.inject(TemplateService);
    service.loadTemplate(source);
    const node = service.document().children[0];
    expect(node.kind === 'field' && fieldView(node).defaultValue).toMatchObject({ iri: 'relative' });
    expect(service.isDirty()).toBe(false);
  });
});

describe('draft and model issue identity', () => {
  it('reports one current verdict for a setting with both a model defect and rejected input', () => {
    const service = TestBed.inject(TemplateService);
    service.loadTemplate(supplied('link', 'relative', 0));
    const id = service.fields()[0].id;
    service.setSettingsError(id, 'defaultValue', 'Incomplete input');
    expect(service.validationReport().issues).toHaveLength(1);
    expect(service.validationReport().issues[0].source).toBe('draft');
    service.setSettingsError(id, 'defaultValue', null);
    expect(service.validationReport().issues).toHaveLength(1);
    expect(service.validationReport().issues[0].source).toBe('model');
    service.updateDefaultValue(id, { kind: 'none' });
    expect(service.validationReport().canSave).toBe(true);
  });
  it('keeps pending-only edits dirty until they are corrected or explicitly replaced', () => {
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
    service.markSaved();
    const id = service.fields()[0].id;
    service.updateFieldSettings(id, { textConstraints: { minLength: 3, maxLength: 1, regex: null } });
    expect(service.isDirty()).toBe(true);
    expect(service.validationReport().canSave).toBe(false);
    service.loadTemplate(
      templateToJson(
        buildTemplate({
          name: 'Other',
          description: '',
          identifier: 'urn:other',
          version: '0.0.1',
          fields: [field('text')],
        }),
      ),
    );
    expect(service.isDirty()).toBe(false);
    expect(service.validationReport().canSave).toBe(true);
  });
});

interface ConflictCase {
  name: string;
  field: Field;
  rawDefault: unknown;
  invalid: FieldDefaultValue;
  correction: FieldDefaultValue;
  relaxed?: Partial<Field>;
}
const conflicts: ConflictCase[] = [
  ...['xsd:decimal', 'xsd:long', 'xsd:int', 'xsd:double'].flatMap((type) =>
    [1000, -1].map((value): ConflictCase => ({
      name: `${type} default ${value} outside 10–100`,
      field: { ...field('number'), numeric: { type, min: 10, max: 100, decimalPlaces: null, unit: null } },
      rawDefault: String(value),
      invalid: { kind: 'number', value },
      correction: { kind: 'number', value: 50 },
      relaxed: { numeric: { type, min: -1, max: 1000, decimalPlaces: null, unit: null } },
    })),
  ),
  ...['text', 'paragraph'].flatMap((type) =>
    ['A', 'ABCDE'].map((value): ConflictCase => ({
      name: `${type} default ${value} outside lengths 2–4`,
      field: { ...field(type), textConstraints: { minLength: 2, maxLength: 4, regex: null } },
      rawDefault: value,
      invalid: { kind: 'literal', value },
      correction: { kind: 'literal', value: 'ABC' },
      relaxed: { textConstraints: { minLength: 1, maxLength: 5, regex: null } },
    })),
  ),
  {
    name: 'text default does not match pattern',
    field: { ...field('text'), textConstraints: { minLength: null, maxLength: null, regex: '^[A-Z]+$' } },
    rawDefault: 'abc',
    invalid: { kind: 'literal', value: 'abc' },
    correction: { kind: 'literal', value: 'ABC' },
    relaxed: { textConstraints: { minLength: null, maxLength: null, regex: null } },
  },
  {
    name: 'date default has invalid day',
    field: {
      ...field('date'),
      temporal: { type: 'xsd:date', granularity: 'day', timezoneEnabled: false, inputTimeFormat: null },
    },
    rawDefault: '2026-02-30',
    invalid: { kind: 'temporal', value: '2026-02-30' },
    correction: { kind: 'temporal', value: '2026-02-28' },
  },
  {
    name: 'time default has invalid hour',
    field: {
      ...field('time'),
      temporal: { type: 'xsd:time', granularity: 'minute', timezoneEnabled: false, inputTimeFormat: '24h' },
    },
    rawDefault: '25:30',
    invalid: { kind: 'temporal', value: '25:30' },
    correction: { kind: 'temporal', value: '23:30' },
  },
  {
    name: 'email format',
    field: field('email'),
    rawDefault: 'not-email',
    invalid: { kind: 'literal', value: 'not-email' },
    correction: { kind: 'literal', value: 'author@example.org' },
  },
  {
    name: 'phone format',
    field: field('phone'),
    rawDefault: 'not-phone',
    invalid: { kind: 'literal', value: 'not-phone' },
    correction: { kind: 'literal', value: '+1 650 555 0100' },
  },
];
describe('default/constraint transition matrix', () => {
  for (const depth of [0, 1, 3, 6])
    for (const kind of ['template', 'element'] as const)
      for (const multiple of [false, true])
        for (const entry of conflicts)
          for (const recovery of ['correct', 'clear', ...(entry.relaxed ? ['relax'] : [])]) {
            it(`${kind}, depth=${depth}, multiple=${multiple}, ${entry.name}: import → rename → reject another default → ${recovery} → reload`, () => {
              const service = TestBed.inject(TemplateService);
              const source = sourceFor(entry.field, entry.rawDefault, depth, kind, multiple);
              const unchanged = structuredClone(source);
              service.loadTemplate(source);
              expect(source).toEqual(unchanged);
              const parent = deepest(service.document());
              const id = parent.children[0].id;
              const current = () => service.session.fieldBinding(parent.id)()[0];
              expect(current().defaultValue).toEqual(entry.invalid);
              expect(service.validationReport().issues).toEqual([
                expect.objectContaining({ nodeId: id, setting: 'defaultValue' }),
              ]);
              expect(service.validationReport().issues[0].path).toHaveLength(depth + 2);
              service.revealIssue(service.validationReport().issues[0]);
              expect(service.session.activeId()).toBe(parent.id);
              expect(service.selectedField()).toBe(id);
              expect(service.validationReport().canSave).toBe(false);
              service.updateFieldDisplayName(id, 'Renamed');
              service.updateFieldSettings(id, { schemaIdentifier: 'Still editable' });
              expect(current().defaultValue).toEqual(entry.invalid);
              expect(service.validationReport().canSave).toBe(false);
              if (depth) {
                service.moveChild(id, service.document().id);
                expect(service.validationReport().issues[0].path).toEqual([service.document().id, id]);
                service.moveChild(id, parent.id);
                expect(parentOf(service.document(), id)?.id).toBe(parent.id);
                expect(service.validationReport().issues[0].path).toHaveLength(depth + 2);
              }
              service.updateDefaultValue(id, entry.invalid);
              expect(service.validationReport().canSave).toBe(false);
              if (recovery === 'relax') service.updateFieldSettings(id, entry.relaxed!);
              else service.updateDefaultValue(id, recovery === 'clear' ? { kind: 'none' } : entry.correction);
              expect(service.validationReport()).toMatchObject({ valid: true, canSave: true, issues: [] });
              service.loadTemplate(service.templateJson());
              expect(service.validationReport().canSave).toBe(true);
            });
          }
});

describe('deep container and field defects stay independent', () => {
  for (const kind of ['template', 'element'] as const)
    for (const depth of [1, 3, 6])
      for (const order of ['outside-in', 'inside-out']) {
        it(`${kind}, depth=${depth}: ${order} repair and ancestor deletion clear exactly their own issues`, () => {
          const service = TestBed.inject(TemplateService);
          const imported = sourceFor(field('link'), 'relative', depth, kind, true);
          service.loadTemplate(imported);
          const root = service.document();
          const parent = deepest(root);
          const id = parent.children[0].id;
          for (const container of [root, parent]) {
            service.updateContainerDefinition(container.id, {
              metadata: {
                artifact: containerArtifactMetadata(container),
                language: null,
                header: null,
                footer: null,
                instanceType: null,
                annotations: [{ name: 'source', kind: 'iri', value: 'https://' }],
              },
            });
          }
          expect(
            service
              .validationReport()
              .issues.map((issue) => issue.setting)
              .sort(),
          ).toEqual(['annotations', 'annotations', 'defaultValue']);
          for (const container of [root, parent]) {
            const issue = service.validationReport().issues.find((issue) => issue.nodeId === container.id)!;
            expect(issue).toMatchObject({ setting: 'annotations', tab: 'Annotations' });
            service.revealIssue(issue);
            expect(service.validationTarget()?.nodeId).toBe(container.id);
          }
          const repairField = () => service.updateDefaultValue(id, { kind: 'none' });
          const repairRoot = () =>
            service.updateContainerDefinition(root.id, {
              metadata: { ...service.document().metadata!, annotations: [] },
            });
          (order === 'outside-in' ? repairRoot : repairField)();
          expect(service.validationReport().issues).toHaveLength(2);
          (order === 'outside-in' ? repairField : repairRoot)();
          expect(service.validationReport().issues).toEqual([
            expect.objectContaining({ nodeId: parent.id, setting: 'annotations' }),
          ]);
          service.setSettingsError(id, 'defaultValue', 'Unfinished input');
          service.validation.beginCheck(id, 'controlledTerms', 'Checking');
          service.deleteChild(service.document().children[0].id);
          expect(service.validationReport()).toMatchObject({ canSave: true, issues: [] });
          expect(service.validation.isChecking(id, 'controlledTerms')).toBe(false);
        });
      }
  for (const entry of conflicts) {
    it(`standalone ${entry.name}: preserves an invalid default before insertion into a deep element`, () => {
      const source = sourceFor(entry.field, entry.rawDefault) as { properties: Record<string, object> };
      const imported = readField(JSON.stringify(source.properties['Value']));
      expect(imported.defaultValue).toEqual(entry.invalid);
      const service = TestBed.inject(TemplateService);
      service.loadTemplate(sourceFor(field('text'), 'Valid', 6, 'element'));
      const parent = deepest(service.document());
      service.importChildren([{ type: 'field', artifact: source.properties['Value'] as never }], parent.id, 1);
      const id = deepest(service.document()).children[1].id;
      // Its sibling is also called Value, so the key it takes from its name is reported at once too.
      expect(service.validationReport().issues).toEqual([
        expect.objectContaining({ nodeId: id, setting: 'key', shown: true }),
        expect.objectContaining({ nodeId: id, setting: 'defaultValue' }),
      ]);
      expect(service.updateFieldSettings(id, { deploymentName: 'Imported value' })).toBeNull();
      service.updateDefaultValue(id, entry.correction);
      expect(service.validationReport().canSave).toBe(true);
    });
  }
});

describe('unnamed descendants and raw default buffers', () => {
  for (const depth of [1, 3, 6])
    for (const type of ['text', 'multipleChoice', 'checkboxes']) {
      it(`${type} at depth ${depth}: unnamed field → blur → move → name → finish option`, () => {
        const service = TestBed.inject(TemplateService);
        service.loadTemplate(sourceFor(field('text'), 'Valid', depth));
        const parent = deepest(service.document());
        service.addField(type, 1, parent.id);
        const id = deepest(service.document()).children[1].id;
        expect(service.validationReport().canSave).toBe(false);
        expect(service.visibleIssues()).toHaveLength(0);
        service.touchName(id);
        expect(service.validationReport().issues.every((issue) => issue.shown && issue.path.length === depth + 2)).toBe(
          true,
        );
        service.moveChild(id, service.document().id);
        expect(service.validationReport().issues.every((issue) => issue.path.length === 2)).toBe(true);
        service.updateFieldDisplayName(id, 'New field');
        if (type !== 'text') {
          expect(service.validationReport().issues).toEqual([
            expect.objectContaining({ setting: 'option-0', shown: true }),
          ]);
          service.updateOption(id, 0, 'First');
        }
        expect(service.validationReport().canSave).toBe(true);
        service.loadTemplate(service.templateJson());
        expect(service.validationReport().canSave).toBe(true);
      });
    }
  for (const value of ['1e', { kind: 'iri' as const, iri: 'relative', label: null }]) {
    it(`retains raw input ${JSON.stringify(value)} through a move and drops it with its branch`, () => {
      const service = TestBed.inject(TemplateService);
      service.loadTemplate(sourceFor(field('number'), '50', 6));
      const parent = deepest(service.document());
      const id = parent.children[0].id;
      service.validation.setInputError(id, 'defaultValue', 'Invalid', 'Constraints', value);
      service.moveChild(id, service.document().id);
      expect(service.validation.inputValue(id, 'defaultValue')).toEqual(value);
      service.moveChild(id, parent.id);
      expect(service.validationReport().issues[0].path).toHaveLength(8);
      service.deleteChild(service.document().children[0].id);
      expect(service.validation.inputValue(id, 'defaultValue')).toBeUndefined();
      expect(service.validationReport().canSave).toBe(true);
    });
  }
});
