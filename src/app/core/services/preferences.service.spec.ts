import { TestBed } from '@angular/core/testing';
import { PreferencesService } from './preferences.service';
import { FIELD_TYPES } from '../models/types';

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

  it('reports basic for the initial preferences', () => {
    // The defaults are the `basic` preset spelled out a second time, in the
    // signal initializer rather than in the preset table. Worth pinning: the two
    // are edited independently, and nothing else would notice them diverging.
    expect(service.getActivePreset()).toBe('basic');
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
    service.updatePreference('showHelpText', false);
    expect(service.getActivePreset()).toBeNull();
  });

  it('stops reporting a preset once a field type is hidden by hand', () => {
    service.applyPreset('semantic');
    service.updateFieldTypeVisibility('email', false);
    expect(service.getActivePreset()).toBeNull();
  });

  it('persists an API key and clears the stored value when it is emptied', () => {
    // The effect that writes the key runs on the next tick, not on assignment.
    service.bioportalApiKey.set('a-key');
    TestBed.tick();
    expect(localStorage.getItem('bioportalApiKey')).toBe('a-key');

    service.bioportalApiKey.set('');
    TestBed.tick();
    expect(localStorage.getItem('bioportalApiKey')).toBeNull();
  });
});
