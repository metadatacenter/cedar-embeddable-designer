import { PickedConstraint, termPickerAvailable, toControlledTermConfig } from './term-picker';
import { buildTemplate, templateToJson } from './cedar-template';
import { Field } from '../models/types';
import { ControlledTermField } from 'cedar-model-typescript-library';

/**
 * The picker's choice, as a constraint the template can carry.
 *
 * Each case ends where it matters — in the built CEDAR template — rather than at
 * the editor's own config object, because the config is a staging post and the
 * `_valueConstraints` it produces is the thing a form will be rendered from.
 *
 * The fixtures are the shapes `<cedar-term-picker>` emits, abbreviated to the
 * fields the designer reads.
 */
function fieldWith(picked: PickedConstraint): ControlledTermField {
  const field: Field = {
    id: 1,
    type: 'controlledTerms',
    name: 'Disease',
    status: 'optional',
    options: [],
    defaultValue: '',
    allowMultiple: false,
    controlledTermConfig: toControlledTermConfig(picked),
  };
  return buildTemplate({
    name: 'S',
    description: '',
    identifier: 'https://repo.metadatacenter.org/templates/1',
    version: '0.0.1',
    fields: [field],
  }).getField('Disease') as ControlledTermField;
}

describe('a term chosen in the picker', () => {
  it('becomes a class constraint on the field', () => {
    const constraints = fieldWith({
      type: 'class',
      termIri: 'http://purl.obolibrary.org/obo/DOID_162',
      termLabel: 'cancer',
      sourceAcronym: 'DOID',
      sourceName: 'Human Disease Ontology',
    }).valueConstraints;

    expect(constraints.classes).toHaveLength(1);
    expect(constraints.classes[0].uri.getValue()).toBe('http://purl.obolibrary.org/obo/DOID_162');
    expect(constraints.classes[0].prefLabel).toBe('cancer');
    expect(constraints.classes[0].source).toBe('DOID');
  });

  it('becomes a branch constraint on the field', () => {
    const constraints = fieldWith({
      type: 'branch',
      termBaseIri: 'http://purl.obolibrary.org/obo/DOID_4',
      termBaseLabel: 'disease',
      sourceAcronym: 'DOID',
      sourceName: 'Human Disease Ontology',
    }).valueConstraints;

    expect(constraints.branches).toHaveLength(1);
    expect(constraints.branches[0].uri.getValue()).toBe('http://purl.obolibrary.org/obo/DOID_4');
    expect(constraints.branches[0].name).toBe('disease');
    expect(constraints.branches[0].acronym).toBe('DOID');
  });

  it('becomes an ontology constraint on the field', () => {
    const constraints = fieldWith({
      type: 'ontology',
      sourceAcronym: 'NCIT',
      sourceName: 'National Cancer Institute Thesaurus',
    }).valueConstraints;

    expect(constraints.ontologies).toHaveLength(1);
    expect(constraints.ontologies[0].acronym).toBe('NCIT');
    expect(constraints.ontologies[0].name).toBe('National Cancer Institute Thesaurus');
  });

  it('becomes a value-set constraint on the field', () => {
    const constraints = fieldWith({
      type: 'valueSet',
      termBaseIri: 'https://cadsr.nci.nih.gov/metadata/CADSR-VS/Delivery',
      termBaseLabel: 'Delivery Procedures',
      sourceAcronym: 'CADSR-VS',
      sourceName: 'CADSR Value Sets',
    }).valueConstraints;

    expect(constraints.valueSets).toHaveLength(1);
    expect(constraints.valueSets[0].name).toBe('Delivery Procedures');
  });

  it('reaches the written template rather than stopping at the editor', () => {
    const template = buildTemplate({
      name: 'S',
      description: '',
      identifier: 'https://repo.metadatacenter.org/templates/1',
      version: '0.0.1',
      fields: [
        {
          id: 1,
          type: 'controlledTerms',
          name: 'Disease',
          status: 'optional',
          options: [],
          defaultValue: '',
          allowMultiple: false,
          controlledTermConfig: toControlledTermConfig({
            type: 'branch',
            termBaseIri: 'http://purl.obolibrary.org/obo/DOID_4',
            termBaseLabel: 'disease',
            sourceAcronym: 'DOID',
          }),
        },
      ],
    });
    const properties = templateToJson(template)['properties'] as Record<string, Record<string, unknown>>;
    const written = properties['Disease']['_valueConstraints'] as Record<string, Array<Record<string, unknown>>>;

    expect(written['branches'][0]['uri']).toBe('http://purl.obolibrary.org/obo/DOID_4');
  });
});

describe('offering the picker', () => {
  it('is offered when the host has registered it', () => {
    expect(termPickerAvailable({ get: () => class extends HTMLElement {} })).toBe(true);
  });

  it('is not offered when the host has not', () => {
    // The picker is a sibling component the host loads, not a dependency this
    // bundle carries, so its absence is a normal state rather than a fault.
    expect(termPickerAvailable({ get: () => undefined })).toBe(false);
  });
});
