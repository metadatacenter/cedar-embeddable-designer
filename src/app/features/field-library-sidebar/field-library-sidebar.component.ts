import { fieldDisplayName } from '../../core/model/field-display-name';
import { InsertionActionsComponent } from '../insertion-actions/insertion-actions.component';
import { FieldTypePickerComponent } from '../field-type-picker/field-type-picker.component';
import { PALETTE_FIELD_TYPES } from '../../core/models/types';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  computed,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';

import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService } from '../../core/services/template.service';
import { Field, CustomField } from '../../core/models/types';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { TranslatePipe } from '@ngx-translate/core';
import { CountKeyPipe } from '../../i18n/count-key.pipe';

@Component({
  selector: 'app-field-library-sidebar',
  standalone: true,
  imports: [
    DragDropModule,
    IconComponent,
    InsertionActionsComponent,
    FieldTypePickerComponent,
    CountKeyPipe,
    TranslatePipe,
  ],
  templateUrl: './field-library-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./field-library-sidebar.component.scss'],
})
export class FieldLibrarySidebarComponent {
  readonly service = inject(TemplateService);
  readonly displayName = fieldDisplayName;

  select(id: number): void {
    this.service.openContainer(this.service.parentContainerId(id));
    this.service.selectedField.set(id);
    this.service.scrollRequest.set(id);
  }
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /**
   * Collapsing or expanding the sidebar replaces the button that was pressed, so the button that
   * reverses it takes focus once it renders.
   */
  setCollapsed(collapsed: boolean): void {
    this.service.sidebarCollapsed.set(collapsed);
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLButtonElement>(collapsed ? '.btn-expand' : '.btn-collapse')?.focus(),
      { injector: this.injector },
    );
  }

  /** The field list's share of the sidebar's height, in percent. The panel below it takes the rest. */
  readonly fieldListHeight = signal(33.33);
  readonly isResizing = signal(false);
  /** The sidebar's own container, whose height the field list and the panel below it divide. */
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');
  readonly expandedBuiltIn = signal(true);
  readonly expandedLibraries = signal<Set<number>>(new Set());

  readonly visibleFieldTypesList = computed(() => {
    const visible = this.service.preferences().visibleFieldTypes;
    return Object.entries(PALETTE_FIELD_TYPES)
      .filter(([key]) => visible[key] !== false && this.service.canAddField(key))
      .map(([key, value]) => ({ key, value }));
  });

  getFieldIconKey(field: Field): string {
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
      const containerRect = this.sidebar().nativeElement.getBoundingClientRect();
      const newHeight = ((moveEvent.clientY - containerRect.top) / containerRect.height) * 100;

      // Constrain between 10% and 75%
      this.fieldListHeight.set(Math.min(Math.max(newHeight, 10), 75));
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
