import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { fieldToJson } from '../../core/model/cedar-template';
import { Field, FIELD_TYPES } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';

/** CEF owns the specification wording and appearance, just as it does in read-only CEE. */
@Component({
  selector: 'app-field-summary',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { '[style.display]': "field().type === 'controlledTerms' && (!available() || !artifact()) ? 'none' : null" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (available() && artifact(); as definition) {
      <cedar-embeddable-field density="authoring" [config]="config()" [fieldObject]="definition" />
    } @else {
      <input class="field-preview" spellcheck="false" type="text" disabled [placeholder]="placeholder()" />
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    cedar-embeddable-field {
      display: block;
      min-width: 0;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      height: var(--cedar-control-height-default);
      border: 1px solid var(--cedar-border-control);
      border-radius: var(--cedar-control-radius-default);
      padding: var(--cedar-space-1) var(--cedar-space-2);
      background: var(--cedar-surface-raised);
      color: var(--cedar-text-muted);
      font-size: var(--cedar-font-size);
      opacity: 1;
    }
  `,
})
export class FieldSummaryComponent {
  readonly field = input.required<Field>();
  private readonly service = inject(TemplateService);
  readonly available = signal(!!customElements.get('cedar-embeddable-field'));
  readonly config = computed(() => ({ ...this.service.fieldEditorConfig(), readOnlyMode: true }));
  readonly placeholder = computed(() =>
    this.field().temporal?.type === 'xsd:dateTime' ? 'Date and time' : FIELD_TYPES[this.field().type]?.preview || '',
  );
  readonly artifact = computed(() => {
    // Attribute-value fields describe a collection rather than one scalar value.
    if (this.field().type === 'attributeValue') return null;
    try {
      // A specification describes constraints, not a populated value or a declared default.
      return fieldToJson({ ...this.field(), defaultValue: { kind: 'none' }, importedChoiceDefault: undefined });
    } catch {
      // Incomplete constraints remain editable; do not feed an invalid draft to CEF.
      return null;
    }
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    void customElements.whenDefined('cedar-embeddable-field').then(() => {
      if (!destroyRef.destroyed) this.available.set(true);
    });
  }
}
