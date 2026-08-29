import { Component, ElementRef, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';

import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService, FIELD_TYPES } from '../../core/services/template.service';
import { Field, CustomField } from '../../core/models/types';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-field-library-sidebar',
  standalone: true,
  imports: [DragDropModule, IconComponent],
  templateUrl: './field-library-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./field-library-sidebar.component.scss'],
})
export class FieldLibrarySidebarComponent {
  readonly service = inject(TemplateService);
  private readonly host = inject(ElementRef<HTMLElement>);

  fieldListHeight = 33.33; // percentage
  readonly isResizing = signal(false);
  readonly expandedBuiltIn = signal(true);
  readonly expandedLibraries = signal<Set<number>>(new Set());

  readonly visibleFieldTypesList = computed(() => {
    const visible = this.service.preferences().visibleFieldTypes;
    return Object.entries(FIELD_TYPES)
      .filter(([key]) => visible[key] !== false)
      .map(([key, value]) => ({ key, value }));
  });

  getFieldIconKey(field: Field): string {
    if (field.customFieldId) {
      const customField = this.service.customFields().find((cf) => cf.id === field.customFieldId);
      if (customField) {
        return customField.baseType;
      }
    }
    return field.type;
  }

  getFieldsForLibrary(libraryId: number): CustomField[] {
    return this.service.customFields().filter((cf) => cf.libraryId === libraryId);
  }

  toggleLibrary(libraryId: number) {
    this.expandedLibraries.update((prev) => {
      const next = new Set(prev);
      if (next.has(libraryId)) {
        next.delete(libraryId);
      } else {
        next.add(libraryId);
      }
      return next;
    });
  }

  onFieldDrop(event: CdkDragDrop<Field[]>) {
    this.service.moveField(event.previousIndex, event.currentIndex);
  }

  onResizeStart(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing.set(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const container = this.host.nativeElement.closest('.border-r');
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newHeight = ((moveEvent.clientY - containerRect.top) / containerRect.height) * 100;

      // Constrain between 10% and 75%
      this.fieldListHeight = Math.min(Math.max(newHeight, 10), 75);
    };

    const onMouseUp = () => {
      this.isResizing.set(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
}
