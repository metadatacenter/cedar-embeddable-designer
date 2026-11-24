import { TestBed } from '@angular/core/testing';
import { PreferencesService } from './preferences.service';
import { FIELD_TYPES, UserPreferences } from '../models/types';

/**
 * The presets and the preference state they write.
 *
 * `getActivePreset` answers by comparing the current preferences against each
 * preset definition, which is the one place in this service where a preset is
 * more than a bag of booleans: applying one and reading it back has to name the
 * preset that was applied, or the user menu shows nothing selected.
 */
describe('PreferencesService', () => {
  let service: PreferencesService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PreferencesService);
  });

  it('starts with the Modular profile', () => {
    expect(service.getActivePreset()).toBe('modular');
  });

  it.each(['basic', 'semantic', 'modular'] as const)('reads back %s after applying it', (preset) => {
    service.applyPreset(preset);
    expect(service.getActivePreset()).toBe(preset);
  });

  it('hides exactly the field types a preset names', () => {
    service.applyPreset('basic');
    const visible = service.preferences().visibleFieldTypes;
    const hidden = Object.keys(FIELD_TYPES).filter((type) => !visible[type]);
    expect(hidden).toEqual(['controlledTerms']);
  });

  it('stops reporting a preset once one of its settings changes', () => {
    service.applyPreset('modular');
    service.updatePreference('showRequired', false);
    expect(service.getActivePreset()).toBeNull();
  });

  it('names a preset reached by hand from another', () => {
    service.applyPreset('basic');
    service.updateFieldTypeVisibility('controlledTerms', true);
    expect(service.getActivePreset()).toBe('semantic');
  });

  it('ignores a preference the designer no longer reads', () => {
    service.preferences.update((current) => ({ ...current, showFieldDesigner: false }) as UserPreferences);
    expect(service.getActivePreset()).toBe('modular');
  });

  it('stops reporting a preset once a field type is hidden by hand', () => {
    service.applyPreset('semantic');
    service.updateFieldTypeVisibility('email', false);
    expect(service.getActivePreset()).toBeNull();
  });

  /**
   * What a host is told, and what it is not.
   *
   * A host stores every state it hears. Hearing the defaults at startup would store a state the
   * author never chose, and hearing its own assignment back would have it write what it just read.
   * So only a difference from the state the host already holds counts as a change.
   */
  describe('the change a host is told of', () => {
    it('is nothing until the author changes a preference', () => {
      expect(service.takeChange()).toBeNull();
    });

    it('is the complete state, once', () => {
      service.updatePreference('showElements', false);

      const change = service.takeChange();
      expect(change).toEqual({ ...service.exchanged(), showElements: false });
      expect(change?.presets.basic.hiddenFieldTypes).toEqual(['controlledTerms']);
      expect(service.takeChange()).toBeNull();
    });

    it.each([
      ['a preference', (target: PreferencesService) => target.updatePreference('fieldSelectionStyle', 'sidebar')],
      ['a hidden field type', (target: PreferencesService) => target.updateFieldTypeVisibility('email', false)],
      ['every field type at once', (target: PreferencesService) => target.toggleAllFieldTypes(false)],
      ['a chosen preset', (target: PreferencesService) => target.applyPreset('basic')],
      [
        // The preset dialog writes the definitions directly, without a command of the service.
        'a redefined preset',
        (target: PreferencesService) =>
          target.presetDefinitions.update((presets) => ({
            ...presets,
            basic: { ...presets.basic, showElements: true },
          })),
      ],
    ])('includes %s', (_name, change) => {
      change(service);

      expect(service.takeChange()).toEqual(service.exchanged());
    });

    it('is not a preference switched on and back before anyone asked', () => {
      service.updatePreference('showElements', false);
      service.updatePreference('showElements', true);

      expect(service.takeChange()).toBeNull();
    });

    it("is not the host's own assignment", () => {
      service.supply({ showElements: false, fieldSelectionStyle: 'sidebar' });

      expect(service.preferences().showElements).toBe(false);
      expect(service.preferences().fieldSelectionStyle).toBe('sidebar');
      expect(service.takeChange()).toBeNull();
    });

    it('is a change the author makes after an assignment', () => {
      service.supply({ showElements: false });
      service.updatePreference('showRequired', false);

      expect(service.takeChange()).toMatchObject({ showElements: false, showRequired: false });
    });

    it('is not an unreported change that an assignment replaces', () => {
      service.updatePreference('showRequired', false);
      service.supply({ showElements: false });

      expect(service.preferences().showRequired).toBe(true);
      expect(service.takeChange()).toBeNull();
    });
  });

  describe("a host's assignment", () => {
    it('replaces the state rather than patching it', () => {
      service.supply({ showElements: false });
      service.supply({ showRequired: false });

      expect(service.exchanged()).toMatchObject({ showElements: true, showRequired: false });
    });

    it('restores the defaults when the host has nothing stored', () => {
      const defaults = service.exchanged();
      service.applyPreset('basic');
      service.supply(null);

      expect(service.exchanged()).toEqual(defaults);
    });

    it('leaves the state as it was when the value is not preferences', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      service.applyPreset('basic');
      const before = service.exchanged();

      service.supply('basic');

      expect(service.exchanged()).toEqual(before);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    /*
     * The active preset is found by comparing the preferences with each definition. A stored state
     * that left out the definitions, or one of the settings a definition holds, would name another
     * preset or none after a reload, and the Basic preset is what withholds elements and imports.
     */
    it.each(['basic', 'semantic', 'modular'] as const)(
      'puts a later designer in the %s preset it was stored in',
      (preset) => {
        service.applyPreset(preset);
        const later = new PreferencesService();

        later.supply(JSON.parse(JSON.stringify(service.exchanged())));

        expect(later.getActivePreset()).toBe(preset);
        expect(later.exchanged()).toEqual(service.exchanged());
      },
    );

    it('puts a later designer in a preset the author redefined', () => {
      service.presetDefinitions.update((presets) => ({
        ...presets,
        basic: { ...presets.basic, showElements: true, hiddenFieldTypes: ['email', 'controlledTerms'] },
      }));
      service.applyPreset('basic');
      const later = new PreferencesService();

      later.supply(JSON.parse(JSON.stringify(service.exchanged())));

      expect(later.getActivePreset()).toBe('basic');
      expect(later.preferences().showElements).toBe(true);
      expect(later.preferences().visibleFieldTypes['email']).toBe(false);
    });
  });
});
