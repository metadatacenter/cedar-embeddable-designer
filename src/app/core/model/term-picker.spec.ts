import { PickedConstraint, termPickerAvailable, toControlledTermConfig } from './term-picker';
import { buildTemplate, readTemplate, templateToJson, templateToYaml, toEditorTemplate } from './cedar-template';
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

describe('a source the picker could not name', () => {
  it('falls back to the acronym rather than refusing to build', () => {
    // `sourceName` is optional on the picker's hits, and the model library refuses
    // an ontology constraint with no name, so a nameless source used to throw.
    const constraints = fieldWith({ type: 'ontology', sourceAcronym: 'GAZ' }).valueConstraints;

    expect(constraints.ontologies[0].name).toBe('GAZ');
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

/**
 * The version an author pinned, which is the reason the picker exists.
 *
 * A constraint that names a release means the same thing next year; one that
 * does not resolves against whatever the terminology server serves that day. The
 * picker asks the author to choose, hands the choice over on `SelectedConstraint`
 * — and the designer dropped it on the floor.
 */
describe('the version an author pinned', () => {
  const pinned = {
    id: 'sha256:8f0c1e',
    effectiveDate: '2026-06-30',
    declaredVersion: 'DOID 2026-06-30',
  };

  it('reaches the field a term was chosen for', () => {
    const constraints = fieldWith({
      type: 'class',
      termIri: 'http://purl.obolibrary.org/obo/DOID_162',
      termLabel: 'cancer',
      sourceAcronym: 'DOID',
      version: pinned,
    }).valueConstraints;

    expect(constraints.classes[0].version?.id).toBe('sha256:8f0c1e');
    expect(constraints.classes[0].version?.effectiveDate).toBe('2026-06-30');
    expect(constraints.classes[0].version?.declaredVersion).toBe('DOID 2026-06-30');
  });

  it.each([
    [
      'branch',
      { type: 'branch', termBaseIri: 'urn:b', termBaseLabel: 'b', sourceAcronym: 'DOID', sourceName: 'Disease' },
      'branches',
    ],
    ['ontology', { type: 'ontology', sourceAcronym: 'NCIT', sourceName: 'NCI Thesaurus' }, 'ontologies'],
    [
      'value set',
      { type: 'valueSet', termBaseIri: 'urn:v', termBaseLabel: 'v', sourceAcronym: 'CADSR-VS', sourceName: 'CADSR' },
      'valueSets',
    ],
  ])('reaches a %s constraint too', (_kind, picked, key) => {
    const constraints = fieldWith({ ...picked, version: pinned } as PickedConstraint)
      .valueConstraints as unknown as Record<string, Array<{ version?: { id: string } }>>;

    expect(constraints[key][0].version?.id).toBe('sha256:8f0c1e');
  });

  it('pins nothing when the author pinned nothing', () => {
    const constraints = fieldWith({
      type: 'ontology',
      sourceAcronym: 'NCIT',
      sourceName: 'NCI Thesaurus',
    }).valueConstraints;

    // No version means the latest snapshot the terminology server serves, which
    // is a different statement from naming one — not a default to invent.
    expect(constraints.ontologies[0].version).toBeNull();
  });

  it('pins nothing when the version carries no identity', () => {
    // `id` is the snapshot's content hash and the only part resolution reads.
    // A version made only of labels names nothing.
    const constraints = fieldWith({
      type: 'ontology',
      sourceAcronym: 'NCIT',
      sourceName: 'NCI Thesaurus',
      version: { declaredVersion: '26.07d' },
    }).valueConstraints;

    expect(constraints.ontologies[0].version).toBeNull();
  });

  it('survives a round trip through both serializations', () => {
    const state = {
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
            version: pinned,
          }),
        } as Field,
      ],
    };
    const written = templateToJson(buildTemplate(state));

    expect(templateToJson(buildTemplate(toEditorTemplate(readTemplate(written))))).toEqual(written);
    expect(templateToJson(readTemplate(templateToYaml(buildTemplate(state))))).toEqual(written);
  });
});
