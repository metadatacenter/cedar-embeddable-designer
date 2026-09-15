import { IconComponent } from '../../shared/components/icon/icon.component';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field } from '../../core/models/types';
import { ContainerDraft } from '../../core/model/container-draft';
import { containerArtifactMetadata } from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';

type Annotation = NonNullable<Field['annotations']>[number];

@Component({
  selector: 'app-annotations-editor',
  imports: [FormsModule, IconComponent],
  templateUrl: './annotations-editor.component.html',
  styleUrl: './annotations-editor.component.scss',
})
export class AnnotationsEditorComponent {
  readonly field = input<Field>();
  readonly container = input<ContainerDraft>();
  readonly draft = signal<Annotation>({ name: '', kind: 'literal', value: '' });
  readonly addError = signal<string | null>(null);
  readonly rows = signal<Annotation[]>([]);
  readonly error = signal<string | null>(null);
  readonly disabled = computed(() => !!this.field()?.publishedDefinition);
  private readonly service = inject(TemplateService);
  private loaded = '';
  private loadedOwner: number | undefined;

  constructor() {
    effect(() => {
      const owner = this.field() ?? this.container();
      if (owner?.id !== this.loadedOwner) {
        this.loadedOwner = owner?.id;
        this.draft.set({ name: '', kind: 'literal', value: '' });
        this.addError.set(null);
      }
      const annotations = this.field()?.annotations ?? this.container()?.metadata?.annotations ?? [];
      const signature = JSON.stringify([owner?.id, annotations]);
      if (signature === this.loaded) return;
      this.loaded = signature;
      this.rows.set(annotations.map((row) => ({ ...row })));
      this.error.set(null);
    });
  }

  editDraft(changes: Partial<Annotation>): void {
    if (this.disabled()) return;
    this.draft.update((draft) => ({ ...draft, ...changes }));
    this.addError.set(null);
  }
  add(): void {
    if (this.disabled()) return;
    const rows = [...this.rows(), { ...this.draft() }];
    const error = this.validate(rows);
    this.addError.set(error);
    if (error) return;
    if (this.save(rows)) {
      this.rows.set(rows);
      this.draft.set({ name: '', kind: 'literal', value: '' });
    }
  }
  remove(index: number): void {
    if (this.disabled()) return;
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
    this.save();
  }
  edit(index: number, changes: Partial<Annotation>): void {
    if (this.disabled()) return;
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
    this.save();
  }
  private validate(rows: Annotation[]): string | null {
    const names = new Set<string>();
    let error: string | null = null;
    for (const row of rows) {
      if (!row.name.trim()) {
        error = 'Each annotation needs a name.';
        break;
      }
      if (names.has(row.name)) {
        error = 'Annotation names must be unique.';
        break;
      }
      names.add(row.name);
      if (row.kind === 'iri' && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(row.value)) {
        error = 'Annotation value must be a valid IRI.';
        break;
      }
    }
    return error;
  }
  private save(rows = this.rows()): boolean {
    const owner = this.field() ?? this.container();
    if (!owner) return false;
    let error = this.validate(rows);
    if (!error) {
      const annotations = rows.map((row) => ({ ...row }));
      if (this.field()) {
        error = this.service.updateFieldSettings(owner.id, { annotations });
      } else {
        const container = this.container()!;
        const metadata = container.metadata ?? {
          artifact: containerArtifactMetadata(container),
          language: null,
          instanceType: null,
          header: null,
          footer: null,
        };
        this.service.updateContainerDefinition(owner.id, { metadata: { ...metadata, annotations } });
      }
      if (!error) this.loaded = JSON.stringify([owner.id, annotations]);
    }
    this.error.set(error);
    this.service.setSettingsError(owner.id, 'annotations', error, 'Annotations');
    return !error;
  }
}
