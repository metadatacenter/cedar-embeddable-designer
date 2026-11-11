import { elementDisplayName, fieldDisplayName } from '../../core/model/field-display-name';
import { Component, Injector, afterNextRender, input, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ContainerDraft, ChildNode, fieldView, findContainer } from '../../core/model/container-draft';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { TranslatePipe } from '@ngx-translate/core';
import { CountKeyPipe } from '../../i18n/count-key.pipe';

@Component({
  selector: 'app-container-outline',
  imports: [DragDropModule, IconComponent, CountKeyPipe, TranslatePipe],
  template: `<ul cdkDropList [cdkDropListData]="container().children" (cdkDropListDropped)="drop($event)">
    @for (node of container().children; track node.id; let first = $first, last = $last) {
      <li cdkDrag [cdkDragData]="node.id" [cdkDragDisabled]="locked(node)">
        <div
          class="outline-row"
          [class.active]="service.selectedField() === node.id"
          [class.invalid]="service.visibleIssuesFor(node.id).length > 0"
        >
          <button type="button" class="select-node" (click)="select(node)">
            <app-icon [key]="node.kind === 'field' ? node.definition.type : 'folder'" size="small" />
            <!-- The name, its error count and its required mark flow as one text, so a count that
                 does not fit beside the name moves under it rather than breaking the name's words. -->
            <span class="node-label"
              ><span class="node-name">{{
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
                <span class="required-mark" [attr.aria-label]="'common.required' | translate">*</span>
              }
            </span>
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
          <!-- A click route for reordering, beside the handle a drag or the arrow keys use. -->
          <button
            type="button"
            class="outline-move outline-move--up"
            [disabled]="locked(node)"
            [attr.aria-disabled]="first || null"
            [attr.aria-label]="'outline.moveUp' | translate: { name: displayName(node) }"
            [title]="'outline.moveUp' | translate: { name: displayName(node) }"
            (click)="moveByClick($event, node, -1)"
          >
            <app-icon key="chevron-up" size="small" />
          </button>
          <button
            type="button"
            class="outline-move"
            [disabled]="locked(node)"
            [attr.aria-disabled]="last || null"
            [attr.aria-label]="'outline.moveDown' | translate: { name: displayName(node) }"
            [title]="'outline.moveDown' | translate: { name: displayName(node) }"
            (click)="moveByClick($event, node, 1)"
          >
            <app-icon key="chevron-down" size="small" />
          </button>
          <button
            type="button"
            class="outline-drag-handle"
            cdkDragHandle
            [disabled]="locked(node)"
            [attr.aria-label]="'outline.reorder' | translate: { name: displayName(node) }"
            [title]="'outline.reorderHint' | translate"
            (keydown)="moveWithKeyboard($event, node)"
          >
            <app-icon key="drag" size="small" />
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
  private readonly i18n = inject(CedLanguageService);
  private readonly injector = inject(Injector);
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
    this.moveBy(node, event.key === 'ArrowUp' ? -1 : 1);
  }
  /**
   * Move up and Move down move the child one place, as the arrow keys on its handle do. At either
   * end the button is only marked disabled, so it keeps focus, and a click on it does nothing.
   */
  moveByClick(event: MouseEvent, node: ChildNode, offset: -1 | 1): void {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement) || button.getAttribute('aria-disabled') === 'true') return;
    const focused = button.matches(':focus');
    if (!this.moveBy(node, offset)) return;
    // Moving the row's view can take the button out of the page for an instant, which drops its focus.
    if (focused)
      afterNextRender(
        () => {
          if (button.isConnected && !button.matches(':focus')) button.focus();
        },
        { injector: this.injector },
      );
  }
  /** Move a child one place and announce where it went. Returns whether it moved. */
  private moveBy(node: ChildNode, offset: -1 | 1): boolean {
    if (this.locked(node)) return false;
    const children = this.container().children;
    const index = children.findIndex((child) => child.id === node.id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= children.length) return false;
    this.service.moveChild(node.id, this.container().id, next);
    // The input catches up on the next render, so the moved order is read from the document.
    const moved = findContainer(this.service.session.document(), this.container().id)?.children ?? [];
    if (moved[next]?.id !== node.id) return false;
    this.service.announce(
      this.i18n.t('announce.moved', { name: this.displayName(node), position: next + 1, count: moved.length }),
    );
    return true;
  }
  select(node: ChildNode): void {
    this.service.openContainer(node.kind === 'element' ? node.id : this.container().id);
    this.service.selectedField.set(node.id);
    this.service.scrollRequest.set(node.id);
  }
}
