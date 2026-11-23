import { Injectable, computed, signal } from '@angular/core';
import type { CedPreferences } from '../../ced-public-api';
import { UserPreferences, PresetDefinitions, FIELD_TYPES } from '../models/types';
import { defaultPreferenceState, readPreferences, writePreferences } from './preference-exchange';

@Injectable({
  providedIn: 'root',
})
export class PreferencesService {
  // Modal Display States
  readonly showPreferencesModal = signal<boolean>(false);
  readonly showPresetDefinitionsModal = signal<boolean>(false);
  readonly showUserMenu = signal<boolean>(false);

  // Preset Definitions
  readonly presetDefinitions = signal<PresetDefinitions>(defaultPreferenceState().presets);

  // Start from the same Modular definition used by the profile selector.
  readonly preferences = signal<UserPreferences>(defaultPreferenceState().preferences);

  /** Every preference and preset definition, in the shape a host stores. */
  readonly exchanged = computed<CedPreferences>(() =>
    writePreferences({ preferences: this.preferences(), presets: this.presetDefinitions() }),
  );

  /**
   * The state the host already holds, serialized: the defaults, then its latest assignment or the
   * latest change it was told of. A state that differs from it is a change the author made.
   */
  private held = '';

  constructor() {
    // Sync all field types into preferences to ensure nothing is missing
    const currentFieldTypes = Object.keys(FIELD_TYPES);
    this.preferences.update((prev) => {
      const updatedVisibleFieldTypes = { ...prev.visibleFieldTypes };
      let hasChanges = false;

      currentFieldTypes.forEach((key) => {
        if (!(key in updatedVisibleFieldTypes)) {
          updatedVisibleFieldTypes[key] = true;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        return {
          ...prev,
          visibleFieldTypes: updatedVisibleFieldTypes,
        };
      }
      return prev;
    });
    this.held = JSON.stringify(this.exchanged());
  }

  /**
   * Replace the state with the one a host assigns.
   *
   * The assignment is not a change to report, so the state it leaves becomes the state the host
   * holds. A value that is not preferences at all leaves everything as it was.
   */
  supply(value: unknown): void {
    const state = readPreferences(value, (message) => console.warn(message));
    if (!state) return;
    this.preferences.set(state.preferences);
    this.presetDefinitions.set(state.presets);
    this.held = JSON.stringify(this.exchanged());
  }

  /**
   * The state once it differs from what the host holds, and `null` until it differs again.
   *
   * Comparing states rather than recording each command covers every route to a change, including
   * the preset dialog, which writes the definitions directly. A preference switched on and back off
   * before anyone asks is no change.
   */
  takeChange(): CedPreferences | null {
    const state = this.exchanged();
    const serialized = JSON.stringify(state);
    if (serialized === this.held) return null;
    this.held = serialized;
    return state;
  }

  /**
   * One preference, typed by the key that names it.
   *
   * Generic rather than `(key: keyof UserPreferences, value: any)`, which let
   * `fieldSelectionStyle` be set to a boolean and `showElements` to a string with
   * nothing to say so — the signal's own type could not help, because the value
   * had already been widened by the time it reached the update.
   */
  updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    this.preferences.update((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  updateFieldTypeVisibility(fieldType: string, visible: boolean) {
    this.preferences.update((prev) => ({
      ...prev,
      visibleFieldTypes: {
        ...prev.visibleFieldTypes,
        [fieldType]: visible,
      },
    }));
  }

  toggleAllFieldTypes(visible: boolean) {
    const updatedVisibility: Record<string, boolean> = {};
    Object.keys(FIELD_TYPES).forEach((key) => {
      updatedVisibility[key] = visible;
    });
    this.preferences.update((prev) => ({
      ...prev,
      visibleFieldTypes: updatedVisibility,
    }));
  }

  applyPreset(preset: 'basic' | 'semantic' | 'modular') {
    const definition = this.presetDefinitions()[preset];
    const visibleFieldTypes = Object.keys(FIELD_TYPES).reduce(
      (acc, key) => {
        acc[key] = !definition.hiddenFieldTypes.includes(key);
        return acc;
      },
      {} as Record<string, boolean>,
    );

    this.preferences.update((prev) => ({
      ...prev,
      showRequired: definition.showRequired,
      showAllowMultiple: definition.showAllowMultiple,
      showDefaultValue: definition.showDefaultValue,
      showElements: definition.showElements,
      visibleFieldTypes,
    }));
  }

  // Checks which preset matches current preferences configuration
  getActivePreset(): 'basic' | 'semantic' | 'modular' | null {
    const current = this.preferences();
    const definitions = this.presetDefinitions();

    for (const preset of ['basic', 'semantic', 'modular'] as const) {
      const def = definitions[preset];
      const matchConfig =
        current.showRequired === def.showRequired &&
        current.showAllowMultiple === def.showAllowMultiple &&
        current.showDefaultValue === def.showDefaultValue &&
        current.showElements === def.showElements;

      if (!matchConfig) continue;

      // Check hidden field types
      const hiddenMatches = Object.keys(FIELD_TYPES).every((key) => {
        const isHiddenInPref = !current.visibleFieldTypes[key];
        const isHiddenInDef = def.hiddenFieldTypes.includes(key);
        return isHiddenInPref === isHiddenInDef;
      });

      if (hiddenMatches) {
        return preset;
      }
    }
    return null;
  }
}
