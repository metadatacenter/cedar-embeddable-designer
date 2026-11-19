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
  buildTemplate,
  descriptorOf,
  readTemplate,
  templateToJson,
  templateToYaml,
  toDesignerTemplate,
} from './cedar-template';
import { allowedInContainer } from './container-draft';
import {
  TYPE_CELLS as cells,
  TYPE_PARAMETER_CASES as CASES,
  type TypeParameter as Parameter,
  typeField as fieldFor,
  typeParametersOf as parametersFor,
} from './field-parameter-cases.testing';
import { PLACEMENTS } from './field-placements.testing';

const paletteTypes = Object.keys(FIELD_TYPES);

function templateOf(one: Field): DesignerTemplate {
  return {
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields: [one],
  };
}

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
    const covered = new Set(paletteTypes.flatMap((type) => descriptorOf(type).parameters ?? []));
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

/**
 * The same parameters, wherever the field sits. A per-type parameter is written into the field's
 * own definition, so where the field sits should change nothing, and each placement in
 * `field-placements.testing.ts` holds the parameter to that.
 */
const placedCells = PLACEMENTS.flatMap((placement) =>
  cells
    .filter(({ paletteType }) => !placement.parent || allowedInContainer(paletteType, placement.parent))
    .flatMap((cell) => placement.forms.map((form) => ({ ...cell, placement, form }))),
);
const placed = placedCells.map(
  (cell) => [cell.placement.name, cell.form, cell.paletteType, cell.parameter, cell] as const,
);

describe('at each placement', () => {
  it.each(placed)('at %s through %s, %s keeps its %s', (_placement, _form, _paletteType, _parameter, cell) => {
    const original = fieldFor(cell.paletteType, cell.parameter);
    const readBack = cell.placement.roundTrip(original, cell.form);

    expect(CASES[cell.parameter].read(readBack)).toEqual(CASES[cell.parameter].read(original));
  });

  it.each(placed)(
    'at %s through %s, %s settles its %s after one write',
    (_placement, _form, _paletteType, _parameter, cell) => {
      const first = cell.placement.roundTrip(fieldFor(cell.paletteType, cell.parameter), cell.form);
      const second = cell.placement.roundTrip(first, cell.form);

      // Reading a container mints each node a new session id, which is not part of the artifact.
      expect({ ...second, id: 0 }).toEqual({ ...first, id: 0 });
    },
  );
});
