import { TestBed } from '@angular/core/testing';
import type { CedSupersededShape } from '../../ced-public-api';
import { CedarEmbeddableFieldDesignerElementComponent } from '../../element/cedar-embeddable-field-designer.element';
import { FieldValuePolicy, ValidationPolicy } from '../model/cedar-model/value-policy';
import { buildContainer, fieldToJson, newContainer, templateToJson } from '../model/cedar-template';
import { fieldNode } from '../model/container-draft';
import { Field } from '../models/types';
import { TemplateService } from './template.service';

/**
 * Stored shapes the designer cannot represent and the CEDAR validator refuses.
 *
 * The designer reads a stored artifact into the model library, which has nowhere to hold these shapes,
 * so its projection silently holds something else. The Template Designer host saves by merging the
 * projection into the stored artifact and retaining every branch the author did not change, which is
 * how a stored shape the designer had already dropped came back in every save, for the server to refuse.
 * Each layer passed its own tests: the library writes valid artifacts, the designer validates its
 * projection, and the host retains what it was not told to change. No test put a stored artifact
 * through all three.
 *
 * The designer's controller now lists each such shape in its report, at its place in the stored
 * artifact, with the value its projection holds instead. The claims checked here are that the list is
 * exact in every placement, that it agrees with the projection, and that the stored artifact with the
 * list applied passes the library's mirror of the server's field rules wherever the projection does.
 */

/** A stored artifact as plain JSON, read and edited by key, as a host edits it. */
interface Json {
  [key: string]: JsonValue;
}
type JsonValue = string | number | boolean | null | Json | JsonValue[];
type ValidationField = Parameters<typeof FieldValuePolicy.validateConfiguration>[0];
const constraints = (definition: unknown) => (definition as Json)['_valueConstraints'] as Json;
const ui = (definition: unknown) => (definition as Json)['_ui'] as Json;
const ABSENT = Symbol('absent');
const unescape = (part: string) => part.replaceAll('~1', '/').replaceAll('~0', '~');
function at(node: unknown, location: string): unknown {
  let current = node as Json;
  for (const part of location.split('/').slice(1)) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, unescape(part))) return ABSENT;
    current = current[unescape(part)] as Json;
  }
  return current;
}
/** What a host does with the list: put the projection's value in place of the stored shape, or drop it. */
function applied(stored: Json, shapes: readonly CedSupersededShape[] = []): Json {
  const result = structuredClone(stored);
  for (const shape of shapes) {
    const parts = shape.location.split('/').slice(1).map(unescape);
    const key = parts.pop()!;
    let parent = result;
    for (const part of parts) parent = (parent[part] ??= {}) as Json;
    if ('value' in shape) parent[key] = shape.value as JsonValue;
    else delete parent[key];
  }
  return result;
}
/** Every field definition and its pointer, through elements and repeated children. */
function fieldDefinitions(node: Json, path = ''): Array<[string, Json]> {
  if (node?.['items']) return fieldDefinitions(node['items'] as Json, `${path}/items`);
  if (/TemplateField$/.test(String(node?.['@type'] ?? ''))) return [[path, node]];
  return Object.entries((node?.['properties'] ?? {}) as Json)
    .filter(([, child]) => typeof child === 'object' && child !== null)
    .flatMap(([key, child]) =>
      fieldDefinitions(child as Json, `${path}/properties/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`),
    );
}
/** The field-level refusals the library mirrors from the server's validator, plus an order on a field. */
function refusals(definition: Json): string[] {
  return [
    ...FieldValuePolicy.validateConfiguration(definition as ValidationField),
    ...FieldValuePolicy.validateDefault(definition as ValidationField),
  ]
    .filter((finding) => ValidationPolicy.blocksSave(finding, 'template'))
    .map((finding) => finding.message)
    .concat(Object.hasOwn(ui(definition) ?? {}, 'order') ? ['A field has no order.'] : []);
}

const DOID = {
  constraints: [
    { sourceType: 'ontology' as const, sourceId: 'DOID', ontologyId: 'DOID', ontologyName: 'Human Disease Ontology' },
  ],
  actions: [],
};
const field = (type: string, extra: Partial<Field> = {}): Field => ({
  id: 1,
  type,
  name: 'Value',
  status: 'optional',
  allowMultiple: false,
  options: [],
  defaultValue: { kind: 'none' },
  ...extra,
});
const numeric = () =>
  field('number', { numeric: { type: 'xsd:decimal', min: null, max: null, decimalPlaces: null, unit: null } });
const term = () => field('controlledTerms', { controlledTermConstraints: DOID });
const text = () => field('text');
const section = () => field('sectionBreak');

interface Placement {
  name: string;
  kind: 'template' | 'element';
  depth: number;
  repeatedElement?: boolean;
  repeatedField?: boolean;
}
const PLACEMENTS: Placement[] = [
  { name: 'a field of a template', kind: 'template', depth: 0 },
  { name: 'a repeated field', kind: 'template', depth: 0, repeatedField: true },
  { name: 'a field two elements deep', kind: 'template', depth: 2 },
  { name: 'a field of a repeated element', kind: 'template', depth: 1, repeatedElement: true },
  { name: 'a field of an element document', kind: 'element', depth: 0 },
];

/** A stored artifact the library wrote, holding one field, and the pointer to that field's definition. */
function stored(value: Field, placement: Placement): { source: Json; pointer: string } {
  const root = newContainer(placement.kind);
  root.name = 'Imported';
  let container = root;
  let pointer = '';
  for (let level = 1; level <= placement.depth; level++) {
    const definition = newContainer('element');
    definition.name = `Level ${level}`;
    container.children = [
      { id: definition.id, kind: 'element', definition, placement: { allowMultiple: !!placement.repeatedElement } },
    ];
    container = definition;
    pointer += `/properties/Level ${level}${placement.repeatedElement ? '/items' : ''}`;
  }
  container.children = [fieldNode({ ...value, allowMultiple: !!placement.repeatedField })];
  pointer += `/properties/Value${placement.repeatedField ? '/items' : ''}`;
  return { source: templateToJson(buildContainer(root)) as unknown as Json, pointer };
}

interface Defect {
  name: string;
  field: () => Field;
  repeatable?: false;
  /** Whether the stored shape is refused on its own, rather than only once a term default is chosen. */
  refusedAlone?: false;
  inject(definition: Json): void;
  expected(pointer: string): CedSupersededShape[];
}
const numberType = (pointer: string): CedSupersededShape[] => [
  { location: `${pointer}/_valueConstraints/numberType`, code: 'numberType', value: 'xsd:decimal' },
];
const DEFECTS: Defect[] = [
  {
    name: 'a numeric field with no datatype',
    field: numeric,
    inject: (d) => delete constraints(d)['numberType'],
    expected: numberType,
  },
  {
    name: 'a numeric field with an unsupported datatype',
    field: numeric,
    inject: (d) => (constraints(d)['numberType'] = 'xsd:integer'),
    expected: numberType,
  },
  {
    name: 'a numeric field with a null datatype',
    field: numeric,
    inject: (d) => (constraints(d)['numberType'] = null),
    expected: numberType,
  },
  {
    name: 'a controlled-term default stored as text',
    field: term,
    inject: (d) => (constraints(d)['defaultValue'] = 'Null'),
    expected: (p) => [{ location: `${p}/_valueConstraints/defaultValue`, code: 'termDefault' }],
  },
  {
    name: 'a controlled-term default stored as a number',
    field: term,
    inject: (d) => (constraints(d)['defaultValue'] = 5),
    expected: (p) => [{ location: `${p}/_valueConstraints/defaultValue`, code: 'termDefault' }],
  },
  {
    name: 'an order on a field',
    field: text,
    inject: (d) => (ui(d)['order'] = []),
    expected: (p) => [{ location: `${p}/_ui/order`, code: 'fieldOrder' }],
  },
  {
    name: 'an order on a static field',
    field: section,
    repeatable: false,
    inject: (d) => (ui(d)['order'] = ['stray']),
    expected: (p) => [{ location: `${p}/_ui/order`, code: 'fieldOrder' }],
  },
  {
    name: 'length limits and a pattern on a controlled-term field',
    field: term,
    refusedAlone: false,
    inject: (d) => Object.assign(constraints(d), { minLength: 5, maxLength: 20, regex: '^[A-Z]+$' }),
    expected: (p) =>
      ['minLength', 'maxLength', 'regex'].map((key) => ({
        location: `${p}/_valueConstraints/${key}`,
        code: 'termTextConstraint' as const,
      })),
  },
];

describe('stored shapes the projection supersedes', () => {
  for (const defect of DEFECTS)
    for (const placement of PLACEMENTS) {
      if (placement.repeatedField && defect.repeatable === false) continue;
      it(`${defect.name}, in ${placement.name}`, () => {
        const { source, pointer } = stored(defect.field(), placement);
        defect.inject(at(source, pointer) as Json);
        const service = TestBed.inject(TemplateService);
        service.loadTemplate(source);
        const report = service.validationReport();
        const expected = defect.expected(pointer);

        expect(report.superseded).toEqual(expected);
        expect(report.canSave, JSON.stringify(report.issues)).toBe(true);
        // The list says what the projection holds, so a host can apply it without reading the projection.
        const projection = service.templateJson();
        for (const shape of expected)
          expect(at(projection, shape.location)).toEqual('value' in shape ? shape.value : ABSENT);
        // Retained as stored, the field is refused; with the list applied, it is not.
        const definition = at(source, pointer) as Json;
        if (defect.refusedAlone !== false) expect(refusals(definition)).not.toEqual([]);
        expect(refusals(at(applied(source, report.superseded), pointer) as Json)).toEqual([]);
      });
    }
});

describe('stored shapes the projection carries through', () => {
  const loaded = (source: Json) => {
    const service = TestBed.inject(TemplateService);
    service.loadTemplate(source);
    return service.validationReport();
  };
  it.each(['xsd:decimal', 'xsd:float', 'xsd:double', 'xsd:byte', 'xsd:short', 'xsd:int', 'xsd:long'])(
    'a numeric field typed %s supersedes nothing',
    (type) => {
      const { source, pointer } = stored(numeric(), PLACEMENTS[0]);
      constraints(at(source, pointer))['numberType'] = type;
      expect(loaded(source).superseded).toBeUndefined();
    },
  );
  it('a controlled-term default stored as a term supersedes nothing', () => {
    const { source, pointer } = stored(term(), PLACEMENTS[0]);
    constraints(at(source, pointer))['defaultValue'] = {
      termUri: 'http://purl.obolibrary.org/obo/DOID_4',
      'rdfs:label': 'disease',
    };
    expect(loaded(source).superseded).toBeUndefined();
  });
  it('a term default without a label is kept, so the designer reports it rather than superseding it', () => {
    const { source, pointer } = stored(term(), PLACEMENTS[0]);
    constraints(at(source, pointer))['defaultValue'] = {
      termUri: 'http://purl.obolibrary.org/obo/DOID_4',
    };
    const report = loaded(source);
    expect(report.superseded).toBeUndefined();
    expect(report.canSave).toBe(false);
  });
  it('length limits and a pattern on a text field supersede nothing', () => {
    const { source, pointer } = stored(text(), PLACEMENTS[0]);
    Object.assign(constraints(at(source, pointer)), { minLength: 1, maxLength: 9, regex: '^[a-z]+$' });
    expect(loaded(source).superseded).toBeUndefined();
  });
  it('the order of a template and of its elements supersedes nothing', () => {
    const { source } = stored(text(), PLACEMENTS[2]);
    expect(ui(source)['order']).toEqual(['Level 1']);
    expect(loaded(source).superseded).toBeUndefined();
  });
});

describe('the superseded list over the life of a session', () => {
  const defective = () => {
    const { source, pointer } = stored(numeric(), PLACEMENTS[0]);
    delete constraints(at(source, pointer))['numberType'];
    return source;
  };
  it('survives a restored draft, which still edits the artifact that was loaded', () => {
    const service = TestBed.inject(TemplateService);
    service.loadTemplate(defective());
    const before = service.validationReport().superseded;
    const draft = service.captureDraft();
    service.restoreDraft(draft);
    expect(before).toHaveLength(1);
    expect(service.validationReport().superseded).toEqual(before);
  });
  it('is replaced by the next load and cleared by a new artifact', () => {
    const service = TestBed.inject(TemplateService);
    service.loadTemplate(defective());
    expect(service.validationReport().superseded).toHaveLength(1);
    service.loadTemplate(stored(numeric(), PLACEMENTS[0]).source);
    expect(service.validationReport().superseded).toBeUndefined();
    service.loadTemplate(defective());
    service.resetTemplate('template');
    expect(service.validationReport().superseded).toBeUndefined();
  });
  it('is never reported as an issue, since the author has nothing to repair', () => {
    const service = TestBed.inject(TemplateService);
    service.loadTemplate(defective());
    expect(service.validationReport().issues).toEqual([]);
  });
});

describe('a standalone field document', () => {
  beforeEach(() => TestBed.configureTestingModule({}));
  const create = () => TestBed.createComponent(CedarEmbeddableFieldDesignerElementComponent).componentInstance;
  const standalone = (value: Field) => structuredClone(fieldToJson(value)) as unknown as Json;

  it.each([
    ['a numeric field with no datatype', numeric, (d: Json) => delete constraints(d)['numberType'], numberType('')],
    [
      'an order on a field',
      text,
      (d: Json) => (ui(d)['order'] = []),
      [{ location: '/_ui/order', code: 'fieldOrder' }] as CedSupersededShape[],
    ],
    [
      'a controlled-term default stored as text',
      term,
      (d: Json) => (constraints(d)['defaultValue'] = 'Null'),
      [{ location: '/_valueConstraints/defaultValue', code: 'termDefault' }] as CedSupersededShape[],
    ],
  ])('%s is listed at the root of the field', (_name, make, inject, expected) => {
    const source = standalone(make());
    inject(source);
    const editor = create();
    editor.loadArtifact(source);
    expect(editor.validationReport.superseded).toEqual(expected);
    expect(refusals(applied(source, editor.validationReport.superseded))).toEqual([]);
    editor.newArtifact('text');
    expect(editor.validationReport.superseded).toBeUndefined();
  });
});

/*
 * The production corpus, against the same claim. A stored definition with the list applied is what a host
 * saves for a field the author did not change, so it must never be refused where the projection is not.
 */
const corpus = import.meta.glob<{ default: Record<string, unknown> }>('/src/app/core/model/fixtures/corpus/*.json', {
  eager: true,
});
describe('the production corpus', () => {
  it('holds at least one artifact', () => expect(Object.keys(corpus).length).toBeGreaterThan(0));
  for (const [path, module] of Object.entries(corpus)) {
    const name = path.split('/').pop();
    it(`${name}: with the list applied, a retained field is refused only where the projection is`, () => {
      const source = structuredClone(module.default) as unknown as Json;
      const service = TestBed.inject(TemplateService);
      service.loadTemplate(source);
      const projection = service.templateJson() as unknown as Json;
      const corrected = applied(source, service.validationReport().superseded);
      for (const [pointer, definition] of fieldDefinitions(corrected)) {
        const projected = at(projection, pointer);
        if (projected === ABSENT || refusals(projected as Json).length) continue;
        expect(refusals(definition), `${name} ${pointer}`).toEqual([]);
      }
    });
  }
});
