import { Component, inject, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService, FIELD_TYPES } from '../../../core/services/template.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-preferences-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './preferences.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./preferences.component.scss'],
})
export class PreferencesModalComponent {
  readonly service = inject(TemplateService);

  readonly presets: Array<'basic' | 'semantic' | 'modular'> = ['basic', 'semantic', 'modular'];

  get fieldTypesList() {
    return Object.entries(FIELD_TYPES).map(([key, value]) => ({ key, value }));
  }

  updatePref(key: string, value: any) {
    this.service.updatePreference(key as any, value);
  }

  updateFieldVisibility(key: string, visible: boolean) {
    this.service.updateFieldTypeVisibility(key, visible);
  }

  close() {
    this.service.showPreferencesModal.set(false);
  }
}
