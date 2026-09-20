import { InsertionActionsComponent } from '../insertion-actions/insertion-actions.component';
import { HeaderToggleDirective } from '../../shared/header-toggle.directive';
import { ContainerSettingsComponent } from '../container-settings/container-settings.component';
import { publicationStatusLabel } from '../../shared/publication-status';
import { Component, inject, input, computed, viewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService } from '../../core/services/template.service';
import { fieldView, findContainer } from '../../core/model/container-draft';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { FieldCardComponent } from '../field-card/field-card.component';
import { FieldTypePickerComponent } from '../field-type-picker/field-type-picker.component';
import { ElementCardComponent } from '../element-card/element-card.component';

/** The same editing surface serves the root document and every nested element. */
@Component({
  selector: 'app-container-editor',
  host: { '(click)': '$event.stopPropagation()' },
  imports: [
    InsertionActionsComponent,
    FormsModule,
    HeaderToggleDirective,
    DragDropModule,
    IconComponent,
    FieldCardComponent,
    FieldTypePickerComponent,
    ElementCardComponent,
    ContainerSettingsComponent,
  ],
  templateUrl: './container-editor.component.html',
  styleUrls: ['../../app.component.scss', './container-editor.component.scss'],
})
export class ContainerEditorComponent {
  selectCard(event: MouseEvent, id: number): void {
    event.stopPropagation();
    this.activate();
    this.service.selectedField.set(id);
    // Clicking card chrome enables arrows without stealing focus from editing controls.
    // Embedded CEF controls live in a shadow root: event.target is retargeted to
    // their host. Inspect the original path so clicking an input keeps its focus.
    const interactive = event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.matches(
            'input, textarea, select, button, a, label, [contenteditable], [role="tab"], [role="combobox"], [role="option"], [role="checkbox"], [role="radio"]',
          ),
      );
    if (!interactive) {
      (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    }
  }
  private readonly templateSettings = viewChild(ContainerSettingsComponent);
  private readonly elementSettings = viewChild(ElementCardComponent);
  toggleSettings(): void {
    const settings = this.placementNode() ? this.elementSettings() : this.templateSettings();
    settings?.toggleExpanded();
  }

  readonly publicationStatusLabel = publicationStatusLabel;
  readonly service = inject(TemplateService);
  readonly containerId = input<number>();
  readonly placementNode = input<import('../../core/model/container-draft').ElementNode>();
  readonly container = computed(
    () =>
      findContainer(this.service.session.document(), this.containerId() ?? this.service.session.document().id) ??
      this.service.session.document(),
  );
  readonly collapsed = computed(
    () => !!this.placementNode() && this.service.collapsedElements().has(this.container().id),
  );
  readonly dismissedInsertion = signal<number | null>(null);
  readonly fieldView = fieldView;
  update(
    changes: Partial<
      Pick<
        import('../../core/model/container-draft').ContainerDraft,
        'name' | 'description' | 'schemaIdentifier' | 'version'
      >
    >,
  ): void {
    this.service.updateContainerDefinition(this.container().id, changes);
  }
  activate(): void {
    this.service.session.activeId.set(this.container().id);
  }
  chooseField(index: number): void {
    this.activate();
    this.service.showPicker.set(index);
  }
  pickerAt(index: number): boolean {
    return this.service.session.active().id === this.container().id && this.service.showPicker() === index;
  }
  onDrop(event: CdkDragDrop<unknown>) {
    this.service.moveChild(event.item.data as number, this.container().id, event.currentIndex);
  }
}
