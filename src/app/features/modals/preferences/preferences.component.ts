import { Component, inject, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService, FIELD_TYPES } from '../../../core/services/template.service';
import { UserPreferences } from '../../../core/models/types';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-preferences-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './preferences.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./preferences.component.scss'],
})
export class PreferencesModalComponent {
  readonly service = inject(TemplateService);

  readonly presets: Array<'basic' | 'semantic' | 'modular'> = ['basic', 'semantic', 'modular'];

  get fieldTypesList() {
    return Object.entries(FIELD_TYPES).map(([key, value]) => ({ key, value }));
  }

  /**
   * One preference, typed by the key that names it.
   *
   * Generic rather than `(key: string, value: any)` with a cast at the call. The
   * cast is what let a typo compile into a preference nobody has, and what let
   * `fieldSelectionStyle` — the one key here that is not a boolean — be set to
   * one. Angular infers the parameter from the literal each template call passes.
   */
  updatePref<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    this.service.updatePreference(key, value);
  }

  updateFieldVisibility(key: string, visible: boolean) {
    this.service.updateFieldTypeVisibility(key, visible);
  }

  close() {
    this.service.showPreferencesModal.set(false);
  }
}
