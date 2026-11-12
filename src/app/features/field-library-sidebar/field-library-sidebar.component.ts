import { fieldDisplayName } from '../../core/model/field-display-name';
import { InsertionActionsComponent } from '../insertion-actions/insertion-actions.component';
import { FieldTypePickerComponent } from '../field-type-picker/field-type-picker.component';
import { PALETTE_FIELD_TYPES } from '../../core/models/types';
import {
  ChangeDetectorRef,
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
import { CLICK_SLOP, nextPresetSize } from '../../shared/preset-sizes';

/** A press on the divider: the share it began at, and whether it moved far enough to be a drag. */
interface DividerPress {
  share: number;
  moved: boolean;
}

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

  /** The entry that has focus while focus is in the field list, or null while it is elsewhere. */
  readonly focusedEntry = signal<number | null>(null);
  /**
   * The list's one Tab stop. While focus is in the list it is the focused entry, so Tab leaves the
   * list from wherever the arrow keys went. Otherwise it is the selected field's entry, or the first.
   */
  readonly fieldListTabStop = computed(() => {
    const ids = this.service.fields().map((field) => field.id);
    const focused = this.focusedEntry();
    if (focused !== null && ids.includes(focused)) return focused;
    const selected = this.service.selectedField();
    return selected !== null && ids.includes(selected) ? selected : (ids[0] ?? null);
  });

  private readonly changeDetector = inject(ChangeDetectorRef);

  /** Focus that leaves the list releases the Tab stop, so the list is next entered at the selected field. */
  onFieldListFocusout(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !(event.currentTarget instanceof Node) || !event.currentTarget.contains(next)) {
      this.focusedEntry.set(null);
      this.changeDetector.detectChanges();
    }
  }

  /**
   * Up, Down, Home and End move focus among the entries and stop at the ends. Enter chooses the
   * focused entry as a click does, and then moves focus to the field's card.
   */
  onEntryKeydown(event: KeyboardEvent, id: number): void {
    const entry = event.currentTarget;
    // A key pressed on something inside the entry is not the entry's.
    if (!(entry instanceof HTMLElement) || event.target !== entry) return;
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.select(id);
      this.service.focusRequest.set({ kind: 'card', id });
      return;
    }
    const ids = this.service.fields().map((field) => field.id);
    const index = ids.indexOf(id);
    const target =
      event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'ArrowDown'
          ? index + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ids.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    // Past either end there is no entry, so focus stays where it is.
    entry.parentElement?.querySelectorAll<HTMLElement>(':scope > [role="option"]')[target]?.focus();
    // The Tab stop follows focus at once, so a Tab pressed before the next render leaves from here.
    this.changeDetector.detectChanges();
  }

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

  /** The share the field list starts at, in percent of the sidebar's height. */
  readonly fieldListDefaultHeight = 33.33;
  /** The field list's share of the sidebar's height, in percent. The libraries below it take what is left. */
  readonly fieldListHeight = signal(this.fieldListDefaultHeight);
  readonly fieldListMinHeight = 10;
  readonly fieldListMaxHeight = 75;
  /** The share as the divider reports it: a whole percentage. */
  readonly fieldListHeightValue = computed(() => Math.round(this.fieldListHeight()));
  readonly isResizing = signal(false);
  /** The sidebar's own container. The field list's share is of its height. */
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

  /** The last press on the divider, until the click that ends it. */
  private resizePress: DividerPress | null = null;

  onResizeStart(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing.set(true);
    const press: DividerPress = { share: this.fieldListHeight(), moved: false };
    this.resizePress = press;

    // The divider moves as far as the pointer does, from wherever it was taken hold of.
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (Math.abs(moveEvent.clientY - e.clientY) > CLICK_SLOP) press.moved = true;
      const height = this.sidebar().nativeElement.getBoundingClientRect().height;
      this.setFieldListHeight(press.share + ((moveEvent.clientY - e.clientY) / height) * 100);
    };

    const onMouseUp = () => {
      this.isResizing.set(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /**
   * A click that is no drag steps the divider through the field list's smallest, default and largest
   * shares, the ones Home, End and a new designer give. The step starts from the share the press began
   * at, so a slight movement during the click does not change where it goes.
   */
  stepFieldListHeight(event: MouseEvent): void {
    const press = this.resizePress;
    this.resizePress = null;
    if (event.button !== 0 || press?.moved) return;
    this.setFieldListHeight(
      nextPresetSize(press?.share ?? this.fieldListHeight(), [
        this.fieldListMinHeight,
        this.fieldListDefaultHeight,
        this.fieldListMaxHeight,
      ]),
    );
  }

  /** The arrow keys move the divider by 5 points of the sidebar's height, 10 with Shift; Home and End set the limits. */
  resizeWithKeyboard(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 5;
    const heights: Record<string, number> = {
      ArrowUp: this.fieldListHeightValue() - step,
      ArrowDown: this.fieldListHeightValue() + step,
      Home: this.fieldListMinHeight,
      End: this.fieldListMaxHeight,
    };
    if (!(event.key in heights)) return;
    event.preventDefault();
    this.setFieldListHeight(heights[event.key]);
  }

  private setFieldListHeight(height: number): void {
    this.fieldListHeight.set(Math.min(Math.max(height, this.fieldListMinHeight), this.fieldListMaxHeight));
  }
}
