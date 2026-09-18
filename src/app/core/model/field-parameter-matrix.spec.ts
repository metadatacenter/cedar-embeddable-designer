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
 * until someone compares it to what they meant.
 *
 * Settling says a second write changes nothing. Its failure is drift: a template
 * that shifts a little on every open-and-save, which is how a time field became a
 * date. A parameter can settle without being preserved (dropped consistently) and be
 * preserved without settling (normalised on a later pass), so neither claim implies
 * the other.
 *
 * The parameters here are the ones every field carries, so the cross is dense by
 * construction and any hole in it is deliberate. Per-type parameters — numeric
 * bounds, text length, temporal precision, media dimensions — are the descriptor's
 * `parameters` axis and belong to their own matrix.
 */
import { describe, expect, it } from 'vitest';
import { ArtifactMetadata, FIELD_TYPES, Field } from '../models/types';
import {
  DesignerTemplate,
  allowsMultiple,
  allowsStatus,
  buildTemplate,
  newFieldIdentity,
  readTemplate,
  templateToJson,
  templateToYaml,
  toDesignerTemplate,
} from './cedar-template';

const paletteTypes = Object.keys(FIELD_TYPES);

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

function templateOf(...fields: Field[]): DesignerTemplate {
  return {
    name: 'Study',
    description: 'A study',
    identifier: 'https://repo.metadatacenter.org/templates/11111111-1111-4111-8111-111111111111',
    version: '0.0.1',
    fields,
  };
}

/**
 * A controlled-term field with no vocabulary cannot be written as itself, so the
 * matrix gives every cell of that type one. Without it the field goes out IRI-shaped
 * with empty constraints and comes back a text field, and every cell would fail for
 * that one reason rather than for the parameter under test.
 */
function withTypeEssentials(paletteType: string): Partial<Field> {
  if (paletteType !== 'controlledTerms') return {};
  return {
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
  };
}

const metadata = (overrides: Partial<ArtifactMetadata>): ArtifactMetadata => ({
  title: null,
  description: null,
  schemaVersion: '1.6.0',
  version: '0.0.1',
  publicationStatus: 'bibo:draft',
  createdOn: null,
  createdBy: null,
  modifiedOn: null,
  modifiedBy: null,
  derivedFrom: null,
  previousVersion: null,
  ...overrides,
});

/**
 * One column of the matrix: a parameter, how an author sets it, and what must come
 * back.
 *
 * `read` takes the value off the designer's own state rather than out of the JSON,
 * because the designer's state is what an author sees when they reopen a template.
 * A value that reaches the artifact but not back into the card is still lost.
 */
interface SharedParameter {
  readonly name: string;
  readonly set: (paletteType: string) => Partial<Field>;
  readonly read: (field: Field) => unknown;
  /** Types that carry it, where it is not every type. */
  readonly appliesTo?: (paletteType: string) => boolean;
  /** What a YAML export does with it. Lossless unless stated. */
  readonly yaml?: YamlOutcome;
}

/**
 * What YAML does with a parameter.
 *
 * `templateToYaml` writes the YAML, reads it back and compares the two as JSON,
 * refusing to return a string that would lose anything. So a parameter YAML cannot
 * carry does not come back wrong: the export fails, and says why. Those are the only
 * two outcomes a cell may have, and the matrix records which — a parameter moving
 * between them is a change worth being told about, in either direction.
 *
 * `refused` is not a statement about the YAML format. The Java matrix in
 * `cedar-artifact-library` asserts that a child field's version, provenance,
 * `pav:derivedFrom` and `pav:previousVersion` all survive non-compact YAML, so what
 * is refused here is what the TypeScript writer and reader lose between them. The
 * guard is CED's; the gap is the model library's.
 */
type YamlOutcome = 'lossless' | 'refused';

const PARAMETERS: readonly SharedParameter[] = [
  {
    name: 'baseline',
    set: () => ({}),
    read: (field) => field.name,
  },
  {
    name: 'identifier',
    set: () => ({ schemaIdentifier: 'ID-42' }),
    read: (field) => field.schemaIdentifier,
  },
  {
    name: 'language',
    set: () => ({ language: 'fr' }),
    read: (field) => field.language,
  },
  {
    name: 'labels',
    set: () => ({ preferredLabel: 'Preferred', alternateLabels: ['Alternate', 'Autre'] }),
    read: (field) => [field.preferredLabel, field.alternateLabels],
  },
  {
    name: 'annotations',
    set: () => ({
      annotations: [
        { name: 'note', kind: 'literal' as const, value: 'Résumé – preserved' },
        { name: 'reference', kind: 'iri' as const, value: 'https://example.org/reference' },
      ],
    }),
    read: (field) => field.annotations,
  },
  {
    name: 'helpText',
    set: () => ({ helpText: 'Field help' }),
    read: (field) => field.helpText,
  },
  {
    name: 'display',
    set: () => ({ displayLabel: 'Shown', displayDescription: 'Shown help' }),
    read: (field) => [field.displayLabel, field.displayDescription],
  },
  {
    name: 'version',
    yaml: 'refused',
    set: () => ({ artifact: metadata({ version: '2.3.4' }) }),
    read: (field) => field.artifact?.version,
  },
  {
    name: 'published',
    yaml: 'refused',
    set: () => ({ artifact: metadata({ version: '2.3.4', publicationStatus: 'bibo:published' }) }),
    read: (field) => [field.artifact?.version, field.artifact?.publicationStatus],
  },
  {
    name: 'derivedFrom',
    yaml: 'refused',
    set: () => ({ artifact: metadata({ derivedFrom: 'https://example.org/fields/source' }) }),
    read: (field) => field.artifact?.derivedFrom,
  },
  {
    name: 'previousVersion',
    yaml: 'refused',
    set: () => ({ artifact: metadata({ previousVersion: 'https://example.org/fields/previous' }) }),
    read: (field) => field.artifact?.previousVersion,
  },
  {
    name: 'provenance',
    yaml: 'refused',
    set: () => ({
      artifact: metadata({
        createdBy: 'https://example.org/users/creator',
        modifiedBy: 'https://example.org/users/editor',
        createdOn: '2026-01-01T01:02:03Z',
        modifiedOn: '2026-02-01T04:05:06Z',
      }),
    }),
    read: (field) => [
      field.artifact?.createdBy,
      field.artifact?.modifiedBy,
      field.artifact?.createdOn,
      field.artifact?.modifiedOn,
    ],
  },
  {
    name: 'schemaText',
    yaml: 'refused',
    set: () => ({ artifact: metadata({ title: 'Custom schema title', description: 'Custom schema description' }) }),
    read: (field) => [field.artifact?.title, field.artifact?.description],
  },
  {
    name: 'required',
    set: () => ({ status: 'required' }),
    read: (field) => field.status,
    appliesTo: allowsStatus,
  },
  {
    name: 'recommended',
    set: () => ({ status: 'recommended' }),
    read: (field) => field.status,
    appliesTo: allowsStatus,
  },
  {
    name: 'cardinality',
    set: () => ({ allowMultiple: true, minItems: 1, maxItems: 4 }),
    read: (field) => [field.allowMultiple, field.minItems, field.maxItems],
    appliesTo: allowsMultiple,
  },
];

/** Every cell the rules above admit, as one flat list so each is its own test. */
const cells = paletteTypes.flatMap((paletteType) =>
  PARAMETERS.filter((parameter) => parameter.appliesTo?.(paletteType) ?? true).map((parameter) => ({
    paletteType,
    parameter,
  })),
);

const fieldFor = (paletteType: string, parameter: SharedParameter): Field =>
  field({ type: paletteType, ...withTypeEssentials(paletteType), ...parameter.set(paletteType) });

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
  it.each(named(cells))('%s keeps its %s', (_paletteType, _name, cell) => {
    const original = fieldFor(cell.paletteType, cell.parameter);
    const readBack = afterRoundTrip(templateOf(original), 'json').fields[0];

    expect(cell.parameter.read(readBack)).toEqual(cell.parameter.read(original));
  });

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
