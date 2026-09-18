/**
 * The parameters one kind of field has and the others do not.
 *
 * `field-parameter-matrix.spec.ts` covers what every field carries, which makes a
 * dense cross. This covers the sparse one: a number's bounds, a text field's length
 * and pattern, a temporal field's precision, an image's dimensions, a choice field's
 * options, a static block's content, a controlled-term field's vocabulary. Nothing
 * else has them, and offering one where it does not belong is a control that writes
 * nothing.
 *
 * Which cells exist is not decided here. It comes from the descriptor's `parameters`
 * axis, plus `allowsOptions` and `contentKindOf` for the two the descriptor records
 * in fields of its own — and the descriptor is itself held to the model library by
 * `field-capabilities.spec.ts`. So the shape of this matrix is derived twice over: a
 * parameter CEDAR grows becomes a failing capability check, and adopting it here
 * makes new cells appear on their own.
 *
 * The claims are the ones the shared matrix makes, for the same reasons: the value
 * comes back, and a second write changes nothing. What differs is the setup, because
 * a per-type parameter usually cannot be set alone. A numeric field's bounds live in
 * one settings object beside its datatype and its unit, and a temporal granularity
 * is only legal for some datatypes — so each cell starts from a base its type admits
 * and varies one part of it.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, Field } from '../models/types';
import {
  DesignerTemplate,
  FieldParameter,
  PARAMETER_SETTERS,
  allowsOptions,
  buildTemplate,
  contentKindOf,
  newFieldIdentity,
  parametersOf,
  readTemplate,
  templateToJson,
  templateToYaml,
  toDesignerTemplate,
} from './cedar-template';

const paletteTypes = Object.keys(FIELD_TYPES);

/** The two parameters the descriptor records outside its `parameters` list. */
type ExtraParameter = 'options' | 'content';
type Parameter = FieldParameter | ExtraParameter;

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: 1,
    type: 'text',
    name: 'F',
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
    ...newFieldIdentity(),
    ...overrides,
  };
}

function templateOf(one: Field): DesignerTemplate {
  return {
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields: [one],
  };
}

/** A numeric field's parameters share one object, so varying one means writing them all. */
const numeric = (overrides: Partial<NonNullable<Field['numeric']>>): NonNullable<Field['numeric']> => ({
  type: 'xsd:decimal',
  min: null,
  max: null,
  decimalPlaces: null,
  unit: null,
  ...overrides,
});

/**
 * A temporal base the palette type admits.
 *
 * A granularity is only legal for some datatypes, and the writer refuses the pairs
 * that are not — so Time starts from `xsd:time` at minute precision and Date from
 * `xsd:date` at day precision, which is what each type means.
 */
const temporal = (
  paletteType: string,
  overrides: Partial<NonNullable<Field['temporal']>> = {},
): NonNullable<Field['temporal']> =>
  paletteType === 'time'
    ? { type: 'xsd:time', granularity: 'minute', timezoneEnabled: false, inputTimeFormat: null, ...overrides }
    : { type: 'xsd:date', granularity: 'day', timezoneEnabled: false, inputTimeFormat: null, ...overrides };

/** What a static block's one value is, which differs by what the block shows. */
const contentFor = (paletteType: string): string => {
  switch (contentKindOf(paletteType)) {
    case 'markup':
      return '<p>Some <b>markup</b></p>';
    case 'url':
      return 'https://example.org/picture.png';
    default:
      return 'dQw4w9WgXcQ';
  }
};

interface ParameterCase {
  readonly set: (paletteType: string) => Partial<Field>;
  readonly read: (field: Field) => unknown;
}

const CASES: Record<Parameter, ParameterCase> = {
  textLength: {
    set: () => ({ textConstraints: { minLength: 2, maxLength: 40, regex: null } }),
    read: (field) => [field.textConstraints?.minLength, field.textConstraints?.maxLength],
  },
  textPattern: {
    set: () => ({ textConstraints: { minLength: null, maxLength: null, regex: '^[A-Z]+$' } }),
    read: (field) => field.textConstraints?.regex,
  },
  numericBounds: {
    set: () => ({ numeric: numeric({ min: 1, max: 10 }) }),
    read: (field) => [field.numeric?.min, field.numeric?.max],
  },
  numericPrecision: {
    set: () => ({ numeric: numeric({ decimalPlaces: 2 }) }),
    read: (field) => field.numeric?.decimalPlaces,
  },
  numericType: {
    set: () => ({ numeric: numeric({ type: 'xsd:int' }) }),
    read: (field) => field.numeric?.type,
  },
  numericUnit: {
    set: () => ({ numeric: numeric({ unit: 'mg' }) }),
    read: (field) => field.numeric?.unit,
  },
  temporalPrecision: {
    set: (paletteType) =>
      paletteType === 'time'
        ? { temporal: temporal(paletteType, { granularity: 'second' }) }
        : { temporal: temporal(paletteType, { granularity: 'month' }) },
    read: (field) => [field.temporal?.type, field.temporal?.granularity],
  },
  temporalTimezone: {
    /*
     * A zone places a time of day, and a bare `xsd:date` has none — so the model drops
     * a timezone set on one, and the settings panel does not offer the control for that
     * datatype either. Date is therefore exercised as `xsd:dateTime`, which is the
     * shape of a date field an author has asked to carry a time.
     */
    set: (paletteType) =>
      paletteType === 'time'
        ? { temporal: temporal(paletteType, { timezoneEnabled: true }) }
        : { temporal: temporal(paletteType, { type: 'xsd:dateTime', granularity: 'minute', timezoneEnabled: true }) },
    read: (field) => field.temporal?.timezoneEnabled,
  },
  temporalTimeFormat: {
    // A time format is only meaningful where the value carries a time of day.
    set: (paletteType) =>
      paletteType === 'time'
        ? { temporal: temporal(paletteType, { inputTimeFormat: '24h' }) }
        : { temporal: temporal(paletteType, { type: 'xsd:dateTime', granularity: 'minute', inputTimeFormat: '24h' }) },
    read: (field) => field.temporal?.inputTimeFormat,
  },
  mediaDimensions: {
    set: () => ({ width: 320, height: 180 }),
    read: (field) => [field.width, field.height],
  },
  controlledTermConstraints: {
    set: () => ({
      controlledTermConstraints: {
        constraints: [
          {
            // `sourceId` names the ontology a branch is drawn from; the branch itself is
            // `branchRootId`. Putting the branch IRI in both is the mistake this fixture
            // made first, and the round trip reported it as a loss of the ontology.
            sourceType: 'ontology-branch' as const,
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
    /*
     * What identifies the constraint, rather than the whole config object.
     *
     * `ControlledTermConfig` is one loose shape covering all four constraint kinds, and
     * a round trip returns the canonical subset CEDAR can store for a branch: the
     * ontology it is drawn from, the branch root, and the depth. The ontology's display
     * name does not come back, and cannot — `_valueConstraints.branches[]` has a slot
     * for the source's identifier and none for its label, so a reopened template has to
     * resolve the name again from the terminology server. Asserting the identity is
     * therefore the real contract; asserting the whole object would assert the shape
     * rather than the meaning.
     *
     * Narrowed on `sourceType` rather than reaching for the fields, which the union now
     * requires: a branch's root and depth do not exist on the other three kinds, and
     * before the union that was a thing the compiler let this file pretend.
     */
    read: (field) =>
      (field.controlledTermConstraints?.constraints ?? []).flatMap((constraint) =>
        constraint.sourceType === 'ontology-branch'
          ? [
              {
                sourceType: constraint.sourceType,
                sourceId: constraint.sourceId,
                branchRootId: constraint.branchRootId,
                branchRootName: constraint.branchRootName,
                searchDepth: constraint.searchDepth,
              },
            ]
          : [],
      ),
  },
  options: {
    set: () => ({ options: ['Alpha', 'Beta', 'Gamma'] }),
    read: (field) => field.options,
  },
  content: {
    set: (paletteType) => ({ content: contentFor(paletteType) }),
    read: (field) => field.content,
  },
};

/** Every parameter a type accepts, however the descriptor records it. */
function parametersFor(paletteType: string): Parameter[] {
  return [
    ...parametersOf(paletteType),
    ...(allowsOptions(paletteType) ? (['options'] as const) : []),
    ...(contentKindOf(paletteType) ? (['content'] as const) : []),
  ];
}

const cells = paletteTypes.flatMap((paletteType) =>
  parametersFor(paletteType).map((parameter) => ({ paletteType, parameter })),
);

const fieldFor = (paletteType: string, parameter: Parameter): Field =>
  field({ type: paletteType, ...CASES[parameter].set(paletteType) });

function afterRoundTrip(state: DesignerTemplate, form: 'json' | 'yaml'): Field {
  const template = buildTemplate(state);
  const written = form === 'json' ? templateToJson(template) : templateToYaml(template);
  return toDesignerTemplate(readTemplate(written)).fields[0];
}

describe('the per-type matrix', () => {
  /**
   * The cross is sparse, and it has to be sparse for the right reason: because the
   * descriptor says so, not because a list here happens to be short.
   */
  it('crosses each type with the parameters its descriptor grants it', () => {
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(paletteTypes.length * Object.keys(CASES).length);
    // Types with no parameters of their own: the authorities, plain inputs and breaks.
    expect(paletteTypes.filter((type) => parametersFor(type).length === 0).length).toBeGreaterThan(0);
  });

  it('has a case for every parameter some type accepts', () => {
    const needed = new Set(paletteTypes.flatMap(parametersFor));
    expect([...needed].filter((parameter) => !(parameter in CASES))).toEqual([]);
  });

  /** A case for a parameter no type takes is a row nothing exercises. */
  it('has a type behind every case it defines', () => {
    const claimed = new Set(paletteTypes.flatMap(parametersFor));
    expect(Object.keys(CASES).filter((parameter) => !claimed.has(parameter as Parameter))).toEqual([]);
  });

  it('covers every parameter the descriptor can name', () => {
    const covered = new Set(paletteTypes.flatMap((type) => parametersOf(type)));
    const named = Object.keys(PARAMETER_SETTERS) as FieldParameter[];
    expect(named.filter((parameter) => !covered.has(parameter))).toEqual([]);
  });
});

describe.each(['json', 'yaml'] as const)('through %s', (form) => {
  it.each(cells.map((cell) => [cell.paletteType, cell.parameter, cell] as const))(
    '%s keeps its %s',
    (_paletteType, _parameter, cell) => {
      const original = fieldFor(cell.paletteType, cell.parameter);
      const readBack = afterRoundTrip(templateOf(original), form);

      expect(CASES[cell.parameter].read(readBack)).toEqual(CASES[cell.parameter].read(original));
    },
  );

  it.each(cells.map((cell) => [cell.paletteType, cell.parameter, cell] as const))(
    '%s settles its %s after one write',
    (_paletteType, _parameter, cell) => {
      const original = fieldFor(cell.paletteType, cell.parameter);
      const first = afterRoundTrip(templateOf(original), form);
      const second = afterRoundTrip(templateOf(first), form);

      expect(second).toEqual(first);
    },
  );
});
