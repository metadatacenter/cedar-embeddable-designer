import { Component, ElementRef, OnDestroy, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CedChildResult } from '../../ced-public-api';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-child-picker',
  imports: [FormsModule, DatePipe, IconComponent],
  templateUrl: './child-picker.component.html',
  styleUrl: './child-picker.component.scss',
})
export class ChildPickerComponent implements OnDestroy {
  readonly service = inject(TemplateService);
  readonly target = input.required<{ targetId: number; position: number }>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly selected = signal<CedChildResult[]>([]);
  readonly results = signal<CedChildResult[]>([]);
  readonly searching = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly searched = signal(false);
  readonly nextCursor = signal<string | undefined>(undefined);
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
  remove(row: CedChildResult): void {
    this.selected.update((items) => items.filter((item) => this.key(item) !== this.key(row)));
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
            .filter((row) => row.id && (row.type === 'field' || row.type === 'element'))
            .map((row) => [this.key(row), row]),
        ).values(),
      ]);
      this.nextCursor.set(page.nextCursor);
      this.searched.set(true);
    } catch (error) {
      if (!request.signal.aborted) {
        this.error.set(error instanceof Error ? error.message : 'Search failed. Please try again.');
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
        throw new Error('The document changed. Reopen the selector in the new document.');
      const { targetId, position } = this.target();
      this.service.importChildren(artifacts, targetId, position);
      this.close();
    } catch (error) {
      if (!request.signal.aborted)
        this.error.set(error instanceof Error ? error.message : 'Unable to load the selection. Please try again.');
    } finally {
      if (!request.signal.aborted) this.saving.set(false);
    }
  }
}
