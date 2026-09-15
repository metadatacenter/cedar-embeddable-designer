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
  readonly rows = signal<Annotation[]>([]);
  readonly error = signal<string | null>(null);
  readonly disabled = computed(() => !!this.field()?.publishedDefinition);
  private readonly service = inject(TemplateService);
  private loaded = '';

  constructor() {
    effect(() => {
      const owner = this.field() ?? this.container();
      const annotations = this.field()?.annotations ?? this.container()?.metadata?.annotations ?? [];
      const signature = JSON.stringify([owner?.id, annotations]);
      if (signature === this.loaded) return;
      this.loaded = signature;
      this.rows.set(annotations.map((row) => ({ ...row })));
      this.error.set(null);
    });
  }

  add(): void {
    if (this.disabled()) return;
    this.rows.update((rows) => [...rows, { name: '', kind: 'literal', value: '' }]);
    this.save();
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
  private save(): void {
    const owner = this.field() ?? this.container();
    if (!owner) return;
    const rows = this.rows();
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
        error = 'An annotation IRI must be an absolute identifier.';
        break;
      }
    }
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
  }
}
