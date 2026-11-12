import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  computed,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CedChildResult } from '../../ced-public-api';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { LocalizedError, message } from '../../i18n/messages';

@Component({
  selector: 'app-child-picker',
  imports: [DragDropModule, FormsModule, DatePipe, IconComponent, TranslatePipe],
  templateUrl: './child-picker.component.html',
  styleUrl: './child-picker.component.scss',
})
export class ChildPickerComponent implements OnDestroy {
  readonly service = inject(TemplateService);
  private readonly language = inject(CedLanguageService);
  private readonly injector = inject(Injector);
  private readonly changeDetector = inject(ChangeDetectorRef);
  /** The locale the picker formats dates in. */
  readonly locale = this.language.locale;
  readonly target = input.required<{ targetId: number; position: number; type?: 'field' | 'element' }>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly selected = signal<CedChildResult[]>([]);
  readonly results = signal<CedChildResult[]>([]);
  /** The result row focus last rested on, whose row keeps the grid's one Tab stop. */
  readonly focusedResult = signal<string | null>(null);
  /** The grid's one Tab stop: the row focus last rested on while it is still a result, else the first. */
  readonly resultTabStop = computed(() => {
    const keys = this.results().map((row) => this.key(row));
    const focused = this.focusedResult();
    return focused !== null && keys.includes(focused) ? focused : (keys[0] ?? null);
  });
  readonly searching = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly searched = signal(false);
  readonly nextCursor = signal<string | undefined>(undefined);
  /**
   * The prefix of the keys whose text names what the picker offers.
   *
   * One family of keys per kind rather than one noun interpolated into each sentence,
   * because a language that inflects the noun cannot reuse one form in every position.
   */
  get kindKey(): string {
    return this.target().type === 'field'
      ? 'childPicker.fields.'
      : this.target().type === 'element'
        ? 'childPicker.elements.'
        : 'childPicker.children.';
  }
  query = '';
  private lastQuery = '';
  private request?: AbortController;
  private loading?: AbortController;
  private readonly rootId = this.service.session.document().id;
  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
  ngOnDestroy(): void {
    this.request?.abort();
    this.loading?.abort();
    clearTimeout(this.announcementTimer);
  }
  statusLabel(status: string | null | undefined): string {
    const value = status?.trim().toLowerCase().split(/[:/#]/).pop();
    return value === 'draft' || value === 'published'
      ? this.language.t('common.status.' + value).toLocaleLowerCase()
      : '—';
  }
  key(row: CedChildResult): string {
    return `${row.type}:${row.id}`;
  }
  isSelected(row: CedChildResult): boolean {
    return this.selected().some((item) => this.key(item) === this.key(row));
  }
  select(row: CedChildResult): void {
    if (!this.saving() && !this.isSelected(row)) this.selected.update((items) => [...items, row]);
  }
  /**
   * Up, Down, Home and End move focus between result rows and stop at the ends. Enter and Space choose
   * the focused row, as a click does; a row already chosen, or a picker that is adding, ignores them.
   */
  onResultKeydown(event: KeyboardEvent, row: CedChildResult, index: number): void {
    const element = event.currentTarget;
    if (!(element instanceof HTMLElement) || event.target !== element) return;
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(row);
      return;
    }
    const last = this.results().length - 1;
    const target =
      event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'ArrowDown'
          ? index + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    // Past either end there is no row, so focus stays where it is.
    element.parentElement?.querySelectorAll<HTMLElement>(':scope > tr.result-row')[target]?.focus();
    // The Tab stop follows focus at once, so a Tab pressed before the next render leaves from here.
    this.changeDetector.detectChanges();
  }
  remove(row: CedChildResult): void {
    if (this.saving()) return;
    this.selected.update((items) => items.filter((item) => this.key(item) !== this.key(row)));
  }
  reorder(event: CdkDragDrop<CedChildResult[]>): void {
    this.move(event.previousIndex, event.currentIndex);
  }
  move(from: number, to: number): void {
    if (this.saving() || to < 0 || to >= this.selected().length) return;
    this.selected.update((items) => {
      const next = [...items];
      moveItemInArray(next, from, to);
      return next;
    });
  }
  /**
   * What the picker last said about a move. While this modal dialog is open the designer's own live
   * region is inert, so the picker speaks through the status region inside it.
   */
  readonly moveAnnouncement = signal('');
  private announcementTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Move up and Move down move a chosen row one place and say where it went. At either end the button
   * is only marked disabled, so it keeps focus, and a click on it does nothing.
   */
  moveByClick(event: MouseEvent, index: number, offset: -1 | 1): void {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement) || button.getAttribute('aria-disabled') === 'true') return;
    const row = this.selected()[index];
    const to = index + offset;
    if (!row || this.saving() || to < 0 || to >= this.selected().length) return;
    const focused = button.matches(':focus');
    this.move(index, to);
    // The text is cleared first and set a moment later, so a message that repeats the last one is read again.
    clearTimeout(this.announcementTimer);
    this.moveAnnouncement.set('');
    const text = this.language.t('announce.moved', { name: row.name, position: to + 1, count: this.selected().length });
    this.announcementTimer = setTimeout(() => this.moveAnnouncement.set(text), 100);
    // Moving the row's view can take the button out of the page for an instant, which drops its focus.
    if (focused)
      afterNextRender(
        () => {
          if (button.isConnected && !button.matches(':focus')) button.focus();
        },
        { injector: this.injector },
      );
  }
  moveWithKeyboard(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    this.move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
  }
  close(): void {
    this.dialog().nativeElement.close();
    this.service.childPicker.set(null);
  }
  async search(more = false): Promise<void> {
    const source = this.service.childSource();
    if (!source) return;
    this.request?.abort();
    const request = (this.request = new AbortController());
    this.searching.set(true);
    this.error.set('');
    if (!more) {
      this.lastQuery = this.query.trim();
      this.results.set([]);
      this.nextCursor.set(undefined);
    }
    try {
      const page = await source.search(this.lastQuery, {
        signal: request.signal,
        cursor: more ? this.nextCursor() : undefined,
      });
      if (request.signal.aborted) return;
      const rows = more ? [...this.results(), ...page.results] : page.results;
      this.results.set([
        ...new Map(
          rows
            .filter(
              (row) =>
                row.id &&
                (row.type === 'field' || row.type === 'element') &&
                (!this.target().type || row.type === this.target().type),
            )
            .map((row) => [this.key(row), row]),
        ).values(),
      ]);
      this.nextCursor.set(page.nextCursor);
      this.searched.set(true);
    } catch (error) {
      if (!request.signal.aborted) {
        this.error.set(
          error instanceof Error ? this.language.describe(error) : this.language.t('childPicker.searchFailed'),
        );
      }
    } finally {
      if (!request.signal.aborted) this.searching.set(false);
    }
  }
  async done(): Promise<void> {
    const source = this.service.childSource();
    if (!source || !this.selected().length || this.saving()) return;
    const request = (this.loading = new AbortController());
    this.saving.set(true);
    this.error.set('');
    try {
      const artifacts = await Promise.all(
        this.selected().map(async (row) => ({
          type: row.type,
          artifact: await source.load(row, { signal: request.signal }),
        })),
      );
      if (request.signal.aborted) return;
      if (source !== this.service.childSource() || this.service.childPicker() !== this.target()) return;
      if (this.rootId !== this.service.session.document().id)
        throw new LocalizedError(message('childPicker.documentChanged'));
      const { targetId, position } = this.target();
      const [first] = this.service.importChildren(artifacts, targetId, position);
      // Closing returns focus to the button that opened the picker; the first new card then takes it,
      // as a field added from the palette does.
      this.close();
      if (first !== undefined) this.service.focusRequest.set({ kind: 'card', id: first });
    } catch (error) {
      if (!request.signal.aborted)
        this.error.set(
          error instanceof Error ? this.language.describe(error) : this.language.t('childPicker.loadFailed'),
        );
    } finally {
      if (!request.signal.aborted) this.saving.set(false);
    }
  }
}
