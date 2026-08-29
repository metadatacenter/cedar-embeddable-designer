import { Injectable, signal } from '@angular/core';
import { UserPreferences, PresetDefinitions, FIELD_TYPES } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class PreferencesService {
  // Modal Display States
  readonly showPreferencesModal = signal<boolean>(false);
  readonly showPresetDefinitionsModal = signal<boolean>(false);
  readonly showUserMenu = signal<boolean>(false);

  // Preset Definitions
  readonly presetDefinitions = signal<PresetDefinitions>({
    basic: {
      showRequired: true,
      showAllowMultiple: true,
      showHelpText: false,
      showDefaultValue: false,
      showFieldDesigner: false,
      showElements: false,
      hiddenFieldTypes: ['controlledTerms'],
    },
    semantic: {
      showRequired: true,
      showAllowMultiple: true,
      showHelpText: true,
      showDefaultValue: true,
      showFieldDesigner: true,
      showElements: false,
      hiddenFieldTypes: [],
    },
    modular: {
      showRequired: true,
      showAllowMultiple: true,
      showHelpText: true,
      showDefaultValue: true,
      showFieldDesigner: true,
      showElements: true,
      hiddenFieldTypes: [],
    },
  });

  // User Preferences
  readonly preferences = signal<UserPreferences>({
    showRequired: true,
    showAllowMultiple: true,
    showHelpText: false,
    showDefaultValue: false,
    showFieldDesigner: false,
    showElements: false,
    fieldSelectionStyle: 'modal',
    visibleFieldTypes: Object.keys(FIELD_TYPES).reduce(
      (acc, key) => {
        acc[key] = key !== 'controlledTerms';
        return acc;
      },
      {} as Record<string, boolean>,
    ),
  });

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
  }

  /**
   * One preference, typed by the key that names it.
   *
   * Generic rather than `(key: keyof UserPreferences, value: any)`, which let
   * `fieldSelectionStyle` be set to a boolean and `showHelpText` to a string with
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
      showHelpText: definition.showHelpText,
      showDefaultValue: definition.showDefaultValue,
      showFieldDesigner: definition.showFieldDesigner,
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
        current.showHelpText === def.showHelpText &&
        current.showDefaultValue === def.showDefaultValue &&
        current.showFieldDesigner === def.showFieldDesigner &&
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
