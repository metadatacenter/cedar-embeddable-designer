import { Component, input, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ContainerDraft, ChildNode, childName } from '../../core/model/container-draft';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-container-outline',
  imports: [DragDropModule, IconComponent, TranslatePipe],
  template: `<ul cdkDropList [cdkDropListData]="container().children" (cdkDropListDropped)="drop($event)">
    @for (node of container().children; track node.id) {
      <li cdkDrag [cdkDragData]="node.id" [cdkDragDisabled]="locked(node)">
        <div
          class="outline-row"
          [class.active]="service.selectedField() === node.id"
          [class.invalid]="service.visibleIssuesFor(node.id).length > 0"
        >
          <button type="button" class="select-node" (click)="select(node)">
            <app-icon [key]="node.kind === 'field' ? node.definition.type : 'folder'" className="w-4 h-4" />
            <span class="node-name">{{
              childName(node) ||
                ((node.kind === 'field' ? 'validation.unnamed.field' : 'validation.unnamed.element') | translate)
            }}</span>
            @if (service.visibleIssuesFor(node.id).length; as count) {
              <span
                class="validation-badge"
                [attr.aria-label]="'outline.errors' | translate: { count: count }"
                [title]="'outline.errors' | translate: { count: count }"
                ><app-icon key="warning" size="small" /> {{ count }}</span
              >
            }
            @if (node.kind === 'field' && node.placement.status === 'required') {
              <span [attr.aria-label]="'common.required' | translate">*</span>
            }
          </button>
          @if (node.kind === 'element') {
            <button
              type="button"
              class="outline-toggle"
              [attr.aria-expanded]="!service.collapsedElements().has(node.id)"
              [attr.aria-label]="
                (service.collapsedElements().has(node.id) ? 'common.expandNamed' : 'common.collapseNamed')
                  | translate: { name: childName(node) }
              "
              [title]="(service.collapsedElements().has(node.id) ? 'outline.expand' : 'outline.collapse') | translate"
              (click)="service.toggleElement(node.id)"
            >
              <app-icon
                key="chevronDown"
                className="w-3 h-3"
                [style.transform]="service.collapsedElements().has(node.id) ? 'rotate(-90deg)' : ''"
              />
            </button>
          }
          <button
            type="button"
            class="outline-drag-handle"
            cdkDragHandle
            [disabled]="locked(node)"
            [attr.aria-label]="'outline.reorder' | translate: { name: childName(node) }"
            [title]="'outline.reorderHint' | translate"
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
        width: var(--cedar-icon-size-small);
        height: var(--cedar-icon-size-large);
        padding: 0;
        color: var(--cedar-text-muted);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        min-width: 0;
        background: var(--cedar-surface-raised);
      }
      .outline-row {
        display: flex;
        align-items: center;
        gap: var(--cedar-space-1);
        padding: 0 var(--cedar-space-2);
      }
      .outline-row.invalid {
        box-shadow: inset calc(var(--cedar-space-1) * 0.75) 0 var(--cedar-status-error-text);
      }
      .validation-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--cedar-space-1);
        color: var(--cedar-status-error-text);
        font-size: var(--cedar-font-size);
      }
      .outline-row:hover {
        background: var(--cedar-surface-row-hover);
      }
      .outline-row.active {
        background: var(--cedar-surface-selected);
      }
      button {
        border: 0;
        background: transparent;
        font: inherit;
        cursor: pointer;
      }
      .select-node {
        display: flex;
        flex: 0 1 auto;
        align-items: center;
        gap: var(--cedar-space-2);
        min-width: 0;
        padding: calc(var(--cedar-space-1) / 2) 0;
        color: var(--cedar-text-authoring);
        text-align: left;
        font-size: var(--cedar-font-size);
      }
      .select-node app-icon {
        flex: none;
        color: var(--cedar-text-muted);
      }
      .node-name {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .outline-drag-handle {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: var(--cedar-icon-size-large);
        height: var(--cedar-icon-size-large);
        padding: 0;
        color: var(--cedar-text-muted);
        cursor: grab;
      }
      .outline-drag-handle:disabled {
        opacity: var(--cedar-control-disabled-opacity);
        cursor: default;
      }
      app-container-outline {
        margin-left: var(--cedar-space-3);
      }
      .cdk-drag-placeholder {
        opacity: 0.25;
      }
      .cdk-drag-preview {
        box-sizing: border-box;
        background: var(--cedar-surface-raised);
        box-shadow: var(--cedar-menu-shadow);
        list-style: none;
      }
      button:focus-visible {
        outline: 2px solid var(--cedar-color-primary);
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
