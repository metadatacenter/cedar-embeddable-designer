/**
 * The capability descriptor, held to what the model library actually offers.
 *
 * The descriptor is the designer's single answer to what a type accepts, and every
 * control and every writer branch asks it rather than testing a type's name. That
 * only helps if the descriptor is true, and nothing in the type system makes it so:
 * `parameters: ['numericBounds']` on a text field would compile.
 *
 * So these checks ask the library. Each one runs in both directions, because the two
 * failures are different and both matter. A claim the library cannot honour is a
 * control that writes nothing and tells the author nothing. A setter the library has
 * and the descriptor omits is a parameter CEDAR can carry and the designer silently
 * cannot, which is the failure that goes unnoticed for a release: it looks exactly
 * like a feature nobody asked for yet.
 *
 * The second direction is why `UNADOPTED` is spelled out rather than filtered away.
 * A parameter goes in it deliberately, with the reason, and the list is the work
 * remaining. When the library grows a setter, this spec fails until someone either
 * adopts it or writes down why not.
 */
import { describe, expect, it } from 'vitest';
import { CedarFieldType } from 'cedar-model-typescript-library';
import { FIELD_TYPES } from '../models/types';
import { FieldParameter, PARAMETER_SETTERS, descriptorOf, parametersOf } from './cedar-template';

const paletteTypes = Object.keys(FIELD_TYPES);

/**
 * Editable artifact metadata shared by every field type.
 */
const SHARED_SETTERS = new Set([
  'withAlternateLabels',
  'addAlternateLabel',
  'withDescription',
  'withPreferredLabel',
  'withSchemaDescription',
  'withSchemaIdentifier',
  'withSchemaName',
  'withTitle',
]);

/**
 * Setters the descriptor accounts for outside `parameters`, because another field of
 * the descriptor already decides them: `defaultKind` decides the default, `options`
 * the option list, `content` the one value a static field shows.
 */
const DESCRIBED_ELSEWHERE = new Set([
  'withDefaultValue',
  'addRadioOption',
  'addCheckboxOption',
  'addListOption',
  'withContent',
  'withVideoId',
]);

/**
 * Setters the library offers that the designer does not author yet, each with the
 * reason it is not simply missing.
 *
 * This is the parameter half of the coverage the roadmap's first goal asks for, and
 * it should empty out as that work lands.
 */
const UNADOPTED: Record<string, string> = {
  addAction: 'Imported controlled-term exclusion and reordering are preserved; authoring is deferred.',
  withAtId: 'Assigned or imported field identity is displayed, not edited.',
  withCreatedBy: 'Imported provenance is displayed, not edited.',
  withCreatedOn: 'Imported provenance is displayed, not edited.',
  withDerivedFrom: 'Imported provenance is displayed, not edited.',
  withLastUpdatedOn: 'Imported provenance is displayed, not edited.',
  withModifiedBy: 'Imported provenance is displayed, not edited.',
  withSchemaVersion: 'The model schema version is preserved, not edited.',
  withStatus: 'Publication authoring is deferred.',
  withVersion: 'Field version authoring is deferred.',
};

/** Every setter on a built builder, including the ones it inherits. */
function settersOf(paletteType: string): string[] {
  const builder = descriptorOf(paletteType).build() as unknown as object;
  const names = new Set<string>();
  for (let object = builder; object && object !== Object.prototype; object = Object.getPrototypeOf(object)) {
    for (const name of Object.getOwnPropertyNames(object)) {
      if (!/^(with|add)[A-Z]/.test(name)) continue;
      if (typeof (builder as Record<string, unknown>)[name] !== 'function') continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

describe('the palette and the model library', () => {
  /**
   * Both directions over the type axis. The palette half already had a home in
   * `cedar-template.spec.ts`; the library half is the one that was missing, and it
   * is the half that fails when CEDAR grows a field type.
   */
  it('claims every CEDAR field type the library defines', () => {
    const claimed = new Set(paletteTypes.map((type) => descriptorOf(type).cedarType.getValue()));
    const defined = CedarFieldType.values().map((type) => type.getValue());
    expect([...defined].filter((type) => !claimed.has(type))).toEqual([]);
  });

  it('claims no CEDAR field type the library does not define', () => {
    const defined = new Set(CedarFieldType.values().map((type) => type.getValue()));
    const claimed = paletteTypes.map((type) => descriptorOf(type).cedarType.getValue());
    expect(claimed.filter((type) => !defined.has(type))).toEqual([]);
  });
});

describe('the parameters a descriptor claims', () => {
  it.each(paletteTypes)('are all setters %s really has', (paletteType) => {
    const available = new Set(settersOf(paletteType));
    const missing = parametersOf(paletteType).flatMap((parameter) =>
      PARAMETER_SETTERS[parameter].filter((setter) => !available.has(setter)).map((setter) => `${parameter}/${setter}`),
    );
    expect(missing).toEqual([]);
  });

  /**
   * The direction that finds what the designer cannot author. A setter here is a
   * parameter CEDAR carries and no control writes, which is invisible from inside
   * the designer: nothing looks broken, the artifact is simply poorer than it could
   * be.
   */
  it.each(paletteTypes)('account for every setter %s offers', (paletteType) => {
    const claimed = new Set(parametersOf(paletteType).flatMap((parameter) => PARAMETER_SETTERS[parameter]));
    const unaccounted = settersOf(paletteType).filter(
      (setter) =>
        !claimed.has(setter) &&
        !SHARED_SETTERS.has(setter) &&
        !DESCRIBED_ELSEWHERE.has(setter) &&
        !(setter in UNADOPTED),
    );
    expect(unaccounted).toEqual([]);
  });
});

describe('the parameter table', () => {
  it('names at least one setter for every parameter', () => {
    const empty = (Object.keys(PARAMETER_SETTERS) as FieldParameter[]).filter(
      (parameter) => PARAMETER_SETTERS[parameter].length === 0,
    );
    expect(empty).toEqual([]);
  });

  /** A parameter no type claims is a row nothing reads, and a decision left half-made. */
  it('has a type behind every parameter it defines', () => {
    const claimed = new Set(paletteTypes.flatMap((type) => parametersOf(type)));
    const orphans = (Object.keys(PARAMETER_SETTERS) as FieldParameter[]).filter((parameter) => !claimed.has(parameter));
    expect(orphans).toEqual([]);
  });
});
