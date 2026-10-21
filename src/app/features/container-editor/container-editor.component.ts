import { ArtifactNameDirective } from '../../shared/artifact-name.directive';
import { InsertionActionsComponent } from '../insertion-actions/insertion-actions.component';
import { HeaderToggleDirective } from '../../shared/header-toggle.directive';
import { ContainerSettingsComponent } from '../container-settings/container-settings.component';
import { publicationStatusLabel } from '../../shared/publication-status';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  computed,
  viewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CountKeyPipe } from '../../i18n/count-key.pipe';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService } from '../../core/services/template.service';
import { fieldView, findContainer } from '../../core/model/container-draft';
import { elementDisplayDescription, elementDisplayName } from '../../core/model/field-display-name';
import { publishedContainer } from '../../core/model/child-locks';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { FieldCardComponent } from '../field-card/field-card.component';
import { FieldTypePickerComponent } from '../field-type-picker/field-type-picker.component';
import { ElementCardComponent } from '../element-card/element-card.component';

/** The same editing surface serves the root document and every nested element. */
/** The collapse button's name for a container that has no name yet, by action and kind. */
const UNNAMED_TOGGLE = {
  collapse: {
    template: 'containerEditor.collapseUnnamed.template',
    element: 'containerEditor.collapseUnnamed.element',
  },
  expand: { template: 'containerEditor.expandUnnamed.template', element: 'containerEditor.expandUnnamed.element' },
} as const;

@Component({
  selector: 'app-container-editor',
  host: { '(click)': '$event.stopPropagation()' },
  imports: [
    ArtifactNameDirective,
    InsertionActionsComponent,
    FormsModule,
    HeaderToggleDirective,
    DragDropModule,
    IconComponent,
    FieldCardComponent,
    FieldTypePickerComponent,
    ElementCardComponent,
    ContainerSettingsComponent,
    CountKeyPipe,
    TranslatePipe,
  ],
  templateUrl: './container-editor.component.html',
  styleUrls: ['../../shared/_field-error.scss', '../../app.component.scss', './container-editor.component.scss'],
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
    () => this.container().children.length > 0 && this.service.collapsedElements().has(this.container().id),
  );
  /**
   * The child whose insertion actions, in the gap above it, stay hidden although the pointer or focus
   * that showed them is still there. Using an action hides them, and so does Escape. The dismissal
   * ends when the pointer leaves the gap or focus moves to one of the actions.
   */
  readonly dismissedInsertion = signal<number | null>(null);
  readonly fieldView = fieldView;

  /**
   * Escape hides the insertion actions shown above a child, as WCAG 1.4.13 requires of content that
   * covers its neighbours on hover or focus. While the pointer shows them, focus can be anywhere in
   * the host page, so the key is taken from the window. It reaches the window after every control
   * that uses Escape for its own purpose, such as closing the palette. An Escape one of those
   * controls has used is left alone, and one that hides the actions is marked as used.
   */
  private dismissInsertion(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const shown = this.container().children.find(
      (child) =>
        this.dismissedInsertion() !== child.id &&
        this.host.nativeElement
          .querySelector(`[id="field-card-${child.id}"] > .insert-zone`)
          ?.matches(':hover, :focus-within'),
    );
    if (!shown) return;
    event.preventDefault();
    this.dismissedInsertion.set(shown.id);
  }
  update(
    changes: Partial<
      Pick<import('../../core/model/container-draft').ContainerDraft, 'name' | 'description' | 'version'>
    >,
  ): void {
    this.service.updateContainerDefinition(this.container().id, changes);
  }
  /** A nested element's header shows the name and description its parent shows it by. */
  readonly shownName = computed(() => {
    const node = this.placementNode();
    return node ? elementDisplayName(node) : this.container().name;
  });
  readonly shownDescription = computed(() => {
    const node = this.placementNode();
    return node ? elementDisplayDescription(node) : this.container().description;
  });
  /** Whether this element's own content is locked: it is published, or inside a published element. */
  readonly definitionLocked = computed(() => this.service.definitionLocked(this.container().id));
  /** Whether its placement in its parent is locked: it is inside a published element. */
  readonly placementLocked = computed(() => !this.service.access.canEditHeader(this.container().id));
  /**
   * Whether this element is itself published and its parent can still configure it, which its header
   * says once for everything inside it. A read-only document configures nothing.
   */
  readonly published = computed(
    () => publishedContainer(this.container()) && this.service.validation.canPlace(this.container().id),
  );
  rename(value: string): void {
    const node = this.placementNode();
    if (node) this.service.updateElementDisplayName(node, value);
    else this.update({ name: value });
  }
  describe(value: string): void {
    const node = this.placementNode();
    if (node) this.service.updateElementDisplayDescription(node, value);
    else this.update({ description: value });
  }
  activate(): void {
    this.service.session.activeId.set(this.container().id);
    const node = this.placementNode();
    if (node) this.service.selectedField.set(node.id);
  }
  pickerAt(index: number): boolean {
    return this.service.session.active().id === this.container().id && this.service.showPicker() === index;
  }
  onDrop(event: CdkDragDrop<unknown>) {
    this.service.moveChild(event.item.data as number, this.container().id, event.currentIndex);
  }

  /** The collapse button's name, which falls back to the kind of container while it has no name. */
  readonly toggleLabel = computed(() => {
    const collapsed = this.collapsed();
    const name = this.shownName();
    if (!name.trim())
      return { key: UNNAMED_TOGGLE[collapsed ? 'expand' : 'collapse'][this.container().kind], params: {} };
    return { key: collapsed ? 'common.expandNamed' : 'common.collapseNamed', params: { name } };
  });

  /** Deletes this element, then gives focus to the next card, else the previous one, else Add field. */
  deleteElement(): void {
    const id = this.container().id;
    const next = this.service.focusAfterRemoving(id);
    if (this.service.deleteChild(id) && next) this.service.focusRequest.set(next);
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly bottomZone = viewChild<ElementRef<HTMLElement>>('bottomZone');

  constructor() {
    // This listens on the window directly. A host listener would mark this editor for checking on
    // every key pressed anywhere.
    const view = this.host.nativeElement.ownerDocument.defaultView;
    const dismiss = (event: KeyboardEvent) => this.dismissInsertion(event);
    view?.addEventListener('keydown', dismiss);
    inject(DestroyRef).onDestroy(() => view?.removeEventListener('keydown', dismiss));

    // A focus request for one of this container's own cards, or for its own Add field, is this editor's to perform.
    afterRenderEffect(() => {
      const request = this.service.focusRequest();
      if (!request) return;
      const container = this.container();
      const target =
        request.kind === 'card' && container.children.some((child) => child.id === request.id)
          ? this.host.nativeElement.querySelector<HTMLElement>(
              `[id="field-card-${request.id}"] > .field-drag-container`,
            )
          : request.kind === 'add-field' && request.containerId === container.id
            ? (this.bottomZone()?.nativeElement.querySelector<HTMLElement>('button') ?? null)
            : null;
      if (!target) return;
      target.focus();
      this.service.focusRequest.set(null);
    });
  }
}
