import {
  Component,
  Input,
  inject,
  signal,
  ElementRef,
  HostListener,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService, FIELD_TYPES } from '../../core/services/template.service';
import { CustomField } from '../../core/models/types';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-field-type-picker',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './field-type-picker.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./field-type-picker.component.scss'],
})
export class FieldTypePickerComponent {
  readonly service = inject(TemplateService);
  private readonly elementRef = inject(ElementRef);

  @Input() insertPosition = 0;

  searchText = '';
  readonly showDropdown = signal(false);

  get selectedLibraryName(): string {
    const libId = this.service.fieldTypeDropdownLibrary();
    if (libId === null) return 'Standard';
    const lib = this.service.libraries().find((l) => l.id === libId);
    return lib ? lib.name : 'Standard';
  }

  get filteredLibraries() {
    return this.service.libraries().filter((lib) => lib.name.toLowerCase().includes(this.searchText.toLowerCase()));
  }

  get libraryCustomFields(): CustomField[] {
    const libId = this.service.fieldTypeDropdownLibrary();
    return libId !== null ? this.service.customFields().filter((f) => f.libraryId === libId) : [];
  }

  readonly visibleFieldTypesList = computed(() => {
    const visible = this.service.preferences().visibleFieldTypes;
    return Object.entries(FIELD_TYPES)
      .filter(([key]) => visible[key] !== false)
      .map(([key, value]) => ({ key, value }));
  });

  handleSelectLibrary(id: number | null) {
    this.service.fieldTypeDropdownLibrary.set(id);
    this.showDropdown.set(false);
    this.searchText = '';
  }

  onFieldClick(key: string) {
    this.service.addField(key, this.insertPosition);
  }

  onCustomFieldClick(field: CustomField) {
    this.service.addCustomFieldToTemplate(field, this.insertPosition);
  }

  close() {
    this.service.showPicker.set(null);
  }

  @HostListener('document:mousedown', ['$event'])
  handleClickOutside(event: MouseEvent) {
    if (!this.showDropdown()) {
      return;
    }
    // The composed path, not `event.target`: an event leaving a shadow root is
    // retargeted at its host, so the dropdown would close on its own opening click.
    const insideDropdown = event
      .composedPath()
      .some((node) => node instanceof Element && node.matches('.library-dropdown-container'));
    if (!insideDropdown) {
      this.showDropdown.set(false);
      this.searchText = '';
    }
  }
}
