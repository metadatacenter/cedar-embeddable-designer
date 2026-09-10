import { Component, inject } from '@angular/core';
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
  readonly service = inject(TemplateService);
  readonly fieldView = fieldView;
  readonly childName = childName;
  destinations(node: ChildNode) {
    return this.service
      .containerChoices()
      .filter((choice) => node.kind !== 'element' || !findContainer(node.definition, choice.id));
  }
  onDrop(event: CdkDragDrop<unknown>) {
    this.service.moveChild(event.item.data as number, this.service.session.active().id, event.currentIndex);
  }
  importElement(): void {
    const targetId = this.service.session.active().id;
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
