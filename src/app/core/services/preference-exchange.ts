import type { CedFieldType, CedPreferences, CedPreset, CedPresetDefinition } from '../../ced-public-api';
import { FIELD_TYPES, PresetDefinition, PresetDefinitions, UserPreferences } from '../models/types';

/**
 * The preferences a host stores, read and written.
 *
 * The designer's own state and the contract differ in three places. The designer records, for
 * every field type, whether the pickers show it, and the contract lists the hidden types alone, so
 * a type a later version adds is shown to an author whose stored state predates it. The designer
 * calls the picker beside the insertion point `modal`, and the contract calls it `inline`, as the
 * Preferences dialog does. The designer holds preferences and preset definitions in two signals,
 * and the contract carries both in one value, since an edited preset decides which preset a stored
 * state is in.
 *
 * A host stores this value across versions of the designer, so reading it never fails. A key the
 * designer does not know and a value of the wrong type are each named in a warning and ignored,
 * which leaves that preference at its default.
 */
export interface PreferenceState {
  preferences: UserPreferences;
  presets: PresetDefinitions;
}

export const PRESETS: readonly CedPreset[] = ['basic', 'semantic', 'modular'];

const SWITCHES = ['showRequired', 'showAllowMultiple', 'showElements'] as const;
const DEFINITION_KEYS: readonly string[] = [...SWITCHES, 'hiddenFieldTypes'];
const PREFERENCE_KEYS: readonly string[] = [...DEFINITION_KEYS, 'fieldSelectionStyle', 'presets'];

function isFieldType(value: unknown): value is CedFieldType {
  return typeof value === 'string' && Object.hasOwn(FIELD_TYPES, value);
}

/** Every field type, in the order the contract lists hidden types in. */
const FIELD_TYPE_KEYS: readonly CedFieldType[] = Object.keys(FIELD_TYPES).filter(isFieldType);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function defaultPresetDefinitions(): PresetDefinitions {
  return {
    basic: {
      showRequired: true,
      showAllowMultiple: true,
      showElements: false,
      hiddenFieldTypes: ['controlledTerms'],
    },
    semantic: {
      showRequired: true,
      showAllowMultiple: true,
      showElements: false,
      hiddenFieldTypes: [],
    },
    modular: {
      showRequired: true,
      showAllowMultiple: true,
      showElements: true,
      hiddenFieldTypes: [],
    },
  };
}

function preferencesOf(definition: PresetDefinition, fieldSelectionStyle: 'modal' | 'sidebar'): UserPreferences {
  const { hiddenFieldTypes, ...switches } = definition;
  return {
    ...switches,
    fieldSelectionStyle,
    visibleFieldTypes: Object.fromEntries(FIELD_TYPE_KEYS.map((type) => [type, !hiddenFieldTypes.includes(type)])),
  };
}

/** A new designer starts in the Modular preset, with the picker beside the insertion point. */
export function defaultPreferenceState(): PreferenceState {
  const presets = defaultPresetDefinitions();
  return { preferences: preferencesOf(presets.modular, 'modal'), presets };
}

function hiddenTypes(hidden: (type: CedFieldType) => boolean): CedFieldType[] {
  return FIELD_TYPE_KEYS.filter(hidden);
}

function writeDefinition(definition: PresetDefinition): CedPresetDefinition {
  return {
    showRequired: definition.showRequired,
    showAllowMultiple: definition.showAllowMultiple,
    showElements: definition.showElements,
    hiddenFieldTypes: hiddenTypes((type) => definition.hiddenFieldTypes.includes(type)),
  };
}

/** The complete state in the contract's shape, built anew on every call. */
export function writePreferences({ preferences, presets }: PreferenceState): CedPreferences {
  return {
    showRequired: preferences.showRequired,
    showAllowMultiple: preferences.showAllowMultiple,
    showElements: preferences.showElements,
    hiddenFieldTypes: hiddenTypes((type) => preferences.visibleFieldTypes[type] === false),
    fieldSelectionStyle: preferences.fieldSelectionStyle === 'sidebar' ? 'sidebar' : 'inline',
    presets: {
      basic: writeDefinition(presets.basic),
      semantic: writeDefinition(presets.semantic),
      modular: writeDefinition(presets.modular),
    },
  };
}

/** One definition's keys from `source`, each falling back to `fallback` when absent or unusable. */
function readDefinition(
  source: Record<string, unknown>,
  fallback: PresetDefinition,
  path: string,
  warn: (message: string) => void,
): PresetDefinition {
  const definition: PresetDefinition = { ...fallback, hiddenFieldTypes: [...fallback.hiddenFieldTypes] };
  for (const key of SWITCHES) {
    const value = source[key];
    if (typeof value === 'boolean') definition[key] = value;
    else if (value !== undefined) warn(`Designer preference "${path}${key}" must be true or false. Ignored.`);
  }
  const hidden = source['hiddenFieldTypes'];
  if (Array.isArray(hidden)) {
    const listed: readonly unknown[] = hidden;
    for (const type of listed) {
      if (!isFieldType(type)) warn(`Unknown field type ${JSON.stringify(type)} in "${path}hiddenFieldTypes". Ignored.`);
    }
    definition.hiddenFieldTypes = hiddenTypes((type) => listed.includes(type));
  } else if (hidden !== undefined) {
    warn(`Designer preference "${path}hiddenFieldTypes" must be a list of field types. Ignored.`);
  }
  return definition;
}

function warnUnknownKeys(
  source: Record<string, unknown>,
  known: readonly string[],
  path: string,
  warn: (message: string) => void,
): void {
  for (const key of Object.keys(source)) {
    if (!known.includes(key)) warn(`Unknown designer preference "${path}${key}". Ignored.`);
  }
}

function readPresets(source: unknown, warn: (message: string) => void): PresetDefinitions {
  const presets = defaultPresetDefinitions();
  if (source === undefined) return presets;
  if (!isRecord(source)) {
    warn('Designer preference "presets" must be an object. Ignored.');
    return presets;
  }
  warnUnknownKeys(source, PRESETS, 'presets.', warn);
  for (const preset of PRESETS) {
    const definition = source[preset];
    if (isRecord(definition)) {
      warnUnknownKeys(definition, DEFINITION_KEYS, `presets.${preset}.`, warn);
      presets[preset] = readDefinition(definition, presets[preset], `presets.${preset}.`, warn);
    } else if (definition !== undefined) {
      warn(`Designer preference "presets.${preset}" must be an object. Ignored.`);
    }
  }
  return presets;
}

/**
 * The state a host's assignment selects, or `null` when the value is not preferences at all.
 *
 * `null` and `undefined` select the defaults: a host with nothing stored says so with them.
 */
export function readPreferences(source: unknown, warn: (message: string) => void): PreferenceState | null {
  if (source === null || source === undefined) return defaultPreferenceState();
  if (!isRecord(source)) {
    warn('CEDAR designer preferences must be an object. Ignored.');
    return null;
  }
  warnUnknownKeys(source, PREFERENCE_KEYS, '', warn);
  const defaults = defaultPreferenceState();
  const style = source['fieldSelectionStyle'];
  if (style !== undefined && style !== 'inline' && style !== 'sidebar') {
    warn('Designer preference "fieldSelectionStyle" must be "inline" or "sidebar". Ignored.');
  }
  return {
    preferences: preferencesOf(
      readDefinition(source, defaults.presets.modular, '', warn),
      style === 'sidebar' ? 'sidebar' : 'modal',
    ),
    presets: readPresets(source['presets'], warn),
  };
}
