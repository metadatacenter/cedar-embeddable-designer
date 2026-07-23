import { Component, inject, signal, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService, FIELD_TYPES } from './core/services/template.service';
import { Field } from './core/models/types';

// Custom components
import { IconComponent } from './shared/components/icon/icon.component';
import { FieldLibrarySidebarComponent } from './features/field-library-sidebar/field-library-sidebar.component';
import { PreferencesModalComponent } from './features/modals/preferences/preferences.component';
import { PresetDefinitionsModalComponent } from './features/modals/preset-definitions/preset-definitions.component';
import { ApiKeyModalComponent } from './features/modals/api-key/api-key.component';
import { PreviewPanelComponent } from './features/preview-panel/preview-panel.component';
import { FieldTypePickerComponent } from './features/field-type-picker/field-type-picker.component';
import { FieldDesignerComponent } from './features/field-designer/field-designer.component';
import { FieldCardComponent } from './features/field-card/field-card.component';
import { CedarExportAccordionsComponent } from './features/cedar-export-accordions/cedar-export-accordions.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    IconComponent,
    FieldLibrarySidebarComponent,
    PreferencesModalComponent,
    PresetDefinitionsModalComponent,
    ApiKeyModalComponent,
    PreviewPanelComponent,
    FieldTypePickerComponent,
    FieldDesignerComponent,
    FieldCardComponent,
    CedarExportAccordionsComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  readonly service = inject(TemplateService);

  // Layout & UI states
  readonly showFieldsOverview = signal(true);

  getEditorClasses(): Record<string, boolean> {
    const preview = this.service.showPreview();
    const selectionStyle = this.service.preferences().fieldSelectionStyle;
    const collapsed = this.service.sidebarCollapsed();
    return {
      'transition-all': true,
      'duration-300': true,
      'overflow-y-auto': true,
      'relative': true,
      'flex-1': true,
      'w-full': !preview,
      'w-2/3': preview,
      'pl-72': selectionStyle === 'sidebar' && !collapsed,
      'pl-12': selectionStyle === 'sidebar' && collapsed
    };
  }

  getGridTemplateColumns(): string {
    const fieldsCount = this.service.fields().length;
    const overview = this.showFieldsOverview();
    const preview = this.service.showPreview();
    if (fieldsCount > 0 && overview) {
      return preview ? '180px 1fr' : '256px 1fr';
    }
    return '1fr';
  }

  getOverviewButtonLeft(): string {
    const selectionStyle = this.service.preferences().fieldSelectionStyle;
    const collapsed = this.service.sidebarCollapsed();
    if (selectionStyle === 'sidebar') {
      return collapsed ? '4.5rem' : '19.5rem';
    }
    return '1.5rem';
  }


  // Field type list mapping
  get FIELD_TYPES_LIST() {
    return FIELD_TYPES;
  }

  getFieldIcon(field: Field): string {
    if (field.customFieldId) {
      const customField = this.service.customFields().find(cf => cf.id === field.customFieldId);
      if (customField) {
        return customField.baseType;
      }
    }
    return field.type;
  }

  getFieldTypeName(field: Field): string {
    if (field.customFieldId) {
      const customField = this.service.customFields().find(cf => cf.id === field.customFieldId);
      if (customField) return customField.name;
    }
    return FIELD_TYPES[field.type]?.label || field.type;
  }

  onFieldDrop(event: CdkDragDrop<Field[]>) {
    this.service.moveField(event.previousIndex, event.currentIndex);
  }

  scrollToField(fieldId: number) {
    this.service.selectedField.set(fieldId);
    const el = document.getElementById(`field-card-${fieldId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Auto-clear selection after 3 seconds
    setTimeout(() => {
      if (this.service.selectedField() === fieldId) {
        this.service.selectedField.set(null);
      }
    }, 3000);
  }

  // Close dropdowns on outside clicks
  @HostListener('document:mousedown', ['$event'])
  handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Close Field Type dropdowns
    if (this.service.fieldTypeDropdown() !== null && !target.closest('.field-type-dropdown-container')) {
      this.service.fieldTypeDropdown.set(null);
    }

    // Close User Menu dropdown
    if (this.service.showUserMenu() && !target.closest('.user-menu-container')) {
      this.service.showUserMenu.set(false);
    }
  }

  saveTemplate() {
    alert('Template saved successfully!');
  }
}
