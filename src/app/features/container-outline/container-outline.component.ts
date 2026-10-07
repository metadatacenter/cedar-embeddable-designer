import { elementDisplayName, fieldDisplayName } from '../../core/model/field-display-name';
import { Component, input, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ContainerDraft, ChildNode, fieldView } from '../../core/model/container-draft';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { TranslatePipe } from '@ngx-translate/core';
import { CountKeyPipe } from '../../i18n/count-key.pipe';

@Component({
  selector: 'app-container-outline',
  imports: [DragDropModule, IconComponent, CountKeyPipe, TranslatePipe],
  template: `<ul cdkDropList [cdkDropListData]="container().children" (cdkDropListDropped)="drop($event)">
    @for (node of container().children; track node.id) {
      <li cdkDrag [cdkDragData]="node.id" [cdkDragDisabled]="locked(node)">
        <div
          class="outline-row"
          [class.active]="service.selectedField() === node.id"
          [class.invalid]="service.visibleIssuesFor(node.id).length > 0"
        >
          <button type="button" class="select-node" (click)="select(node)">
            <app-icon [key]="node.kind === 'field' ? node.definition.type : 'folder'" size="small" />
            <span class="node-name">{{
              displayName(node) ||
                ((node.kind === 'field' ? 'validation.unnamed.field' : 'validation.unnamed.element') | translate)
            }}</span>
            @if (service.visibleIssuesFor(node.id).length; as count) {
              <span
                class="validation-badge"
                [attr.aria-label]="'outline.errors' | countKey: count | translate: { count: count }"
                [title]="'outline.errors' | countKey: count | translate: { count: count }"
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
                  | translate: { name: displayName(node) }
              "
              [title]="(service.collapsedElements().has(node.id) ? 'outline.expand' : 'outline.collapse') | translate"
              (click)="service.toggleElement(node.id)"
            >
              <app-icon
                key="chevronDown"
                size="fill"
                class="outline-chevron"
                [style.transform]="service.collapsedElements().has(node.id) ? 'rotate(-90deg)' : ''"
              />
            </button>
          }
          <button
            type="button"
            class="outline-drag-handle"
            cdkDragHandle
            [disabled]="locked(node)"
            [attr.aria-label]="'outline.reorder' | translate: { name: displayName(node) }"
            [title]="'outline.reorderHint' | translate"
            (keydown)="moveWithKeyboard($event, node)"
          >
            <app-icon key="list" size="small" />
          </button>
        </div>
        @if (node.kind === 'element') {
          <app-container-outline [container]="node.definition" [hidden]="service.collapsedElements().has(node.id)" />
        }
      </li>
    }
  </ul>`,
  styleUrl: './container-outline.component.scss',
})
export class ContainerOutlineComponent {
  readonly container = input.required<ContainerDraft>();
  readonly service = inject(TemplateService);
  displayName(node: ChildNode): string {
    return node.kind === 'field' ? fieldDisplayName(fieldView(node)) : elementDisplayName(node);
  }
  /** A child inside a published element keeps its place. */
  locked(node: ChildNode): boolean {
    return this.service.placementLocked(node.id);
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
    this.service.selectedField.set(node.id);
    this.service.scrollRequest.set(node.id);
  }
}
