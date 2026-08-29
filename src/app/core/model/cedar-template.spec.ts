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
 * The template is the artifact under test, not an instance — the editor authors
 * templates and fields. The one test borrowed wholesale from CEE's harness is
 * format independence: a template written as JSON and as YAML must read back as
 * the same model, which is the claim that adopting the library buys and the one
 * that fails loudest if anything here still thinks in terms of JSON keys.
 */
import { CedarFieldType, ControlledTermField, TemporalField, Template } from 'cedar-model-typescript-library';
import { Field } from '../models/types';
import {
  EditorTemplate,
  buildTemplate,
  fieldDeployment,
  newFieldIdentity,
  readTemplate,
  templateToJson,
  templateToYaml,
  toEditorTemplate,
} from './cedar-template';

/** A field with the identity the editor mints when the author adds one. */
function field(overrides: Partial<Field> = {}): Field {
  return {
    id: 1,
    type: 'text',
    name: 'Title',
    status: 'optional',
    options: [],
    defaultValue: '',
    allowMultiple: false,
    ...newFieldIdentity(),
    ...overrides,
  };
}

function templateOf(...fields: Field[]): EditorTemplate {
  return {
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields,
  };
}

/** The JSON a host would receive, as a plain record for indexing. */
function json(state: EditorTemplate): Record<string, unknown> {
  return templateToJson(buildTemplate(state)) as Record<string, unknown>;
}

/**
 * One child of the built template, by the key it was deployed under.
 *
 * A field that takes several values is written as an array whose `items` hold the
 * field, so the unwrapping happens here rather than in every assertion. A
 * checkbox is one of those by its type alone.
 */
function child(state: EditorTemplate, key: string): Record<string, unknown> {
  const properties = json(state)['properties'] as Record<string, Record<string, unknown>>;
  const property = properties[key];
  return (property['items'] as Record<string, unknown>) ?? property;
}

describe('building a CEDAR template', () => {
  it('carries the template metadata the editor holds', () => {
    const result = json(templateOf(field()));

    expect(result['@type']).toBe('https://schema.metadatacenter.org/core/Template');
    expect(result['@id']).toBe('https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111');
    expect(result['schema:name']).toBe('Study');
    expect(result['schema:description']).toBe('A study');
    expect(result['pav:version']).toBe('0.0.1');
    expect(result['bibo:status']).toBe('bibo:draft');
    expect(result['schema:schemaVersion']).toBe('1.6.0');
  });

  it('orders the children as the editor orders the fields', () => {
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
  const cases: Array<[string, string | null]> = [
    ['text', CedarFieldType.TEXT.getUiInputType().getValue()],
    ['paragraph', CedarFieldType.TEXTAREA.getUiInputType().getValue()],
    ['multipleChoice', CedarFieldType.RADIO.getUiInputType().getValue()],
    ['checkboxes', CedarFieldType.CHECKBOX.getUiInputType().getValue()],
    ['date', CedarFieldType.TEMPORAL.getUiInputType().getValue()],
    ['time', CedarFieldType.TEMPORAL.getUiInputType().getValue()],
    ['email', CedarFieldType.EMAIL.getUiInputType().getValue()],
    ['link', CedarFieldType.LINK.getUiInputType().getValue()],
    ['phone', CedarFieldType.PHONE_NUMBER.getUiInputType().getValue()],
    ['number', CedarFieldType.NUMERIC.getUiInputType().getValue()],
    ['orcid', CedarFieldType.EXT_ORCID.getUiInputType().getValue()],
    ['controlledTerms', CedarFieldType.CONTROLLED_TERM.getUiInputType().getValue()],
  ];

  it.each(cases)('writes %s as a %s field', (editorType, inputType) => {
    const built = child(templateOf(field({ type: editorType, name: 'F' })), 'F');
    const ui = built['_ui'] as Record<string, unknown>;

    expect(ui['inputType']).toBe(inputType);
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

describe('what the editor collects reaches the template', () => {
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
    const built = child(templateOf(field({ name: 'F', defaultValue: 'Untitled study' })), 'F');
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
          controlledTermConfig: {
            sourceType: 'ontology',
            ontologyId: 'https://data.bioontology.org/ontologies/DOID',
            ontologyName: 'Human Disease Ontology',
            sourceId: 'DOID',
          },
        }),
      ),
    ).getField('F') as ControlledTermField;

    expect(built.valueConstraints.ontologies).toHaveLength(1);
    expect(built.valueConstraints.ontologies[0].acronym).toBe('DOID');
  });

  it('carries a branch constraint', () => {
    const built = buildTemplate(
      templateOf(
        field({
          type: 'controlledTerms',
          name: 'F',
          controlledTermConfig: {
            sourceType: 'ontology-branch',
            sourceId: 'DOID',
            ontologyName: 'Human Disease Ontology',
            branchRootId: 'http://purl.obolibrary.org/obo/DOID_4',
            branchRootName: 'disease',
            searchDepth: 3,
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
          controlledTermConfig: {
            sourceType: 'ontology-term',
            sourceId: 'http://purl.obolibrary.org/obo/DOID_162',
            sourceName: 'cancer',
            ontologyId: 'DOID',
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
          controlledTermConfig: {
            sourceType: 'value-set',
            sourceId: 'https://cadsr.nci.nih.gov/metadata/CADSR-VS/Delivery',
            sourceName: 'Delivery Procedures',
            ontologyId: 'CADSR-VS',
          },
        }),
      ),
    ).getField('F') as ControlledTermField;

    expect(built.valueConstraints.valueSets).toHaveLength(1);
    expect(built.valueConstraints.valueSets[0].name).toBe('Delivery Procedures');
  });

  it('writes no constraints for a controlled-term field that has none configured', () => {
    const built = buildTemplate(templateOf(field({ type: 'controlledTerms', name: 'F' }))).getField(
      'F',
    ) as ControlledTermField;

    expect(built.valueConstraints.ontologies).toHaveLength(0);
    expect(built.valueConstraints.branches).toHaveLength(0);
    expect(built.valueConstraints.classes).toHaveLength(0);
    expect(built.valueConstraints.valueSets).toHaveLength(0);
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

  it('returns to the editor state it came from', () => {
    const restored = toEditorTemplate(buildTemplate(state));

    expect(restored.name).toBe(state.name);
    expect(restored.description).toBe(state.description);
    expect(restored.identifier).toBe(state.identifier);
    expect(restored.version).toBe(state.version);
    expect(restored.fields.map((f) => [f.name, f.type, f.status, f.allowMultiple])).toEqual(
      state.fields.map((f) => [f.name, f.type, f.status, f.allowMultiple]),
    );
    expect(restored.fields.map((f) => f.options)).toEqual(state.fields.map((f) => f.options));
  });

  it('survives a full pass through JSON back into the editor', () => {
    const restored = toEditorTemplate(readTemplate(templateToJson(buildTemplate(state))));

    expect(templateToJson(buildTemplate(restored))).toEqual(templateToJson(buildTemplate(state)));
  });
});

describe('reading a template the editor did not write', () => {
  it('reads a template whose fields carry no identity of ours', () => {
    const source = templateToJson(buildTemplate(templateOf(field({ name: 'Given' }))));
    const parsed: Template = readTemplate(source);

    expect(toEditorTemplate(parsed).fields.map((f) => f.name)).toEqual(['Given']);
  });

  it('reports a source it cannot read rather than returning an empty template', () => {
    expect(() => readTemplate('not a template')).toThrow();
  });
});
