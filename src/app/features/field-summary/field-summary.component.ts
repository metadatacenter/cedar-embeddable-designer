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
import { Field, FIELD_TYPES, FieldDefaultValue } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';

/** CEF owns the specification wording and appearance, just as it does in read-only CEE. */
@Component({
  selector: 'app-field-summary',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [TranslatePipe],
  host: {
    '[style.display]': "field().type === 'controlledTerms' && (!available() || !artifact()) ? 'none' : null",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (available() && artifact(); as definition) {
      <!-- CEF applies its configuration once, so a new language needs a new element. -->
      @for (language of [language()]; track language) {
        <cedar-embeddable-field [config]="config()" [fieldObject]="definition" [value]="emptyValue" />
      }
    } @else {
      <input class="field-preview" spellcheck="false" type="text" disabled [placeholder]="placeholder() | translate" />
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
      height: var(--cedar-control-height, var(--cedar-control-height-default));
      border: 1px solid var(--cedar-control-border, var(--cedar-control-border-default));
      border-radius: var(--cedar-control-radius, var(--cedar-control-radius-default));
      padding: var(--cedar-space-1) var(--cedar-space-2);
      background: var(--cedar-surface-raised);
      color: var(--cedar-text-muted);
      font-size: var(--cedar-control-font-size, var(--cedar-font-size));
      opacity: 1;
    }
  `,
})
export class FieldSummaryComponent {
  readonly field = input.required<Field>();
  readonly emptyValue: FieldDefaultValue = { kind: 'none' };
  private readonly service = inject(TemplateService);
  readonly language = inject(CedLanguageService).language;
  readonly available = signal(!!customElements.get('cedar-embeddable-field'));
  readonly config = computed(() => ({
    ...this.service.fieldEditorConfig(),
    readOnlyMode: true,
    defaultLanguage: this.language(),
    fallbackLanguage: 'en',
  }));
  /** The translation key of the placeholder, or nothing for a type without a description. */
  readonly placeholder = computed(() =>
    this.field().temporal?.type === 'xsd:dateTime'
      ? 'fieldTypes.dateTime.label'
      : FIELD_TYPES[this.field().type]?.previewKey || '',
  );
  readonly artifact = computed(
    () => {
      // Attribute-value fields describe a collection rather than one scalar value.
      if (this.field().type === 'attributeValue') return null;
      try {
        // Keep declared defaults as specification facts, while the instance value stays empty.
        const field = this.field();
        // Only the disposable summary uses a list renderer. The authored field retains its type.
        const type =
          field.type === 'multipleChoice'
            ? 'singleChoiceList'
            : field.type === 'checkboxes'
              ? 'multipleChoiceList'
              : field.type;
        return fieldToJson({ ...field, type });
      } catch {
        // Incomplete constraints remain editable; do not feed an invalid draft to CEF.
        return null;
      }
    },
    { equal: (previous, next) => JSON.stringify(previous) === JSON.stringify(next) },
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    void customElements.whenDefined('cedar-embeddable-field').then(() => {
      if (!destroyRef.destroyed) this.available.set(true);
    });
  }
}
