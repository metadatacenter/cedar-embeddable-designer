import { Component, input, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ContainerDraft, ChildNode, childName } from '../../core/model/container-draft';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-container-outline',
  imports: [DragDropModule, IconComponent],
  template: `<ul cdkDropList [cdkDropListData]="container().children" (cdkDropListDropped)="drop($event)">
    @for (node of container().children; track node.id) {
      <li cdkDrag [cdkDragData]="node.id" [cdkDragDisabled]="locked(node)">
        <div class="outline-row" [class.active]="service.selectedField() === node.id">
          @if (node.kind === 'element') {
            <button
              type="button"
              class="outline-toggle"
              [attr.aria-expanded]="!service.collapsedElements().has(node.id)"
              [attr.aria-label]="(service.collapsedElements().has(node.id) ? 'Expand ' : 'Collapse ') + childName(node)"
              [title]="service.collapsedElements().has(node.id) ? 'Expand element' : 'Collapse element'"
              (click)="service.toggleElement(node.id)"
            >
              <app-icon
                key="chevronDown"
                className="w-3 h-3"
                [style.transform]="service.collapsedElements().has(node.id) ? 'rotate(-90deg)' : ''"
              />
            </button>
          }
          <button type="button" class="select-node" (click)="select(node)">
            <app-icon [key]="node.kind === 'field' ? node.definition.type : 'folder'" className="w-4 h-4" />
            <span class="node-name">{{ childName(node) }}</span>
            @if (node.placement.status === 'required') {
              <span aria-label="Required">*</span>
            }
          </button>
          <button
            type="button"
            class="outline-drag-handle"
            cdkDragHandle
            [disabled]="locked(node)"
            [attr.aria-label]="'Reorder ' + childName(node)"
            title="Drag to reorder; use arrow keys to move up or down"
            (keydown)="moveWithKeyboard($event, node)"
          >
            <app-icon key="list" className="w-4 h-4" />
          </button>
        </div>
        @if (node.kind === 'element') {
          <app-container-outline [container]="node.definition" [hidden]="service.collapsedElements().has(node.id)" />
        }
      </li>
    }
  </ul>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      :host([hidden]) {
        display: none;
      }
      .outline-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 16px;
        height: 24px;
        padding: 0;
        color: #64748b;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        min-width: 0;
        background: white;
      }
      .outline-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 8px;
      }
      .outline-row:hover {
        background: #f9fafb;
      }
      .outline-row.active {
        background: #ecfdf5;
      }
      button {
        border: 0;
        background: transparent;
        font: inherit;
        cursor: pointer;
      }
      .select-node {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 2px 0;
        color: #374151;
        text-align: left;
        font-size: 12px;
      }
      .select-node app-icon {
        flex: none;
        color: #64748b;
      }
      .node-name {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .outline-drag-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 24px;
        height: 24px;
        padding: 0;
        color: #64748b;
        cursor: grab;
      }
      .outline-drag-handle:disabled {
        opacity: 0.4;
        cursor: default;
      }
      app-container-outline {
        margin-left: 12px;
      }
      .cdk-drag-placeholder {
        opacity: 0.25;
      }
      .cdk-drag-preview {
        box-sizing: border-box;
        background: white;
        box-shadow: 0 3px 10px #0003;
        list-style: none;
      }
      button:focus-visible {
        outline: 2px solid #0f7686;
        outline-offset: 1px;
      }
    `,
  ],
})
export class ContainerOutlineComponent {
  readonly container = input.required<ContainerDraft>();
  readonly service = inject(TemplateService);
  readonly childName = childName;
  locked(node: ChildNode): boolean {
    return node.kind === 'field' && !!node.definition.publishedDefinition;
  }
  drop(event: CdkDragDrop<ChildNode[]>): void {
    // CDK sorts only its local DOM while dragging. Commit the document on drop.
    if (event.previousIndex !== event.currentIndex)
      this.service.moveChild(event.item.data as number, this.container().id, event.currentIndex);
  }
  moveWithKeyboard(event: KeyboardEvent, node: ChildNode): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (this.locked(node)) return;
    const children = this.container().children;
    const index = children.findIndex((child) => child.id === node.id);
    const next = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (next >= 0 && next < children.length) this.service.moveChild(node.id, this.container().id, next);
  }
  select(node: ChildNode): void {
    this.service.openContainer(node.kind === 'element' ? node.id : this.container().id);
    if (node.kind === 'field') {
      this.service.selectedField.set(node.id);
      this.service.scrollRequest.set(node.id);
    }
  }
}
