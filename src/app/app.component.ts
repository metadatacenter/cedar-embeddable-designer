import { ValidationSummaryComponent } from './shared/validation-summary.component';
import { ChildPickerComponent } from './features/child-picker/child-picker.component';
import {
  Component,
  DestroyRef,
  afterNextRender,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TemplateService } from './core/services/template.service';
import { CED_VERSION } from './version';

// Custom components
import { IconComponent } from './shared/components/icon/icon.component';
import { FieldLibrarySidebarComponent } from './features/field-library-sidebar/field-library-sidebar.component';
import { PreferencesModalComponent } from './features/modals/preferences/preferences.component';
import { PresetDefinitionsModalComponent } from './features/modals/preset-definitions/preset-definitions.component';
import { CeePreviewComponent } from './features/cee-preview/cee-preview.component';
import { FieldDesignerComponent } from './features/field-designer/field-designer.component';
import { ContainerEditorComponent } from './features/container-editor/container-editor.component';
import { ContainerOutlineComponent } from './features/container-outline/container-outline.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    ValidationSummaryComponent,
    ChildPickerComponent,
    IconComponent,
    FieldLibrarySidebarComponent,
    PreferencesModalComponent,
    PresetDefinitionsModalComponent,
    CeePreviewComponent,
    FieldDesignerComponent,
    ContainerEditorComponent,
    ContainerOutlineComponent,
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  /** Shown in the header, from package.json rather than a literal beside it. */
  readonly version = CED_VERSION;
  readonly service = inject(TemplateService);
  private readonly host = inject(ElementRef<HTMLElement>);

  // Layout & UI states
  readonly showFieldsOverview = signal(true);
  readonly showProfileMenu = signal(false);
  readonly overviewMinWidth = 224;
  private readonly overviewRequestedWidth = signal<number | null>(null);
  private readonly availableWidth = signal(1280);
  readonly overviewMaxWidth = computed(() => {
    const library =
      this.service.preferences().fieldSelectionStyle === 'sidebar' ? (this.service.sidebarCollapsed() ? 48 : 288) : 0;
    return Math.max(this.overviewMinWidth, Math.min(480, Math.floor((this.availableWidth() - library) * 0.4)));
  });
  readonly overviewWidth = computed(() =>
    Math.min(
      this.overviewMaxWidth(),
      Math.max(this.overviewMinWidth, this.overviewRequestedWidth() ?? (this.service.showPreview() ? 224 : 256)),
    ),
  );
  private overviewDrag: { x: number; width: number } | null = null;

  startOverviewResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    this.overviewDrag = { x: event.clientX, width: this.overviewWidth() };
  }

  resizeOverview(event: PointerEvent): void {
    if (!this.overviewDrag) return;
    this.setOverviewWidth(this.overviewDrag.width + event.clientX - this.overviewDrag.x);
  }

  endOverviewResize(): void {
    this.overviewDrag = null;
  }

  resizeOverviewWithKeyboard(event: KeyboardEvent): void {
    const step = event.shiftKey ? 32 : 16;
    const widths: Record<string, number> = {
      ArrowLeft: this.overviewWidth() - step,
      ArrowRight: this.overviewWidth() + step,
      Home: this.overviewMinWidth,
      End: this.overviewMaxWidth(),
    };
    if (!(event.key in widths)) return;
    event.preventDefault();
    this.setOverviewWidth(widths[event.key]);
  }

  resetOverviewWidth(): void {
    this.overviewRequestedWidth.set(null);
  }

  private setOverviewWidth(width: number): void {
    this.overviewRequestedWidth.set(Math.max(this.overviewMinWidth, Math.min(this.overviewMaxWidth(), width)));
  }

  /**
   * The profiles, and what each one is for.
   *
   * Named here rather than in the picker's markup so the three names, their
   * order and their one-line descriptions are one list. The service decides what
   * each profile *does*; this decides how it is described. The label and summary are
   * translation keys, rendered in the template.
   */
  readonly profiles = [
    { key: 'basic' as const, label: 'app.profile.basic.label', summary: 'app.profile.basic.summary' },
    { key: 'semantic' as const, label: 'app.profile.semantic.label', summary: 'app.profile.semantic.summary' },
    { key: 'modular' as const, label: 'app.profile.modular.label', summary: 'app.profile.modular.summary' },
  ];

  /**
   * The profile on screen, or nothing once its settings have been edited by hand.
   *
   * The translation key of a label rather than a profile key, and `Custom` where no
   * profile matches, which is a real state an author reaches by changing one switch,
   * and one they could not see at all while the only way to a profile was two clicks
   * inside a modal.
   */
  readonly activeProfileLabel = computed(() => {
    const active = this.service.getActivePreset();
    return this.profiles.find((profile) => profile.key === active)?.label ?? 'app.profile.custom';
  });

  private scrollAnchor: number | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => this.availableWidth.set(entry.contentRect.width));
      observer.observe(this.host.nativeElement);
      const workspace = this.host.nativeElement.querySelector('.designer-workspace');
      const scroller = this.host.nativeElement.querySelector('.designer-scroll');
      let width = workspace?.getBoundingClientRect().width;
      const layoutObserver = new ResizeObserver(([entry]) => {
        if (entry.contentRect.width === width) return;
        width = entry.contentRect.width;
        if (this.scrollAnchor !== null) this.scrollToCard(this.scrollAnchor, 'instant');
      });
      if (workspace) layoutObserver.observe(workspace);
      // Stop preserving the insertion position once the author scrolls elsewhere.
      const releaseAnchor = () => {
        this.scrollAnchor = null;
      };
      scroller?.addEventListener('wheel', releaseAnchor, { passive: true });
      scroller?.addEventListener('touchstart', releaseAnchor, { passive: true });
      const releaseScrollbarAnchor = (event: Event) => {
        if (event.target === scroller) releaseAnchor();
      };
      scroller?.addEventListener('pointerdown', releaseScrollbarAnchor);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        layoutObserver.disconnect();
        scroller?.removeEventListener('wheel', releaseAnchor);
        scroller?.removeEventListener('touchstart', releaseAnchor);
        scroller?.removeEventListener('pointerdown', releaseScrollbarAnchor);
      });
    });
    // A newly added field asks to be scrolled to; the component owns the DOM, so
    // it is the component that finds the card. `afterNextRender` is not enough on
    // its own here — the request outlives the render that satisfies it — so the
    // request is cleared once served.
    effect(() => {
      const fieldId = this.service.scrollRequest();
      if (fieldId === null) {
        return;
      }
      this.service.scrollRequest.set(null);
      requestAnimationFrame(() => this.scrollToCard(fieldId));
    });
  }

  /**
   * The card for a field, looked up in this component's own root.
   *
   * `getRootNode()` rather than `document`, because the designer renders inside the
   * element's shadow root when it is embedded, and a document-wide lookup finds
   * nothing there.
   */
  private scrollToCard(fieldId: number, behavior: ScrollBehavior = 'smooth'): void {
    const root = this.host.nativeElement.getRootNode() as Document | ShadowRoot;
    const card = root.querySelector(`#field-card-${fieldId}`);
    const elementHeader = card?.querySelector(
      ':scope > .field-drag-container > app-container-editor > .template-header-card',
    );
    if (elementHeader) {
      this.scrollAnchor = fieldId;
      const scroller = elementHeader.closest<HTMLElement>('.designer-scroll');
      if (scroller) {
        const gap = parseFloat(getComputedStyle(scroller).getPropertyValue('--cedar-space-6')) || 24;
        scroller.scrollTo({
          top:
            scroller.scrollTop + elementHeader.getBoundingClientRect().top - scroller.getBoundingClientRect().top - gap,
          behavior,
        });
      }
    } else {
      this.scrollAnchor = null;
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  getDesignerClasses(): Record<string, boolean> {
    const preview = this.service.showPreview();
    const selectionStyle = this.service.preferences().fieldSelectionStyle;
    const collapsed = this.service.sidebarCollapsed();
    return {
      'transition-all': true,
      'duration-300': true,
      'overflow-y-auto': true,
      relative: true,
      'flex-1': !preview,
      'w-full': !preview,
      'designer-scroll--split': preview,
      'pl-72': selectionStyle === 'sidebar' && !collapsed,
      'pl-12': selectionStyle === 'sidebar' && collapsed,
    };
  }

  getGridTemplateColumns(): string {
    const fieldsCount = this.service.session.document().children.length;
    const overview = this.showFieldsOverview();
    if (fieldsCount > 0 && overview) {
      return `${this.overviewWidth()}px minmax(0, 1fr)`;
    }
    return 'minmax(0, 1fr)';
  }

  /** Arrow navigation belongs to cards, never to controls editing their contents. */
  @HostListener('keydown', ['$event'])
  navigateCards(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const origin = event.composedPath()[0];
    if (!(origin instanceof HTMLElement) || !origin.matches('.field-drag-container')) return;
    const host = this.host.nativeElement as HTMLElement;
    const cards = Array.from(host.querySelectorAll<HTMLElement>('.field-drag-container')).filter(
      (card) => card.getClientRects().length > 0 && !card.closest('dialog'),
    );
    const index = cards.indexOf(origin);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = cards[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return; // Stop at the boundary rather than wrapping to the other end.
    next.focus({ preventScroll: true });
    const header = next.querySelector('.field-header, .template-header-card') ?? next;
    header.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  @HostListener('document:mousedown', ['$event'])
  handleClickOutside(event: MouseEvent) {
    /*
     * `composedPath()` rather than `event.target`. A mousedown inside the shadow
     * root is retargeted at the host element by the time it reaches the document,
     * so every `closest()` below would miss and each of these menus would close on
     * its own opening click. The composed path is the route the event actually
     * took, shadow tree included.
     */
    const path = event.composedPath();
    const within = (selector: string) => path.some((node) => node instanceof Element && node.matches(selector));

    if (this.service.showUserMenu() && !within('.user-menu-container')) {
      this.service.showUserMenu.set(false);
    }

    if (this.showProfileMenu() && !within('.profile-menu-container')) {
      this.showProfileMenu.set(false);
    }
  }
}
