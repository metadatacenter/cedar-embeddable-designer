/**
 * Every field type against every parameter they all share.
 *
 * `cedar-template.spec.ts` walks the palette with a bare field of each type, which
 * proves a type can be written and read at all. This walks the same palette with one
 * parameter set at a time, which is the other half: a type can round-trip perfectly
 * while empty and lose a preferred label, an annotation or a provenance stamp the
 * moment one is set. The cross is where that shows.
 *
 * Two claims per cell, because they fail for different reasons.
 *
 * Preservation says the value comes back. Its failure is a designer that silently
 * discards what an author typed — the worst kind, because the artifact looks fine
 * until someone compares it to what they meant. Schema titles are the exception:
 * the model derives them from the artifact name; descriptions remain authored text.
 *
 * Settling says a second write changes nothing. Its failure is drift: a template
 * that shifts a little on every open-and-save, which is how a time field became a
 * date. A parameter can settle without being preserved (dropped consistently) and be
 * preserved without settling (normalised on a later pass), so neither claim implies
 * the other.
 *
 * Both claims are about documents the designer would save. Each cell's JSON is also
 * held to the model's validator, the verdict a save meets, because a value preserved
 * in a document the server refuses has not been preserved for anyone.
 *
 * The parameters here are the ones every field carries, so the cross is dense by
 * construction and any hole in it is deliberate. Per-type parameters — numeric
 * bounds, text length, temporal precision, media dimensions — are the descriptor's
 * `parameters` axis and belong to their own matrix.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, Field } from '../models/types';
import {
  DesignerTemplate,
  buildTemplate,
  readTemplate,
  templateToJson,
  templateToYaml,
  toDesignerTemplate,
} from './cedar-template';
import { SchemaArtifactValidator } from './cedar-model/value-policy';
import { allowedInContainer } from './container-draft';
import {
  SHARED_CELLS as cells,
  SHARED_PARAMETERS as PARAMETERS,
  sharedField as fieldFor,
} from './field-parameter-cases.testing';
import { PLACEMENTS } from './field-placements.testing';

const paletteTypes = Object.keys(FIELD_TYPES);

function templateOf(...fields: Field[]): DesignerTemplate {
  return {
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields,
  };
}

/** The model's verdict on a written artifact, with its findings so a refusal says why. */
function verdict(written: ReturnType<typeof templateToJson>, kind: 'template' | 'element' | 'field') {
  const { canSave, findings } = SchemaArtifactValidator.validate(written, kind);
  return { canSave, findings: findings.map((finding) => `${finding.path}: ${finding.message}`) };
}

/** The designer's state after writing the template and reading it back. */
function afterRoundTrip(state: DesignerTemplate, form: 'json' | 'yaml'): DesignerTemplate {
  const template = buildTemplate(state);
  const written = form === 'json' ? templateToJson(template) : templateToYaml(template);
  return toDesignerTemplate(readTemplate(written));
}

describe('the matrix admits the cells it should', () => {
  it('crosses every palette type with the parameters that type carries', () => {
    expect(paletteTypes.length).toBe(26);
    // Static types and attribute-value carry neither a status nor a chosen
    // cardinality, so their rows are shorter, and deliberately so.
    expect(cells.length).toBeLessThan(paletteTypes.length * PARAMETERS.length);
    expect(new Set(cells.map((cell) => cell.paletteType)).size).toBe(paletteTypes.length);
  });
});

const named = (subset: typeof cells) => subset.map((cell) => [cell.paletteType, cell.parameter.name, cell] as const);

const lossless = cells.filter((cell) => (cell.parameter.yaml ?? 'lossless') === 'lossless');
const refused = cells.filter((cell) => cell.parameter.yaml === 'refused');

describe('through json', () => {
  it.each(named(cells))('%s with its %s writes a template the designer can save', (_paletteType, _name, cell) => {
    const written = templateToJson(buildTemplate(templateOf(fieldFor(cell.paletteType, cell.parameter))));

    expect(verdict(written, 'template')).toEqual({ canSave: true, findings: [] });
  });

  it.each(named(cells.filter((cell) => cell.parameter.name !== 'schemaText')))(
    '%s keeps its %s',
    (_paletteType, _name, cell) => {
      const original = fieldFor(cell.paletteType, cell.parameter);
      const readBack = afterRoundTrip(templateOf(original), 'json').fields[0];

      expect(cell.parameter.read(readBack)).toEqual(cell.parameter.read(original));
    },
  );

  it.each(named(cells.filter((cell) => cell.parameter.name === 'schemaText')))(
    '%s derives its title from its name and keeps its schema description',
    (_paletteType, _name, cell) => {
      const original = fieldFor(cell.paletteType, cell.parameter);
      const readBack = afterRoundTrip(templateOf(original), 'json').fields[0];

      expect(original.artifact?.title).toBe('Custom schema title');
      expect(cell.parameter.read(readBack)).toEqual(['F field schema', 'Custom schema description']);
    },
  );

  it.each(named(cells))('%s settles its %s after one write', (_paletteType, _name, cell) => {
    const original = fieldFor(cell.paletteType, cell.parameter);
    const first = afterRoundTrip(templateOf(original), 'json');
    const second = afterRoundTrip(templateOf(first.fields[0]), 'json');

    expect(second.fields[0]).toEqual(first.fields[0]);
  });
});

describe('through yaml', () => {
  it.each(named(lossless))('%s keeps its %s', (_paletteType, _name, cell) => {
    const original = fieldFor(cell.paletteType, cell.parameter);
    const readBack = afterRoundTrip(templateOf(original), 'yaml').fields[0];

    expect(cell.parameter.read(readBack)).toEqual(cell.parameter.read(original));
  });

  it.each(named(lossless))('%s settles its %s after one write', (_paletteType, _name, cell) => {
    const original = fieldFor(cell.paletteType, cell.parameter);
    const first = afterRoundTrip(templateOf(original), 'yaml');
    const second = afterRoundTrip(templateOf(first.fields[0]), 'yaml');

    expect(second.fields[0]).toEqual(first.fields[0]);
  });

  /**
   * The export refuses rather than quietly dropping the parameter, and says what to
   * do instead. Asserting the message, not just the throw: the author's only way out
   * is to export JSON, and a refusal that does not say so is a dead end.
   */
  it.each(named(refused))('%s will not export its %s as YAML', (_paletteType, _name, cell) => {
    const state = templateOf(fieldFor(cell.paletteType, cell.parameter));

    expect(() => templateToYaml(buildTemplate(state))).toThrow(/YAML cannot preserve every property/);
    expect(() => templateToYaml(buildTemplate(state))).toThrow(/Export JSON/);
  });
});

/**
 * The same parameters, wherever the field sits.
 *
 * Everything above writes a field at a template's root by the flat path. A parameter can survive
 * the root and be lost one level down, so each placement in `field-placements.testing.ts` is its
 * own axis. A standalone field has no parent to record a placement, so the designer offers none of
 * the placement parameters for one, and the cross leaves them out.
 */
const placedCells = PLACEMENTS.flatMap((placement) =>
  cells
    .filter(({ paletteType, parameter }) =>
      placement.parent ? allowedInContainer(paletteType, placement.parent) : !parameter.placement,
    )
    .flatMap((cell) => placement.forms.map((form) => ({ ...cell, placement, form }))),
);

describe('the placement axis admits the cells it should', () => {
  it('crosses every placement with every type it may hold and every parameter it can record', () => {
    for (const placement of PLACEMENTS) {
      const here = placedCells.filter((cell) => cell.placement === placement && cell.form === 'json');
      // An element cannot hold a page break; a standalone field records no placement.
      expect(new Set(here.map((cell) => cell.paletteType)).size).toBe(
        placement.parent === 'element' ? paletteTypes.length - 1 : paletteTypes.length,
      );
      if (!placement.parent) expect(here.some((cell) => cell.parameter.placement)).toBe(false);
    }
  });
});

const placed = (subset: typeof placedCells) =>
  subset.map((cell) => [cell.placement.name, cell.form, cell.paletteType, cell.parameter.name, cell] as const);
const keeps = placedCells.filter(
  (cell) => cell.parameter.name !== 'schemaText' && (cell.form === 'json' || cell.parameter.yaml !== 'refused'),
);

describe('at each placement', () => {
  it.each(placed(placedCells.filter((cell) => cell.form === 'json')))(
    'at %s through %s, %s with its %s writes an artifact the designer can save',
    (_placement, _form, _paletteType, _name, cell) => {
      const written = cell.placement.write(fieldFor(cell.paletteType, cell.parameter));

      expect(verdict(written, cell.placement.saved)).toEqual({ canSave: true, findings: [] });
    },
  );

  it.each(placed(keeps))('at %s through %s, %s keeps its %s', (_placement, _form, _paletteType, _name, cell) => {
    const original = fieldFor(cell.paletteType, cell.parameter);
    const readBack = cell.placement.roundTrip(original, cell.form);

    expect(cell.parameter.read(readBack)).toEqual(cell.parameter.read(original));
  });

  it.each(placed(placedCells.filter((cell) => cell.parameter.name === 'schemaText' && cell.form === 'json')))(
    'at %s through %s, %s derives its title from its name and keeps its schema description',
    (_placement, _form, _paletteType, _name, cell) => {
      const readBack = cell.placement.roundTrip(fieldFor(cell.paletteType, cell.parameter), cell.form);

      expect(cell.parameter.read(readBack)).toEqual(['F field schema', 'Custom schema description']);
    },
  );

  it.each(placed(placedCells.filter((cell) => cell.form === 'json' || cell.parameter.yaml !== 'refused')))(
    'at %s through %s, %s settles its %s after one write',
    (_placement, _form, _paletteType, _name, cell) => {
      const first = cell.placement.roundTrip(fieldFor(cell.paletteType, cell.parameter), cell.form);
      const second = cell.placement.roundTrip(first, cell.form);

      // Reading a container mints each node a new session id, which is not part of the artifact.
      expect({ ...second, id: 0 }).toEqual({ ...first, id: 0 });
    },
  );

  it.each(placed(placedCells.filter((cell) => cell.form === 'yaml' && cell.parameter.yaml === 'refused')))(
    'at %s through %s, %s will not export its %s',
    (_placement, _form, _paletteType, _name, cell) => {
      expect(() => cell.placement.roundTrip(fieldFor(cell.paletteType, cell.parameter), 'yaml')).toThrow(
        /YAML cannot preserve every property/,
      );
    },
  );
});
