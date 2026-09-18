/**
 * A default value through its whole life, for every type that can hold one.
 *
 * Setting a default is the one authoring act with four distinct steps, and each has
 * failed somewhere in CEDAR: entering a value, changing it, clearing it, and finding
 * it again after the template has been saved and reopened. Clearing is the step that
 * breaks quietly, because the two ways of having no default are easy to confuse — a
 * field that never had one, and a field whose default was removed. Both must read
 * back as no default and neither may leave a `defaultValue` behind in the artifact.
 *
 * Reopening is the step that matters most, and it is not the same claim as the round
 * trips in `field-parameter-matrix.spec.ts`. Those assert a parameter survives.
 * These assert the value an author would see in the control is the value they set,
 * which is a claim about the designer's state rather than about the artifact.
 *
 * The values are a table rather than one literal per kind, because a default has to
 * be something the type can hold: a choice default must be one of the options, a
 * time field will not take a date, and a controlled-term default carries a label
 * beside its IRI. Every type the descriptor says can hold a default needs a row, and
 * a type without one fails rather than being skipped.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, Field, FieldDefaultValue } from '../models/types';
import {
  DesignerTemplate,
  allowsDefault,
  allowsOptions,
  buildTemplate,
  defaultValueError,
  descriptorOf,
  newFieldIdentity,
  readTemplate,
  templateToJson,
  toDesignerTemplate,
} from './cedar-template';

const paletteTypes = Object.keys(FIELD_TYPES);
const defaultable = paletteTypes.filter(allowsDefault);

/** The two values a type's lifecycle is walked with: what an author enters, then what they change it to. */
interface DefaultPair {
  readonly first: FieldDefaultValue;
  readonly second: FieldDefaultValue;
}

const literal = (value: string): FieldDefaultValue => ({ kind: 'literal', value });
const literals = (...values: string[]): FieldDefaultValue => ({ kind: 'literals', values });
const iri = (value: string, label: string | null = null): FieldDefaultValue => ({ kind: 'iri', iri: value, label });

/** Options a choice field is given, so its default has something legitimate to be. */
const OPTIONS = ['Alpha', 'Beta'];

const DEFAULTS: Record<string, DefaultPair> = {
  text: { first: literal('Example'), second: literal('Changed') },
  paragraph: { first: literal('Long example'), second: literal('Longer example') },
  email: { first: literal('someone@example.org'), second: literal('other@example.org') },
  phone: { first: literal('+1-555-0100'), second: literal('+1-555-0199') },
  multipleChoice: { first: literal('Alpha'), second: literal('Beta') },
  singleChoiceList: { first: literal('Alpha'), second: literal('Beta') },
  checkboxes: { first: literals('Alpha'), second: literals('Beta') },
  multipleChoiceList: { first: literals('Alpha'), second: literals('Alpha', 'Beta') },
  number: { first: { kind: 'number', value: 0 }, second: { kind: 'number', value: 7 } },
  date: { first: { kind: 'temporal', value: '2026-09-09' }, second: { kind: 'temporal', value: '2026-10-01' } },
  time: { first: { kind: 'temporal', value: '14:30' }, second: { kind: 'temporal', value: '09:15' } },
  link: { first: iri('https://example.org/value'), second: iri('https://example.org/other') },
  controlledTerms: {
    first: iri('http://purl.obolibrary.org/obo/DOID_1909', 'melanoma'),
    second: iri('http://purl.obolibrary.org/obo/DOID_162', 'cancer'),
  },
  orcid: { first: iri('https://orcid.org/0000-0002-1825-0097'), second: iri('https://orcid.org/0000-0001-5109-3700') },
  ror: { first: iri('https://ror.org/00f54p054'), second: iri('https://ror.org/03vek6s52') },
  pfas: { first: iri('https://example.org/pfas/1'), second: iri('https://example.org/pfas/2') },
  rrid: {
    first: iri('https://scicrunch.org/resolver/RRID:AB_90755'),
    second: iri('https://scicrunch.org/resolver/RRID:AB_2532074'),
  },
  pubmed: {
    first: iri('https://pubmed.ncbi.nlm.nih.gov/12345678'),
    second: iri('https://pubmed.ncbi.nlm.nih.gov/23456789'),
  },
  nihGrantId: {
    first: iri('https://example.org/grants/R01GM123456'),
    second: iri('https://example.org/grants/R01GM654321'),
  },
  doi: { first: iri('https://doi.org/10.1000/one'), second: iri('https://doi.org/10.1000/two') },
};

function fieldOf(paletteType: string, value: FieldDefaultValue): Field {
  return {
    id: 1,
    type: paletteType,
    name: 'F',
    status: 'optional',
    options: allowsOptions(paletteType) ? [...OPTIONS] : [],
    defaultValue: value,
    allowMultiple: false,
    ...newFieldIdentity(),
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
  };
}

function templateOf(field: Field): DesignerTemplate {
  return {
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields: [field],
  };
}

/** The field as the designer would show it after a save and an open. */
function reopened(field: Field): Field {
  return toDesignerTemplate(readTemplate(templateToJson(buildTemplate(templateOf(field))))).fields[0];
}

/** The `_valueConstraints` of the written field, where a default would be recorded. */
function valueConstraints(field: Field): Record<string, unknown> {
  const properties = templateToJson(buildTemplate(templateOf(field))) as unknown as {
    properties: Record<string, Record<string, unknown>>;
  };
  const property = properties.properties['F'];
  const definition = (property['items'] as Record<string, unknown>) ?? property;
  return (definition['_valueConstraints'] as Record<string, unknown>) ?? {};
}

describe('the lifecycle table', () => {
  /**
   * The closure that keeps this honest. A type the descriptor says can hold a
   * default, with no row here, would simply not be walked — and a matrix that
   * quietly covers less than it claims is worse than one that covers less openly.
   */
  it('has a row for every type that can hold a default', () => {
    expect(defaultable.filter((paletteType) => !(paletteType in DEFAULTS))).toEqual([]);
  });

  it('has no row for a type that cannot hold one', () => {
    expect(Object.keys(DEFAULTS).filter((paletteType) => !allowsDefault(paletteType))).toEqual([]);
  });

  it('gives each type two values that differ', () => {
    const same = defaultable.filter(
      (paletteType) => JSON.stringify(DEFAULTS[paletteType].first) === JSON.stringify(DEFAULTS[paletteType].second),
    );
    expect(same).toEqual([]);
  });

  it('gives each type values its own kind admits', () => {
    const wrong = defaultable.flatMap((paletteType) =>
      [DEFAULTS[paletteType].first, DEFAULTS[paletteType].second]
        .filter((value) => value.kind !== descriptorOf(paletteType).defaultKind)
        .map((value) => `${paletteType}/${value.kind}`),
    );
    expect(wrong).toEqual([]);
  });
});

describe.each(defaultable)('a %s default', (paletteType) => {
  const { first, second } = DEFAULTS[paletteType];

  it('is accepted by the field it is set on', () => {
    expect(defaultValueError(fieldOf(paletteType, { kind: 'none' }), first)).toBeNull();
    expect(defaultValueError(fieldOf(paletteType, { kind: 'none' }), second)).toBeNull();
  });

  it('comes back as the value it was entered as', () => {
    expect(reopened(fieldOf(paletteType, first)).defaultValue).toEqual(first);
  });

  it('comes back as the value it was changed to', () => {
    const entered = reopened(fieldOf(paletteType, first));
    const changed = reopened({ ...entered, defaultValue: second });

    expect(changed.defaultValue).toEqual(second);
  });

  it('leaves nothing behind when it is cleared', () => {
    const entered = reopened(fieldOf(paletteType, first));
    const cleared = { ...entered, defaultValue: { kind: 'none' } as FieldDefaultValue };

    expect(reopened(cleared).defaultValue).toEqual({ kind: 'none' });
    expect(valueConstraints(cleared)).not.toHaveProperty('defaultValue');
  });

  /**
   * A field that never had a default and one whose default was cleared must be
   * indistinguishable, or clearing is only half an act: the artifact still says
   * something the control no longer shows.
   */
  it('is indistinguishable from never having had one', () => {
    const never = fieldOf(paletteType, { kind: 'none' });
    const cleared = { ...reopened(fieldOf(paletteType, first)), defaultValue: { kind: 'none' } as FieldDefaultValue };

    expect(valueConstraints(cleared)).toEqual(valueConstraints(never));
  });

  it('stays where it settled', () => {
    const once = reopened(fieldOf(paletteType, first));
    const twice = reopened(once);

    expect(twice).toEqual(once);
  });
});
