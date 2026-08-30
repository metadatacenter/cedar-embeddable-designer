import { Component, ElementRef, HostListener, ChangeDetectionStrategy, effect, inject, signal } from '@angular/core';
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
import { CeePreviewComponent } from './features/cee-preview/cee-preview.component';
import { FieldTypePickerComponent } from './features/field-type-picker/field-type-picker.component';
import { FieldDesignerComponent } from './features/field-designer/field-designer.component';
import { FieldCardComponent } from './features/field-card/field-card.component';

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
    CeePreviewComponent,
    FieldTypePickerComponent,
    FieldDesignerComponent,
    FieldCardComponent,
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  readonly service = inject(TemplateService);
  private readonly host = inject(ElementRef<HTMLElement>);

  // Layout & UI states
  readonly showFieldsOverview = signal(true);
  readonly showFileMenu = signal(false);

  constructor() {
    // A newly added field asks to be scrolled to; the component owns the DOM, so
    // it is the component that finds the card. `afterNextRender` is not enough on
    // its own here — the request outlives the render that satisfies it — so the
    // request is cleared once served.
    effect(() => {
      const fieldId = this.service.scrollRequest();
      if (fieldId === null) {
        return;
      }
      this.service.scrollRequest.set(null);
      requestAnimationFrame(() => this.scrollToCard(fieldId));
    });
  }

  /**
   * The card for a field, looked up in this component's own root.
   *
   * `getRootNode()` rather than `document`, because the editor renders inside the
   * element's shadow root when it is embedded, and a document-wide lookup finds
   * nothing there.
   */
  private scrollToCard(fieldId: number): void {
    const root = this.host.nativeElement.getRootNode() as Document | ShadowRoot;
    const card = root.querySelector(`#field-card-${fieldId}`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  getEditorClasses(): Record<string, boolean> {
    const preview = this.service.showPreview();
    const selectionStyle = this.service.preferences().fieldSelectionStyle;
    const collapsed = this.service.sidebarCollapsed();
    return {
      'transition-all': true,
      'duration-300': true,
      'overflow-y-auto': true,
      relative: true,
      'flex-1': true,
      'w-full': !preview,
      'w-2/3': preview,
      'pl-72': selectionStyle === 'sidebar' && !collapsed,
      'pl-12': selectionStyle === 'sidebar' && collapsed,
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
      const customField = this.service.customFields().find((cf) => cf.id === field.customFieldId);
      if (customField) {
        return customField.baseType;
      }
    }
    return field.type;
  }

  getFieldTypeName(field: Field): string {
    if (field.customFieldId) {
      const customField = this.service.customFields().find((cf) => cf.id === field.customFieldId);
      if (customField) return customField.name;
    }
    return FIELD_TYPES[field.type]?.label || field.type;
  }

  onFieldDrop(event: CdkDragDrop<Field[]>) {
    this.service.moveField(event.previousIndex, event.currentIndex);
  }

  scrollToField(fieldId: number) {
    this.service.selectedField.set(fieldId);
    this.scrollToCard(fieldId);

    setTimeout(() => {
      if (this.service.selectedField() === fieldId) {
        this.service.selectedField.set(null);
      }
    }, 3000);
  }

  @HostListener('document:mousedown', ['$event'])
  handleClickOutside(event: MouseEvent) {
    /*
     * `composedPath()` rather than `event.target`. A mousedown inside the shadow
     * root is retargeted at the host element by the time it reaches the document,
     * so every `closest()` below would miss and each of these menus would close on
     * its own opening click. The composed path is the route the event actually
     * took, shadow tree included.
     */
    const path = event.composedPath();
    const within = (selector: string) => path.some((node) => node instanceof Element && node.matches(selector));

    if (this.service.fieldTypeDropdown() !== null && !within('.field-type-dropdown-container')) {
      this.service.fieldTypeDropdown.set(null);
    }

    if (this.service.showUserMenu() && !within('.user-menu-container')) {
      this.service.showUserMenu.set(false);
    }

    if (this.showFileMenu() && !within('.file-menu-container')) {
      this.showFileMenu.set(false);
    }
  }

  // File Operations

  newTemplate(): void {
    if (!this.confirmDiscard('Create a new template without saving?')) {
      return;
    }
    this.service.resetTemplate();
  }

  /**
   * Open a template file the user picks.
   *
   * A file input rather than a native dialog. The Electron shell that owned the
   * native one is gone: an embedded component reads and writes through its host,
   * and the standalone application is a web page like any other.
   */
  openTemplateFile(): void {
    if (!this.confirmDiscard('Open another template without saving?')) {
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.yaml,.yml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.service.loadTemplate(reader.result as string);
        } catch {
          alert('Failed to parse the selected template file.');
        }
      };
      reader.onerror = () => alert('Could not read the selected file.');
      reader.readAsText(file);
    };
    input.click();
  }

  saveTemplateAsJson(): void {
    this.download(JSON.stringify(this.service.templateJson(), null, 2), 'application/json', 'json');
  }

  saveTemplateAsYaml(): void {
    this.download(this.service.templateYaml(), 'application/yaml', 'yaml');
  }

  /** The template name, reduced to something a filesystem will take. */
  private fileName(extension: string): string {
    const stem = (this.service.templateName() || 'template').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    return `${stem || 'template'}.${extension}`;
  }

  private download(contents: string, mimeType: string, extension: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.fileName(extension);
    // Appended to the document rather than to this component: the anchor is never
    // rendered, and a shadow root is not a place a synthetic click needs to happen.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    this.service.markSaved();
  }

  private confirmDiscard(question: string): boolean {
    return !this.service.isDirty() || confirm(`You have unsaved changes. ${question}`);
  }
}
