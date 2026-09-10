import { publicationStatusLabel } from '../../shared/publication-status';
import { Component, inject, input, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService } from '../../core/services/template.service';
import { ChildNode, fieldView, childName, findContainer } from '../../core/model/container-draft';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { FieldCardComponent } from '../field-card/field-card.component';
import { FieldTypePickerComponent } from '../field-type-picker/field-type-picker.component';
import { ElementCardComponent } from '../element-card/element-card.component';

/** The same editing surface serves the root document and every nested element. */
@Component({
  selector: 'app-container-editor',
  host: { '(click)': '$event.stopPropagation()' },
  imports: [
    FormsModule,
    DragDropModule,
    IconComponent,
    FieldCardComponent,
    FieldTypePickerComponent,
    ElementCardComponent,
  ],
  templateUrl: './container-editor.component.html',
  styleUrls: ['../../app.component.scss', './container-editor.component.scss'],
})
export class ContainerEditorComponent {
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
  readonly childName = childName;
  destinations(node: ChildNode) {
    return this.service
      .containerChoices()
      .filter((choice) => node.kind !== 'element' || !findContainer(node.definition, choice.id));
  }
  onDrop(event: CdkDragDrop<unknown>) {
    this.service.moveChild(event.item.data as number, this.container().id, event.currentIndex);
  }
  importElement(): void {
    const targetId = this.container().id;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.yaml,.yml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        this.service.importElement(await file.text(), targetId);
      } catch (error) {
        this.service.loadError.set(error instanceof Error ? error.message : String(error));
      }
    };
    input.click();
  }
}
