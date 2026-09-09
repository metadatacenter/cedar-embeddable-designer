/**
 * What the designer produces, stated as something that can fail.
 *
 * Every assertion here was written against the CEDAR model rather than against
 * the hand-written serializer it replaces, and several of them fail on that
 * serializer by design: it dropped the recommended status, the multiple-values
 * flag, default values and every controlled-term constraint, stamped a fresh
 * identifier and timestamp on each call, and wrote a time field as `xsd:dateTime`.
 * Those are the tests that say what the swap is for.
 *
 * The template is the artifact under test, not an instance — the designer authors
 * templates and fields. The one test borrowed wholesale from CEE's harness is
 * format independence: a template written as JSON and as YAML must read back as
 * the same model, which is the claim that adopting the library buys and the one
 * that fails loudest if anything here still thinks in terms of JSON keys.
 */
import { ControlledTermField, TemporalField, Template } from 'cedar-model-typescript-library';
import { Field } from '../models/types';
import { FIELD_TYPES } from '../models/types';
import {
  DesignerTemplate,
  allowsMultiple,
  allowsOptions,
  allowsStatus,
  buildTemplate,
  contentKindOf,
  descriptorOf,
  fieldDeployment,
  fieldToJson,
  readField,
  newFieldIdentity,
  readTemplate,
  templateToJson,
  templateToYaml,
  toDesignerTemplate,
} from './cedar-template';

/** A field with the identity the designer mints when the author adds one. */
function field(overrides: Partial<Field> = {}): Field {
  return {
    id: 1,
    type: 'text',
    name: 'Title',
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
    ...newFieldIdentity(),
    ...overrides,
  };
}

function templateOf(...fields: Field[]): DesignerTemplate {
  return {
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields,
  };
}

/** The JSON a host would receive, as a plain record for indexing. */
function json(state: DesignerTemplate): Record<string, unknown> {
  return templateToJson(buildTemplate(state)) as Record<string, unknown>;
}

/**
 * One child of the built template, by the key it was deployed under.
 *
 * A field that takes several values is written as an array whose `items` hold the
 * field, so the unwrapping happens here rather than in every assertion. A
 * checkbox is one of those by its type alone.
 */
function child(state: DesignerTemplate, key: string): Record<string, unknown> {
  const properties = json(state)['properties'] as Record<string, Record<string, unknown>>;
  const property = properties[key];
  return (property['items'] as Record<string, unknown>) ?? property;
}

describe('building a CEDAR template', () => {
  it('carries the template metadata the designer holds', () => {
    const result = json(templateOf(field()));

    expect(result['@type']).toBe('https://schema.metadatacenter.org/core/Template');
    expect(result['@id']).toBe('https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111');
    expect(result['schema:name']).toBe('Study');
    expect(result['schema:description']).toBe('A study');
    expect(result['pav:version']).toBe('0.0.1');
    expect(result['bibo:status']).toBe('bibo:draft');
    expect(result['schema:schemaVersion']).toBe('1.6.0');
  });

  it('orders the children as the designer orders the fields', () => {
    const state = templateOf(field({ id: 1, name: 'First' }), field({ id: 2, name: 'Second' }));
    const ui = json(state)['_ui'] as Record<string, unknown>;

    expect(ui['order']).toEqual(['First', 'Second']);
  });

  it('gives two fields of the same name distinct keys', () => {
    const state = templateOf(field({ id: 1, name: 'Name' }), field({ id: 2, name: 'Name' }));
    const ui = json(state)['_ui'] as Record<string, string[]>;

    expect(ui['order']).toHaveLength(2);
    expect(new Set(ui['order']).size).toBe(2);
  });
});

describe('field types', () => {
  /**
   * Every type the palette offers builds, and builds as the CEDAR type it claims.
   *
   * Driven from `FIELD_TYPES` rather than from a list written here, so a type
   * added to the palette without a descriptor behind it fails rather than going
   * unnoticed — which is how `image` sat in the palette while building one threw.
   */
  const paletteTypes = Object.keys(FIELD_TYPES);

  /** Exercise each palette type with its normal authoring parameters. */
  const fieldOfType = (paletteType: string): Field =>
    field({
      type: paletteType,
      name: 'F',
      ...(paletteType === 'controlledTerms'
        ? {
            controlledTermConstraints: {
              constraints: [
                {
                  sourceType: 'ontology' as const,
                  sourceId: 'DOID',
                  ontologyId: 'DOID',
                  ontologyName: 'Human Disease Ontology',
                },
              ],
              actions: [],
            },
          }
        : {}),
    });

  it('has a descriptor of its own for every type in the palette', () => {
    // `descriptorOf` falls back to text for a type it does not know, so a palette
    // entry with nothing behind it would build a text field and look fine.
    const fallback = descriptorOf('no-such-type');
    const unbacked = paletteTypes.filter((type) => type !== 'text' && descriptorOf(type) === fallback);

    expect(unbacked).toEqual([]);
  });

  it.each(paletteTypes)('builds a %s field', (paletteType) => {
    expect(() => buildTemplate(templateOf(fieldOfType(paletteType)))).not.toThrow();
  });

  it.each(paletteTypes)('writes %s as the CEDAR type its descriptor names', (paletteType) => {
    const built = child(templateOf(fieldOfType(paletteType)), 'F');
    const ui = built['_ui'] as Record<string, unknown>;

    expect(ui['inputType']).toBe(descriptorOf(paletteType).cedarType.getUiInputType().getValue());
  });

  it.each(paletteTypes)('reads a %s field back as the type it was', (paletteType) => {
    const state = templateOf(fieldOfType(paletteType));

    expect(toDesignerTemplate(buildTemplate(state)).fields[0].type).toBe(paletteType);
  });

  /**
   * Every type survives being written and read back, in both serializations.
   *
   * The round trips below this cover one small template thoroughly. These cover
   * every type shallowly, which is the other axis: a type can build correctly and
   * still lose something on the way out and back, and it is the way out and back
   * that an author meets — open a saved template, change one field, save it again.
   *
   * Driven from the palette rather than a list here, so a type added without a
   * round trip behind it fails rather than going unnoticed.
   */
  it.each(paletteTypes)('writes and reads %s back unchanged as JSON', (paletteType) => {
    const state = templateOf(fieldOfType(paletteType));
    const written = templateToJson(buildTemplate(state));

    expect(templateToJson(buildTemplate(toDesignerTemplate(readTemplate(written))))).toEqual(written);
  });

  it.each(paletteTypes)('writes and reads %s back unchanged as YAML', (paletteType) => {
    const state = templateOf(fieldOfType(paletteType));
    const written = templateToJson(buildTemplate(state));
    const viaYaml = readTemplate(templateToYaml(buildTemplate(state)));

    expect(templateToJson(viaYaml)).toEqual(written);
  });

  /**
   * The designer's state a type settles on, and that it stays there.
   *
   * Not equality with what the designer was handed: a type whose author does not
   * choose the cardinality carries whatever its deployment mandates, so a
   * checkbox list comes back saying it takes several values however it was
   * created. What must hold is that the second pass changes nothing — a template
   * that keeps shifting under repeated opening and saving is the failure this
   * guards, and it is how a time field became a date.
   */
  it.each(paletteTypes)('settles %s after one write and stays there', (paletteType) => {
    const first = toDesignerTemplate(buildTemplate(templateOf(fieldOfType(paletteType)))).fields[0];
    const second = toDesignerTemplate(buildTemplate(templateOf(first))).fields[0];

    expect(first.type).toBe(paletteType);
    expect(first.name).toBe('F');
    expect(second).toEqual(first);
  });

  it('distinguishes a date from a time', () => {
    const dateField = buildTemplate(templateOf(field({ type: 'date', name: 'D' }))).getField('D') as TemporalField;
    const timeField = buildTemplate(templateOf(field({ type: 'time', name: 'T' }))).getField('T') as TemporalField;

    // The hand-written serializer wrote both as xsd:dateTime, so a time field
    // came back as a date and degraded on every open-and-save cycle.
    expect(dateField.valueConstraints.temporalType.getValue()).toBe('xsd:date');
    expect(timeField.valueConstraints.temporalType.getValue()).toBe('xsd:time');
  });
});

describe('what a type will accept', () => {
  it('lets a plain field be required, multiple, and neither by default', () => {
    expect(allowsStatus('text')).toBe(true);
    expect(allowsMultiple('text')).toBe(true);
    expect(allowsOptions('text')).toBe(false);
  });

  it.each(['image', 'richText', 'youtube', 'sectionBreak', 'pageBreak'])(
    'does not let %s be required or multiple, because it shows rather than collects',
    (staticType) => {
      expect(allowsStatus(staticType)).toBe(false);
      expect(allowsMultiple(staticType)).toBe(false);
    },
  );

  it.each([
    ['multipleChoice', 'single by its type'],
    ['checkboxes', 'multiple by its type'],
    ['multipleChoiceList', 'multiple by its type'],
    ['attributeValue', 'multiple by its type'],
  ])('does not offer cardinality on %s, which is %s', (paletteType) => {
    expect(allowsMultiple(paletteType)).toBe(false);
    expect(allowsStatus(paletteType)).toBe(true);
  });

  it.each(['multipleChoice', 'checkboxes', 'singleChoiceList', 'multipleChoiceList'])(
    '%s takes a list of options',
    (paletteType) => {
      expect(allowsOptions(paletteType)).toBe(true);
    },
  );

  it.each([
    ['richText', 'markup'],
    ['image', 'url'],
    ['youtube', 'videoId'],
  ])('%s carries its content as %s', (paletteType, kind) => {
    expect(contentKindOf(paletteType)).toBe(kind);
  });

  it.each(['text', 'sectionBreak', 'pageBreak'])('%s carries no content of its own', (paletteType) => {
    expect(contentKindOf(paletteType)).toBeUndefined();
  });
});

describe('static fields', () => {
  it('carries the markup of a rich text block', () => {
    const built = child(templateOf(field({ type: 'richText', name: 'Note', content: '<p>Read this</p>' })), 'Note');

    // Under `_ui`, beside the input type, which is where the writer puts it.
    expect((built['_ui'] as Record<string, unknown>)['_content']).toBe('<p>Read this</p>');
  });

  it('carries the address of an image', () => {
    const built = child(
      templateOf(field({ type: 'image', name: 'Logo', content: 'https://example.org/l.png' })),
      'Logo',
    );

    expect((built['_ui'] as Record<string, unknown>)['_content']).toBe('https://example.org/l.png');
  });

  it('reads its content back into the designer', () => {
    const state = templateOf(field({ type: 'richText', name: 'Note', content: '<p>Read this</p>' }));

    expect(toDesignerTemplate(buildTemplate(state)).fields[0].content).toBe('<p>Read this</p>');
  });

  it('takes no required value, because its deployment has none to take', () => {
    const built = buildTemplate(templateOf(field({ type: 'pageBreak', name: 'Break', status: 'required' })));

    /*
     * A static field's deployment builder does not extend the dynamic one, so
     * `withRequiredValue` is a method it does not have rather than a setting it
     * ignores. Building any static type threw here until that was branched on.
     *
     * `getChild`, because `getField` narrows on the artifact type and a static
     * field's is `StaticTemplateField`.
     */
    expect(built.getChild('Break')).not.toBeNull();
    expect(fieldDeployment(built, 'Break')?.requiredValue).toBeUndefined();
  });
});

describe('what the designer collects reaches the template', () => {
  it('marks a required field required', () => {
    const built = buildTemplate(templateOf(field({ name: 'F', status: 'required' })));

    expect(fieldDeployment(built, 'F')?.requiredValue).toBe(true);
  });

  it('marks a recommended field recommended', () => {
    const built = buildTemplate(templateOf(field({ name: 'F', status: 'recommended' })));

    expect(fieldDeployment(built, 'F')?.recommendedValue).toBe(true);
    expect(fieldDeployment(built, 'F')?.requiredValue).toBe(false);
  });

  it('marks neither for an optional field', () => {
    const info = fieldDeployment(buildTemplate(templateOf(field({ name: 'F', status: 'optional' }))), 'F');

    expect(info?.requiredValue).toBe(false);
    expect(info?.recommendedValue).toBe(false);
  });

  it('carries the allow-multiple flag', () => {
    const built = buildTemplate(templateOf(field({ name: 'F', allowMultiple: true })));
    const properties = templateToJson(built)['properties'] as Record<string, Record<string, unknown>>;

    expect(properties['F']['type']).toBe('array');
  });

  it('carries a default value', () => {
    const built = child(
      templateOf(field({ name: 'F', defaultValue: { kind: 'literal', value: 'Untitled study' } })),
      'F',
    );
    const constraints = built['_valueConstraints'] as Record<string, unknown>;

    expect(constraints['defaultValue']).toBe('Untitled study');
  });

  it('uses the help text as the field description', () => {
    const built = child(templateOf(field({ name: 'F', helpText: 'The study title' })), 'F');

    expect(built['schema:description']).toBe('The study title');
  });

  it('leaves the description empty rather than inventing one', () => {
    const built = child(templateOf(field({ name: 'F', helpText: '' })), 'F');

    // The hand-written serializer wrote the literal string "Help Text" here,
    // which reached every field of every template it produced.
    expect(built['schema:description']).not.toBe('Help Text');
    expect(built['schema:description'] ?? '').toBe('');
  });

  it('carries the options of a radio field', () => {
    const built = child(templateOf(field({ type: 'multipleChoice', name: 'F', options: ['A', 'B'] })), 'F');
    const constraints = built['_valueConstraints'] as Record<string, Array<Record<string, unknown>>>;

    expect(constraints['literals'].map((literal) => literal['label'])).toEqual(['A', 'B']);
  });
});

describe('controlled-term constraints', () => {
  it('carries an ontology constraint', () => {
    const built = buildTemplate(
      templateOf(
        field({
          type: 'controlledTerms',
          name: 'F',
          controlledTermConstraints: {
            constraints: [
              {
                sourceType: 'ontology',
                ontologyId: 'DOID',
                ontologyName: 'Human Disease Ontology',
                sourceId: 'DOID',
              },
            ],
            actions: [],
          },
        }),
      ),
    ).getField('F') as ControlledTermField;

    expect(built.valueConstraints.ontologies).toHaveLength(1);
    expect(built.valueConstraints.ontologies[0].acronym).toBe('DOID');
    // An acronym is not a URI, and this used to write one into the URI slot: the
    // JSON said `"uri": "DOID"` while the YAML path derived the real one, so the
    // same template in the two formats named different things.
    expect(built.valueConstraints.ontologies[0].uri.getValue()).toBe('https://data.bioontology.org/ontologies/DOID');
  });

  it('carries a branch constraint', () => {
    const built = buildTemplate(
      templateOf(
        field({
          type: 'controlledTerms',
          name: 'F',
          controlledTermConstraints: {
            constraints: [
              {
                sourceType: 'ontology-branch',
                sourceId: 'DOID',
                ontologyName: 'Human Disease Ontology',
                branchRootId: 'http://purl.obolibrary.org/obo/DOID_4',
                branchRootName: 'disease',
                searchDepth: 3,
              },
            ],
            actions: [],
          },
        }),
      ),
    ).getField('F') as ControlledTermField;

    expect(built.valueConstraints.branches).toHaveLength(1);
    expect(built.valueConstraints.branches[0].uri.getValue()).toBe('http://purl.obolibrary.org/obo/DOID_4');
    expect(built.valueConstraints.branches[0].maxDepth).toBe(3);
  });

  it('carries a single-term constraint', () => {
    const built = buildTemplate(
      templateOf(
        field({
          type: 'controlledTerms',
          name: 'F',
          controlledTermConstraints: {
            constraints: [
              {
                sourceType: 'ontology-term',
                sourceId: 'http://purl.obolibrary.org/obo/DOID_162',
                sourceName: 'cancer',
                ontologyId: 'DOID',
              },
            ],
            actions: [],
          },
        }),
      ),
    ).getField('F') as ControlledTermField;

    expect(built.valueConstraints.classes).toHaveLength(1);
    expect(built.valueConstraints.classes[0].prefLabel).toBe('cancer');
  });

  it('carries a value-set constraint', () => {
    const built = buildTemplate(
      templateOf(
        field({
          type: 'controlledTerms',
          name: 'F',
          controlledTermConstraints: {
            constraints: [
              {
                sourceType: 'value-set',
                sourceId: 'https://cadsr.nci.nih.gov/metadata/CADSR-VS/Delivery',
                sourceName: 'Delivery Procedures',
                ontologyId: 'CADSR-VS',
              },
            ],
            actions: [],
          },
        }),
      ),
    ).getField('F') as ControlledTermField;

    expect(built.valueConstraints.valueSets).toHaveLength(1);
    expect(built.valueConstraints.valueSets[0].name).toBe('Delivery Procedures');
  });

  it('keeps an empty controlled-term field IRI-valued through JSON and YAML', () => {
    const state = templateOf(field({ type: 'controlledTerms', name: 'F' }));
    const built = child(state, 'F');
    expect(built['properties']).toHaveProperty('@id');
    for (const source of [json(state), templateToYaml(buildTemplate(state))]) {
      expect(toDesignerTemplate(readTemplate(source)).fields[0].type).toBe('controlledTerms');
    }
  });

  it('writes the vocabulary as constraints once an author has chosen one', () => {
    const built = buildTemplate(
      templateOf(
        field({
          type: 'controlledTerms',
          name: 'F',
          controlledTermConstraints: {
            constraints: [
              {
                sourceType: 'ontology',
                sourceId: 'DOID',
                ontologyId: 'DOID',
                ontologyName: 'Human Disease Ontology',
              },
            ],
            actions: [],
          },
        }),
      ),
    ).getField('F') as ControlledTermField;

    expect(built.valueConstraints.ontologies).toHaveLength(1);
  });
});

describe('identity', () => {
  it('writes the same template the same way twice', () => {
    const state = templateOf(field({ name: 'A' }), field({ id: 2, type: 'number', name: 'B' }));

    // The hand-written serializer called Date.now() and a random UUID generator on
    // every invocation, so the two export panels showed different identifiers for
    // one template and the host received a fresh one on every keystroke.
    expect(JSON.stringify(json(state))).toBe(JSON.stringify(json(state)));
  });

  it('keeps a field identifier across rebuilds', () => {
    const one = field({ name: 'A' });
    const state = templateOf(one);

    expect(child(state, 'A')['@id']).toBe(one.atId);
    expect(child(state, 'A')['@id']).toBe(child(state, 'A')['@id']);
  });

  it('mints a distinct identity for each new field', () => {
    const first = newFieldIdentity();
    const second = newFieldIdentity();

    expect(first.atId).not.toBe(second.atId);
    expect(first.propertyIri).not.toBe(second.propertyIri);
  });
});

describe('round trips', () => {
  const state = templateOf(
    field({ id: 1, name: 'Title', status: 'required', helpText: 'The title' }),
    field({ id: 2, type: 'multipleChoice', name: 'Category', options: ['A', 'B'], status: 'recommended' }),
    field({ id: 3, type: 'date', name: 'Published', allowMultiple: true }),
  );

  it('reads back the JSON it wrote', () => {
    const written = templateToJson(buildTemplate(state));
    const reread = templateToJson(readTemplate(written));

    expect(reread).toEqual(written);
  });

  it('reads back the YAML it wrote', () => {
    const built = buildTemplate(state);
    const reread = readTemplate(templateToYaml(built));

    expect(templateToJson(reread)).toEqual(templateToJson(built));
  });

  /**
   * CEE's format-independence test, for templates rather than instances.
   *
   * The two serializations are different files with different vocabularies. If
   * anything here still understood a template through the shape of its JSON, the
   * YAML side would differ.
   */
  it('reads the same model from either serialization', () => {
    const built = buildTemplate(state);
    const fromJson = readTemplate(templateToJson(built));
    const fromYaml = readTemplate(templateToYaml(built));

    expect(templateToJson(fromYaml)).toEqual(templateToJson(fromJson));
  });

  it('returns to the state the designer came from', () => {
    const restored = toDesignerTemplate(buildTemplate(state));

    expect(restored.name).toBe(state.name);
    expect(restored.description).toBe(state.description);
    expect(restored.identifier).toBe(state.identifier);
    expect(restored.version).toBe(state.version);
    expect(restored.fields.map((f) => [f.name, f.type, f.status, f.allowMultiple])).toEqual(
      state.fields.map((f) => [f.name, f.type, f.status, f.allowMultiple]),
    );
    expect(restored.fields.map((f) => f.options)).toEqual(state.fields.map((f) => f.options));
  });

  it('survives a full pass through JSON back into the designer', () => {
    const restored = toDesignerTemplate(readTemplate(templateToJson(buildTemplate(state))));

    expect(templateToJson(buildTemplate(restored))).toEqual(templateToJson(buildTemplate(state)));
  });
});

describe('reading a template the designer did not write', () => {
  it('reads a template whose fields carry no identity of ours', () => {
    const source = templateToJson(buildTemplate(templateOf(field({ name: 'Given' }))));
    const parsed: Template = readTemplate(source);

    expect(toDesignerTemplate(parsed).fields.map((f) => f.name)).toEqual(['Given']);
  });

  it('reports a source it cannot read rather than returning an empty template', () => {
    expect(() => readTemplate('not a template')).toThrow();
  });
});

describe('typed field defaults', () => {
  const cases: Array<[string, Field['defaultValue']]> = [
    ['text', { kind: 'literal', value: 'Title' }],
    ['paragraph', { kind: 'literal', value: 'Long text\nwith another line' }],
    ['email', { kind: 'literal', value: 'a@example.org' }],
    ['phone', { kind: 'literal', value: '+1 555 123 4567' }],
    ['number', { kind: 'number', value: 0 }],
    ['date', { kind: 'temporal', value: '2026-09-09' }],
    ['time', { kind: 'temporal', value: '14:30' }],
    ['link', { kind: 'iri', iri: 'https://example.org/', label: null }],
    ...['orcid', 'ror', 'pfas', 'rrid', 'pubmed', 'nihGrantId', 'doi'].map(
      (type) =>
        [type, { kind: 'iri', iri: 'https://example.org/record', label: null }] as [string, Field['defaultValue']],
    ),
    ['multipleChoice', { kind: 'literal', value: 'A' }],
    ['singleChoiceList', { kind: 'literal', value: 'B' }],
    ['checkboxes', { kind: 'literals', values: ['A', 'B'] }],
    ['multipleChoiceList', { kind: 'literals', values: ['A', 'B'] }],
    ['controlledTerms', { kind: 'iri', iri: 'http://purl.obolibrary.org/obo/DOID_162', label: 'cancer' }],
  ];
  it.each(cases)('round-trips %s defaults through JSON and YAML', (type, defaultValue) => {
    const f = field({
      type,
      options: ['A', 'B'],
      defaultValue,
      controlledTermConstraints:
        type === 'controlledTerms'
          ? {
              constraints: [{ sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Disease Ontology' }],
              actions: [],
            }
          : undefined,
    });
    const model = buildTemplate(templateOf(f));
    for (const source of [templateToJson(model), templateToYaml(model)]) {
      expect(toDesignerTemplate(readTemplate(source)).fields[0].defaultValue).toEqual(defaultValue);
    }
  });

  it.each([
    ['xsd:date', 'year', '2026'],
    ['xsd:date', 'month', '2026-09'],
    ['xsd:date', 'day', '2026-09-09'],
    ['xsd:time', 'hour', '14'],
    ['xsd:time', 'minute', '14:30'],
    ['xsd:time', 'second', '14:30:10Z'],
    ['xsd:time', 'decimalSecond', '14:30:10.25+05:30'],
    ['xsd:dateTime', 'minute', '2026-09-09T14:30'],
    ['xsd:dateTime', 'second', '2026-09-09T14:30:10Z'],
    ['xsd:dateTime', 'decimalSecond', '2026-09-09T14:30:10.25-07:00'],
  ] as const)('preserves %s / %s settings and default on reopen', (type, granularity, value) => {
    const f = field({
      type: type === 'xsd:time' ? 'time' : 'date',
      temporal: {
        type,
        granularity,
        timezoneEnabled: type !== 'xsd:date',
        inputTimeFormat: type === 'xsd:date' ? null : '12h',
      },
      defaultValue: { kind: 'temporal', value },
    });
    const model = buildTemplate(templateOf(f));
    for (const source of [templateToJson(model), templateToYaml(model)]) {
      const opened = toDesignerTemplate(readTemplate(source));
      expect(opened.fields[0].temporal).toEqual(f.temporal);
      expect(opened.fields[0].defaultValue).toEqual(f.defaultValue);
      expect(templateToJson(buildTemplate(opened))).toEqual(templateToJson(model));
    }
  });
});

for (const type of ['text', 'checkboxes', 'multipleChoiceList', 'attributeValue']) {
  it(`preserves ${type} occurrence limits in JSON and YAML`, () => {
    const original = buildTemplate(
      templateOf(field({ type, allowMultiple: true, minItems: 2, maxItems: 5, options: ['A', 'B'] })),
    );
    for (const source of [templateToJson(original), templateToYaml(original)]) {
      const state = toDesignerTemplate(readTemplate(source));
      expect(state.fields[0].minItems).toBe(2);
      expect(state.fields[0].maxItems).toBe(5);
      const rebuilt = buildTemplate(state);
      expect(fieldDeployment(rebuilt, 'Title')?.minItems).toBe(2);
      expect(fieldDeployment(rebuilt, 'Title')?.maxItems).toBe(5);
    }
  });
}
it('refuses inverted occurrence limits before writing', () => {
  expect(() => buildTemplate(templateOf(field({ allowMultiple: true, minItems: 5, maxItems: 2 })))).toThrow(
    /Occurrence/,
  );
});

it('retains field deployment display settings in both formats', () => {
  const original = buildTemplate(
    templateOf(
      field({ displayLabel: 'Display', displayDescription: 'Help', hidden: true, continuePreviousLine: true }),
    ),
  );
  for (const source of [templateToJson(original), templateToYaml(original)]) {
    const state = toDesignerTemplate(readTemplate(source));
    expect(state.fields[0]).toMatchObject({
      displayLabel: 'Display',
      displayDescription: 'Help',
      hidden: true,
      continuePreviousLine: true,
    });
    expect(templateToJson(buildTemplate(state))).toEqual(templateToJson(original));
  }
});

it('preserves hidden images through JSON and YAML', () => {
  const original = buildTemplate(
    templateOf(field({ type: 'image', hidden: true, content: 'https://example.org/a.png' })),
  );
  for (const source of [templateToJson(original), templateToYaml(original)]) {
    expect(toDesignerTemplate(readTemplate(source)).fields[0].hidden).toBe(true);
  }
});

it('rejects text constraint changes that invalidate a saved default', () => {
  expect(() =>
    buildTemplate(
      templateOf(
        field({
          defaultValue: { kind: 'literal', value: 'ABC' },
          textConstraints: { minLength: 1, maxLength: 2, regex: null },
        }),
      ),
    ),
  ).toThrow(/existing default/);
  expect(() =>
    buildTemplate(templateOf(field({ textConstraints: { minLength: 1, maxLength: 2, regex: '[' } }))),
  ).toThrow();
});

it('preserves authored numeric constraints and refuses a conflicting default', () => {
  const numeric = { type: 'xsd:int', min: 1, max: 12, decimalPlaces: 0, unit: 'mg' };
  const original = buildTemplate(
    templateOf(field({ type: 'number', numeric, defaultValue: { kind: 'number', value: 3 } })),
  );
  for (const source of [templateToJson(original), templateToYaml(original)]) {
    expect(toDesignerTemplate(readTemplate(source)).fields[0].numeric).toEqual(numeric);
  }
  expect(() =>
    buildTemplate(templateOf(field({ type: 'number', numeric, defaultValue: { kind: 'number', value: 2.5 } }))),
  ).toThrow();
  expect(() => buildTemplate(templateOf(field({ type: 'number', numeric: { ...numeric, min: 20 } })))).toThrow(
    /bounds/,
  );
});

it('rejects incompatible temporal precision even without a default', () => {
  expect(() =>
    buildTemplate(
      templateOf(
        field({
          type: 'time',
          temporal: { type: 'xsd:time', granularity: 'year', timezoneEnabled: false, inputTimeFormat: '24h' },
        }),
      ),
    ),
  ).toThrow(/incompatible/);
});

for (const type of ['image', 'youtube']) {
  it(`preserves ${type} dimensions through JSON and YAML`, () => {
    const original = buildTemplate(templateOf(field({ type, width: 640, height: 360 })));
    for (const source of [templateToJson(original), templateToYaml(original)]) {
      expect(toDesignerTemplate(readTemplate(source)).fields[0]).toMatchObject({ width: 640, height: 360 });
    }
    expect(() => buildTemplate(templateOf(field({ type, width: -1 })))).toThrow(/dimensions/);
  });
}

for (const type of ['multipleChoice', 'singleChoiceList', 'checkboxes', 'multipleChoiceList']) {
  it(`preserves an out-of-options ${type} default without adding an option`, () => {
    const original = buildTemplate(
      templateOf(
        field({
          type,
          options: ['Red', 'Green', 'Blue'],
          defaultValue:
            type === 'checkboxes' || type === 'multipleChoiceList'
              ? { kind: 'literals', values: ['Yellow'] }
              : { kind: 'literal', value: 'Yellow' },
          importedChoiceDefault: 'Yellow',
        }),
      ),
    );
    for (const source of [templateToJson(original), templateToYaml(original)]) {
      const state = toDesignerTemplate(readTemplate(source));
      expect(state.fields[0].options).toEqual(['Red', 'Green', 'Blue']);
      expect(state.fields[0].importedChoiceDefault).toBe('Yellow');
      expect(templateToJson(buildTemplate(state))).toEqual(templateToJson(original));
    }
  });
}

it('preserves authored labels language identifiers and typed annotations', () => {
  const metadata = {
    preferredLabel: 'Colour',
    alternateLabels: ['Color', 'Hue'],
    schemaIdentifier: 'colour-field',
    language: 'en',
    propertyIri: 'https://example.org/colour',
    annotations: [
      { name: 'note', kind: 'literal' as const, value: 'Reviewed' },
      { name: 'source', kind: 'iri' as const, value: 'https://example.org/source' },
    ],
  };
  const original = buildTemplate(templateOf(field(metadata)));
  for (const source of [templateToJson(original), templateToYaml(original)]) {
    const state = toDesignerTemplate(readTemplate(source));
    expect(state.fields[0]).toMatchObject(metadata);
    expect(templateToJson(buildTemplate(state))).toEqual(templateToJson(original));
  }
  expect(() =>
    buildTemplate(templateOf(field({ annotations: [metadata.annotations[0], metadata.annotations[0]] }))),
  ).toThrow(/unique/);
});

it('retains published field status version and provenance through JSON and YAML', () => {
  const source = JSON.parse(JSON.stringify(templateToJson(buildTemplate(templateOf(field())))));
  const child = source.properties[Object.keys(source.properties).find((key) => source.properties[key]['schema:name'])!];
  child['bibo:status'] = 'bibo:published';
  child['pav:version'] = '1.2.0';
  child['pav:createdOn'] = '2026-01-01T00:00:00Z';
  child['pav:createdBy'] = 'https://example.org/users/author';
  const original = readTemplate(source);
  for (const serialized of [templateToJson(original), templateToYaml(original)]) {
    const state = toDesignerTemplate(readTemplate(serialized));
    expect(state.fields[0].publishedDefinition).toBeTruthy();
    expect(templateToJson(buildTemplate(state))).toEqual(templateToJson(original));
  }
});

describe('complete controlled-term constraints', () => {
  it('preserves every mixed entry, identity, parameter, pin and action through JSON and YAML', () => {
    const initial = templateToJson(
      buildTemplate(
        templateOf(
          field({
            type: 'controlledTerms',
            name: 'Terms',
            defaultValue: { kind: 'iri', iri: 'urn:term', label: 'Term' },
          }),
        ),
      ),
    ) as unknown as { properties: { Terms: { _valueConstraints: unknown } } };
    const pin = { id: 'sha256:original', effectiveDate: '2026-01-01', declaredVersion: 'v1' };
    const common = { iri: 'https://canonical.example/source', sourceSystem: 'agroportal', version: pin };
    const constraints = {
      requiredValue: false,
      ontologies: [0, 1].map((i) => ({
        ...common,
        uri: `https://custom.example/ontology/${i}`,
        acronym: `O${i}`,
        name: `Ontology ${i}`,
        numTerms: i,
      })),
      branches: [0, 1].map((i) => ({
        ...common,
        source: `Source label ${i}`,
        acronym: `B${i}`,
        uri: `urn:branch:${i}`,
        name: `Branch ${i}`,
        maxDepth: i,
      })),
      classes: [0, 1].map((i) => ({
        ...common,
        source: `C${i}`,
        uri: `urn:term:${i}`,
        label: `Label ${i}`,
        prefLabel: `Preferred ${i}`,
        type: i ? 'Value' : 'OntologyClass',
      })),
      valueSets: [0, 1].map((i) => ({
        ...common,
        uri: `urn:set:${i}`,
        vsCollection: `VS${i}`,
        name: `Set ${i}`,
        numTerms: i + 5,
      })),
      actions: [
        { action: 'delete', termUri: 'urn:term:0', sourceUri: 'urn:branch:0', source: 'B0', type: 'OntologyClass' },
        { action: 'move', termUri: 'urn:term:1', sourceUri: 'urn:set:1', source: 'VS1', type: 'Value', to: 0 },
      ],
    };
    initial.properties.Terms._valueConstraints = constraints;
    const imported = readTemplate(JSON.stringify(initial));
    for (const source of [templateToJson(imported), templateToYaml(imported)]) {
      const opened = toDesignerTemplate(readTemplate(source));
      expect(opened.fields[0].controlledTermConstraints?.constraints).toHaveLength(8);
      const saved = templateToJson(buildTemplate(opened)) as unknown as typeof initial;
      expect(saved.properties.Terms._valueConstraints).toEqual(constraints);
      const again = toDesignerTemplate(readTemplate(templateToYaml(buildTemplate(opened))));
      expect(
        (templateToJson(buildTemplate(again)) as unknown as typeof initial).properties.Terms._valueConstraints,
      ).toEqual(constraints);
    }
  });
  it('retains unrelated actions after removing the last vocabulary entry', () => {
    const actions = [
      {
        action: 'delete',
        termUri: 'urn:term',
        sourceUri: 'urn:source',
        source: 'DOID',
        type: 'OntologyClass' as const,
      },
    ];
    const model = buildTemplate(
      templateOf(field({ type: 'controlledTerms', controlledTermConstraints: { constraints: [], actions } })),
    );
    for (const source of [templateToJson(model), templateToYaml(model)]) {
      const opened = toDesignerTemplate(readTemplate(source));
      expect(opened.fields[0].type).toBe('controlledTerms');
      expect(opened.fields[0].controlledTermConstraints).toEqual({ constraints: [], actions });
    }
  });
});

describe('complete field specification transfer', () => {
  for (const type of Object.keys(FIELD_TYPES)) {
    it(`preserves ${type} draft identity, metadata and deployment through JSON`, () => {
      const original = json(
        templateOf(
          field({
            type,
            name: 'Original',
            deploymentName: 'property-key',
            helpText: 'Help',
            preferredLabel: 'Preferred',
            alternateLabels: ['Alternative'],
            schemaIdentifier: 'Identifier',
            language: 'fr',
            annotations: [{ name: 'note', kind: 'literal', value: 'Keep me' }],
            hidden: true,
            displayLabel: 'Display',
            displayDescription: 'Display help',
            valueRecommendationEnabled: true,
          }),
        ),
      );
      const property = (original['properties'] as Record<string, Record<string, unknown>>)['property-key'];
      const definition = (property['items'] ?? property) as Record<string, unknown>;
      Object.assign(definition, {
        title: 'Custom schema title',
        description: 'Custom schema description',
        'pav:version': '2.3.4',
        'bibo:status': 'bibo:draft',
        'pav:createdOn': '2026-01-01T00:00:00Z',
        'pav:lastUpdatedOn': '2026-02-01T00:00:00Z',
        'pav:createdBy': 'https://example.org/users/one',
        'oslc:modifiedBy': 'https://example.org/users/two',
        'pav:derivedFrom': 'https://example.org/fields/source',
        'pav:previousVersion': 'https://example.org/fields/previous',
      });
      const imported = toDesignerTemplate(readTemplate(JSON.stringify(original)));
      expect(json(imported)).toEqual(original);
      expect(imported.fields[0].artifact?.version).toBe('2.3.4');
      expect(() => templateToYaml(buildTemplate(imported))).toThrow(/Export JSON/);
    });
    it(`imports the complete standalone ${type} definition`, () => {
      const original = fieldToJson(field({ type, name: 'Standalone', preferredLabel: 'Preferred' }));
      expect(fieldToJson(readField(JSON.stringify(original)))).toEqual(original);
    });
  }
});
