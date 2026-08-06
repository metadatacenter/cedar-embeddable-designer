import { Component, inject, signal, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService, FIELD_TYPES } from './core/services/template.service';
import { ElectronService } from './core/services/electron.service';
import { toCedarJson, toCedarYaml } from './core/cedar-shim';
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
export class AppComponent implements OnInit, OnDestroy {
  readonly service = inject(TemplateService);
  readonly electronService = inject(ElectronService);

  private menuUnsubscribe: (() => void) | null = null;

  // Layout & UI states
  readonly showFieldsOverview = signal(true);
  readonly showFileMenu = signal(false);

  ngOnInit() {
    this.menuUnsubscribe = this.electronService.onMenuAction((action) => {
      if (action === 'new') this.newTemplate();
      else if (action === 'open') this.openTemplateFile();
      else if (action === 'save') this.saveTemplate();
      else if (action === 'save-as') this.saveTemplateAs();
    });
  }

  ngOnDestroy() {
    if (this.menuUnsubscribe) {
      this.menuUnsubscribe();
    }
  }

  // Keyboard Shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+Shift+S, Cmd/Ctrl+O, Cmd/Ctrl+N)
  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcuts(event: KeyboardEvent) {
    const isCmdOrCtrl = event.metaKey || event.ctrlKey;
    if (isCmdOrCtrl && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (event.shiftKey) {
        this.saveTemplateAs();
      } else {
        this.saveTemplate();
      }
    } else if (isCmdOrCtrl && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      this.openTemplateFile();
    } else if (isCmdOrCtrl && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.newTemplate();
    }
  }

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
    this.electronService.isDirty.set(true);
  }

  scrollToField(fieldId: number) {
    this.service.selectedField.set(fieldId);
    const el = document.getElementById(`field-card-${fieldId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
      if (this.service.selectedField() === fieldId) {
        this.service.selectedField.set(null);
      }
    }, 3000);
  }

  @HostListener('document:mousedown', ['$event'])
  handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (this.service.fieldTypeDropdown() !== null && !target.closest('.field-type-dropdown-container')) {
      this.service.fieldTypeDropdown.set(null);
    }

    if (this.service.showUserMenu() && !target.closest('.user-menu-container')) {
      this.service.showUserMenu.set(false);
    }

    if (this.showFileMenu() && !target.closest('.file-menu-container')) {
      this.showFileMenu.set(false);
    }
  }

  // File Operations
  newTemplate() {
    if (this.electronService.isDirty()) {
      const confirmDiscard = confirm('You have unsaved changes. Create new template without saving?');
      if (!confirmDiscard) return;
    }
    this.service.resetTemplate();
    this.electronService.currentFilePath.set(null);
    this.electronService.isDirty.set(false);
  }

  async openTemplateFile() {
    if (this.electronService.isDirty()) {
      const confirmDiscard = confirm('You have unsaved changes. Open another template file without saving?');
      if (!confirmDiscard) return;
    }

    if (this.electronService.isElectron) {
      const result = await this.electronService.showOpenDialog([
        { name: 'CEDAR Template Files (*.json, *.yaml)', extensions: ['json', 'yaml', 'yml'] },
        { name: 'JSON Files (*.json)', extensions: ['json'] },
        { name: 'YAML Files (*.yaml)', extensions: ['yaml', 'yml'] }
      ]);

      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const res = await this.electronService.readFile(filePath);
        if (res.success && res.content) {
          try {
            this.service.loadTemplate(res.content);
            this.electronService.currentFilePath.set(filePath);
            this.electronService.isDirty.set(false);
          } catch (err) {
            alert('Failed to parse selected template file.');
          }
        } else {
          alert('Could not read selected file: ' + (res.error || 'Unknown error'));
        }
      }
    } else {
      // Browser fallback file prompt
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.yaml,.yml';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (evt.target?.result) {
              this.service.loadTemplate(evt.target.result as string);
              this.electronService.isDirty.set(false);
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }
  }

  async saveTemplate() {
    const currentPath = this.electronService.currentFilePath();
    if (!currentPath) {
      await this.saveTemplateAs();
      return;
    }
    await this.writeToFile(currentPath);
  }

  async saveTemplateAs() {
    if (this.electronService.isElectron) {
      const suggestedName = (this.service.templateName() || 'template')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_') + '.json';

      const result = await this.electronService.showSaveDialog(suggestedName, [
        { name: 'CEDAR JSON Model (*.json)', extensions: ['json'] },
        { name: 'CEDAR YAML Model (*.yaml)', extensions: ['yaml', 'yml'] }
      ]);

      if (result && !result.canceled && result.filePath) {
        await this.writeToFile(result.filePath);
      }
    } else {
      // Web fallback download
      const cedarJson = toCedarJson(
        this.service.templateName(),
        this.service.templateDesc(),
        this.service.fields(),
        this.service.templateIdentifier(),
        this.service.templateVersion()
      );
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(cedarJson, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${this.service.templateName() || 'template'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.electronService.isDirty.set(false);
    }
  }

  private async writeToFile(filePath: string) {
    const isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');
    const cedarJson = toCedarJson(
      this.service.templateName(),
      this.service.templateDesc(),
      this.service.fields(),
      this.service.templateIdentifier(),
      this.service.templateVersion()
    );

    const fileContent = isYaml
      ? toCedarYaml(cedarJson)
      : JSON.stringify(cedarJson, null, 2);

    const res = await this.electronService.writeFile(filePath, fileContent);
    if (res.success) {
      this.electronService.currentFilePath.set(filePath);
      this.electronService.isDirty.set(false);
    } else {
      alert('Failed to save file: ' + (res.error || 'Unknown error'));
    }
  }
}
