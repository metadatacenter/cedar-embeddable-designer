import type { CedFieldType, CedPreferences } from '../../ced-public-api';
import { FIELD_TYPES } from '../models/types';
import { defaultPreferenceState, readPreferences, writePreferences } from './preference-exchange';

/**
 * The preferences a host stores, as a contract.
 *
 * A host keeps this value for as long as it likes and hands it to whichever version of the designer
 * it loads next. Three properties follow, and each is pinned here. The written state is complete and
 * its shape is fixed. Everything written reads back as itself. A value the designer did not write,
 * whether older, newer or mistaken, costs one preference its stored value and never the rest.
 */
const DEFAULTS: CedPreferences = {
  showRequired: true,
  showAllowMultiple: true,
  showDefaultValue: true,
  showElements: true,
  hiddenFieldTypes: [],
  fieldSelectionStyle: 'inline',
  presets: {
    basic: {
      showRequired: true,
      showAllowMultiple: true,
      showDefaultValue: false,
      showElements: false,
      hiddenFieldTypes: ['controlledTerms'],
    },
    semantic: {
      showRequired: true,
      showAllowMultiple: true,
      showDefaultValue: true,
      showElements: false,
      hiddenFieldTypes: [],
    },
    modular: {
      showRequired: true,
      showAllowMultiple: true,
      showDefaultValue: true,
      showElements: true,
      hiddenFieldTypes: [],
    },
  },
};

/** Every key differs from its default, so a key that is not read or not written fails the comparison. */
const CHANGED: CedPreferences = {
  showRequired: false,
  showAllowMultiple: false,
  showDefaultValue: false,
  showElements: false,
  hiddenFieldTypes: ['email', 'youtube'],
  fieldSelectionStyle: 'sidebar',
  presets: {
    basic: {
      showRequired: false,
      showAllowMultiple: false,
      showDefaultValue: true,
      showElements: true,
      hiddenFieldTypes: ['text'],
    },
    semantic: {
      showRequired: false,
      showAllowMultiple: false,
      showDefaultValue: false,
      showElements: true,
      hiddenFieldTypes: ['number'],
    },
    modular: {
      showRequired: false,
      showAllowMultiple: false,
      showDefaultValue: false,
      showElements: false,
      hiddenFieldTypes: ['doi'],
    },
  },
};

function read(source: unknown) {
  const warnings: string[] = [];
  const state = readPreferences(source, (message) => warnings.push(message));
  return { state, warnings, written: state ? writePreferences(state) : null };
}

/*
 * The contract names its field types in a union, and the designer keeps its own in a table. Naming
 * every member of the union here makes the compiler refuse a missing or an extra one, and the
 * comparison then holds the table to the same set.
 */
it('names the same field types in the contract as the designer has', () => {
  const named: Record<CedFieldType, true> = {
    text: true,
    paragraph: true,
    multipleChoice: true,
    checkboxes: true,
    singleChoiceList: true,
    multipleChoiceList: true,
    date: true,
    time: true,
    email: true,
    link: true,
    phone: true,
    number: true,
    controlledTerms: true,
    attributeValue: true,
    orcid: true,
    ror: true,
    pfas: true,
    rrid: true,
    pubmed: true,
    nihGrantId: true,
    doi: true,
    image: true,
    richText: true,
    youtube: true,
    sectionBreak: true,
    pageBreak: true,
  };

  expect(Object.keys(named)).toEqual(Object.keys(FIELD_TYPES));
});

describe('writing', () => {
  it('writes the defaults in full', () => {
    expect(writePreferences(defaultPreferenceState())).toEqual(DEFAULTS);
  });

  it('builds a new value on every call', () => {
    const state = defaultPreferenceState();
    const first = writePreferences(state);
    first.presets.basic.hiddenFieldTypes.push('text');
    first.hiddenFieldTypes.push('text');

    expect(writePreferences(state)).toEqual(DEFAULTS);
  });

  it('lists a hidden type once, in the order the contract names field types', () => {
    const { written } = read({ hiddenFieldTypes: ['youtube', 'text', 'youtube'] });

    expect(written?.hiddenFieldTypes).toEqual(['text', 'youtube']);
  });
});

describe('reading', () => {
  it('reads every key the contract declares, and writes each back', () => {
    const { written, warnings } = read(CHANGED);

    expect(written).toEqual(CHANGED);
    expect(warnings).toEqual([]);
  });

  it('reads the JSON a host stored as the value it was', () => {
    expect(read(JSON.parse(JSON.stringify(CHANGED))).written).toEqual(CHANGED);
  });

  it.each([null, undefined])('selects the defaults for a host with nothing stored (%s)', (nothing) => {
    const { written, warnings } = read(nothing);

    expect(written).toEqual(DEFAULTS);
    expect(warnings).toEqual([]);
  });

  it('takes the default for every key a host omits', () => {
    expect(read({}).written).toEqual(DEFAULTS);
    expect(read({ showElements: false }).written).toEqual({ ...DEFAULTS, showElements: false });
    expect(read({ presets: { basic: { showElements: true } } }).written).toEqual({
      ...DEFAULTS,
      presets: { ...DEFAULTS.presets, basic: { ...DEFAULTS.presets.basic, showElements: true } },
    });
  });

  it('shows the pickers every field type a stored state does not hide', () => {
    const { state } = read({ hiddenFieldTypes: ['email'] });

    expect(state?.preferences.visibleFieldTypes).toEqual(
      Object.fromEntries(Object.keys(FIELD_TYPES).map((type) => [type, type !== 'email'])),
    );
  });

  it.each([
    ['inline', 'modal'],
    ['sidebar', 'sidebar'],
  ] as const)('reads the %s picker as the designer calls it', (stored, held) => {
    expect(read({ fieldSelectionStyle: stored }).state?.preferences.fieldSelectionStyle).toBe(held);
  });

  it.each([42, 'stored', true, []])('refuses %j, which is not preferences at all', (value) => {
    const { state, warnings } = read(value);

    expect(state).toBeNull();
    expect(warnings).toEqual(['CEDAR designer preferences must be an object. Ignored.']);
  });

  it.each([
    [{ showRequired: 'yes' }, '"showRequired"'],
    [{ showElements: null }, '"showElements"'],
    [{ fieldSelectionStyle: 'modal' }, '"fieldSelectionStyle"'],
    [{ hiddenFieldTypes: 'email' }, '"hiddenFieldTypes"'],
    [{ hiddenFieldTypes: ['hologram'] }, '"hologram"'],
    [{ hiddenFieldTypes: [7] }, 'Unknown field type 7'],
    [{ theme: 'dark' }, '"theme"'],
    [{ presets: [] }, '"presets"'],
    [{ presets: { expert: {} } }, '"presets.expert"'],
    [{ presets: { basic: 3 } }, '"presets.basic"'],
    [{ presets: { basic: { showRequired: 1 } } }, '"presets.basic.showRequired"'],
    [{ presets: { basic: { hiddenFieldTypes: 'email' } } }, '"presets.basic.hiddenFieldTypes"'],
    [{ presets: { modular: { colour: 'red' } } }, '"presets.modular.colour"'],
  ])('names what it cannot use in %j and leaves that preference at its default', (value, named) => {
    const { written, warnings } = read(value);

    expect(written).toEqual(DEFAULTS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(named);
  });

  // A newer designer may have stored a type this one lacks. The rest of that list still applies.
  it('drops a field type it does not know from a list and keeps the others', () => {
    const { written, warnings } = read({ presets: { basic: { hiddenFieldTypes: ['hologram', 'email'] } } });

    expect(written?.presets.basic.hiddenFieldTypes).toEqual(['email']);
    expect(warnings).toEqual(['Unknown field type "hologram" in "presets.basic.hiddenFieldTypes". Ignored.']);
  });

  it('keeps the usable values beside one it cannot use', () => {
    const { written, warnings } = read({
      showRequired: 'yes',
      showElements: false,
      hiddenFieldTypes: ['email', 'hologram'],
      presets: { basic: { showRequired: 1, showElements: true } },
    });

    expect(written).toEqual({
      ...DEFAULTS,
      showElements: false,
      hiddenFieldTypes: ['email'],
      presets: { ...DEFAULTS.presets, basic: { ...DEFAULTS.presets.basic, showElements: true } },
    });
    expect(warnings).toHaveLength(3);
  });
});
