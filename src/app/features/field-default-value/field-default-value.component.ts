import { IconComponent } from '../../shared/components/icon/icon.component';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  untracked,
} from '@angular/core';
import { defaultFromCef, defaultToCef } from '../../core/model/field-default';
import { accepts, allowsOptions, fieldToJson } from '../../core/model/cedar-template';
import { CeeTemplateObject } from '../../core/model/cee-preview';
import { Field, FieldDefaultValue } from '../../core/models/types';
import { TerminologyEdit } from '../../core/services/terminology-edit-commands';
import { TemplateService } from '../../core/services/template.service';
import { TerminologyService } from '../../core/services/terminology.service';
import { PickedConstraint } from '../../core/model/term-picker';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';

const FIELD_TAG = 'cedar-embeddable-field';

/** The portion of the sibling element's contract used for field defaults. */
interface FieldElement extends HTMLElement {
  config: {
    readOnlyMode: boolean;
    bridgeBaseUrl?: string;
    terminologyBaseUrl?: string;
    defaultLanguage: string;
    fallbackLanguage: string;
  };
  fieldObject: CeeTemplateObject;
  value: FieldDefaultValue;
  readonly currentValue: FieldDefaultValue;
}

@Component({
  imports: [IconComponent, TranslatePipe],
  selector: 'app-field-default-value',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './field-default-value.component.html',
  styleUrl: './field-default-value.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldDefaultValueComponent {
  readonly field = input.required<Field>();
  readonly service = inject(TemplateService);
  private readonly terminology = inject(TerminologyService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(CedLanguageService);
  /** The designer's language, which the term picker and CEF render in. */
  readonly language = this.i18n.language;
  readonly terminologyBaseUrl = this.terminology.baseUrl;
  /**
   * Whether this field's values come from a vocabulary, which decides how its
   * default is authored: through the term picker, checked against the field's
   * constraints, rather than through CEF.
   */
  readonly allowsControlledTerms = computed(() => accepts(this.field().type, 'controlledTermConstraints'));
  // An empty read-only CEF renders the vocabulary specification, not an empty value.
  // Defaults must display only the explicitly selected term, never the allowed terms.
  readonly controlledDefaultLabel = computed(() => {
    const value = this.field().defaultValue;
    return value.kind === 'iri' ? value.label || value.iri : '';
  });
  readonly native = computed(() => ['text', 'paragraph', 'number'].includes(this.field().type));
  readonly draft = signal('');
  private defaultKey = '';
  readonly checking = computed(() => this.service.validation.isChecking(this.field().id, 'defaultValue'));
  readonly pickerSources = computed(() => {
    const sources = (this.field().controlledTermConstraints?.constraints ?? []).flatMap((config) => {
      const source = config.sourceType === 'ontology-branch' ? config.sourceId : (config.ontologyId ?? config.sourceId);
      const acronym = source?.split('/').filter(Boolean).at(-1);
      return acronym
        ? [
            {
              sourceAcronym: acronym,
              sourceSystem: config.sourceSystem,
              ...(config.version ? { version: { id: config.version.id } } : {}),
            },
          ]
        : [];
    });
    return [...new Map(sources.map((source) => [JSON.stringify(source), source])).values()];
  });
  readonly available = signal(customElements.get(FIELD_TAG) !== undefined);
  readonly pickerAvailable = signal(customElements.get('cedar-embeddable-term-picker') !== undefined);
  readonly pickerOpen = signal(false);
  readonly error = computed(() => {
    const id = this.field().id;
    return this.service.settingError(id, 'defaultValue');
  });
  readonly invalidDefaultText = computed(() => {
    const field = this.field();
    // Choice conflicts already have an always-visible repair action on the card.
    if (allowsOptions(field.type)) return null;
    if (
      !this.service.validation
        .modelReport()
        .issues.some((issue) => issue.nodeId === field.id && issue.setting === 'defaultValue')
    )
      return null;
    const value = field.defaultValue;
    return value.kind === 'none'
      ? null
      : value.kind === 'iri'
        ? value.iri
        : value.kind === 'literals'
          ? value.values.join(', ')
          : String(value.value);
  });
  readonly editorReportsError = signal(false);
  private readonly mount = viewChild<ElementRef<HTMLDivElement>>('mount');
  private pending: TerminologyEdit | null = null;
  private editor: FieldElement | null = null;
  private artifactKey: string | null = null;
  private configKey: string | null = null;

  private setError(message: string | null, editorReportsError = false, value?: string | FieldDefaultValue): void {
    this.editorReportsError.set(editorReportsError);
    untracked(() =>
      this.service.validation.setInputError(this.field().id, 'defaultValue', message, 'Constraints', value),
    );
  }

  constructor() {
    const destroyRef = this.destroyRef;
    for (const [tag, ready] of [
      [FIELD_TAG, this.available],
      ['cedar-embeddable-term-picker', this.pickerAvailable],
    ] as const) {
      void customElements.whenDefined(tag).then(() => {
        if (!destroyRef.destroyed) ready.set(true);
      });
    }
    destroyRef.onDestroy(() => {
      this.pending?.cancel();
      this.pending = null;
      this.editor?.removeEventListener('valueChange', this.acceptValue);
    });

    effect(() => {
      const field = this.service.editingField(this.field());
      if (!this.native()) return;
      const input = this.service.validation.inputValue(field.id, 'defaultValue');
      const key = JSON.stringify([field.id, field.defaultValue, input]);
      if (key !== this.defaultKey) {
        this.defaultKey = key;
        const value = field.defaultValue;
        this.draft.set(
          typeof input === 'string'
            ? input
            : value.kind === 'literal' || value.kind === 'number'
              ? String(value.value)
              : '',
        );
      }
    });

    effect(() => {
      const host = this.mount()?.nativeElement;
      const field = this.field();
      const config = {
        ...this.service.fieldEditorConfig(),
        readOnlyMode: !!field.publishedDefinition || accepts(field.type, 'controlledTermConstraints'),
        // CEF applies configuration once, so a change of language builds a new control.
        defaultLanguage: this.language(),
        fallbackLanguage: 'en',
      };
      if (!host) return;
      if (!this.editor || this.configKey !== JSON.stringify(config)) {
        this.editor?.removeEventListener('valueChange', this.acceptValue);
        this.editor = document.createElement(FIELD_TAG) as FieldElement;
        this.editor.config = config;
        this.configKey = JSON.stringify(config);
        this.artifactKey = null;
        this.editor.addEventListener('valueChange', this.acceptValue);
        host.replaceChildren(this.editor);
      }
      if (this.editor.parentNode !== host) host.replaceChildren(this.editor);
      // The default is the value being edited, not a reason to rebuild its control.
      let artifact: CeeTemplateObject;
      try {
        artifact = fieldToJson({ ...field, defaultValue: { kind: 'none' }, importedChoiceDefault: undefined });
      } catch {
        // The report already identifies invalid imported settings. Keep them
        // editable without leaving a control for the previous field on screen.
        host.replaceChildren();
        this.artifactKey = null;
        return;
      }
      const key = JSON.stringify(artifact);
      const rebuilt = key !== this.artifactKey;
      if (rebuilt) {
        this.editor.fieldObject = artifact;
        this.artifactKey = key;
      }
      const input = this.service.validation.inputValue(field.id, 'defaultValue');
      const value = input && typeof input !== 'string' ? input : defaultToCef(this.service.editingField(field));
      if (rebuilt || JSON.stringify(this.editor.currentValue) !== JSON.stringify(value)) {
        this.editor.value = value;
      }
    });
  }

  private readonly acceptValue = (event: Event): void => {
    const detail = (event as CustomEvent<{ value: FieldDefaultValue; valid: boolean }>).detail;
    if (this.allowsControlledTerms() || this.field().publishedDefinition) return;
    if (detail?.valid === true) this.save(defaultFromCef(this.field(), detail.value));
    else this.setError(this.i18n.t('defaultValue.invalid'), true, detail?.value);
  };

  editNative(text: string): void {
    if (this.field().publishedDefinition) return;
    this.draft.set(text);
    if (text === '') {
      this.save({ kind: 'none' });
      return;
    }
    if (this.field().type === 'number') {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim()) || !Number.isFinite(Number(text))) {
        this.setError(this.i18n.t('defaultValue.invalidNumber'), false, text);
        return;
      }
      this.save({ kind: 'number', value: Number(text) });
    } else {
      this.save({ kind: 'literal', value: text });
    }
  }

  private save(value: FieldDefaultValue): void {
    this.setError(null);
    this.service.updateDefaultValue(this.field().id, value);
  }

  openPicker(): void {
    if (this.field().publishedDefinition) return;
    this.cancelPicker();
    this.pickerOpen.set(true);
  }

  cancelPicker(): void {
    this.pending?.cancel();
    this.pending = null;
    this.pickerOpen.set(false);
    this.setError(null);
  }

  clear(): void {
    if (this.field().publishedDefinition) return;
    this.draft.set('');
    this.cancelPicker();
    this.save({ kind: 'none' });
  }

  async selectTerm(event: Event): Promise<void> {
    const picked = (event as CustomEvent<PickedConstraint>).detail;
    if (picked?.type !== 'class') {
      this.setError(this.i18n.t('defaultValue.singleTerm'));
      return;
    }
    if (this.checking()) return;
    const field = this.field();
    if (field.publishedDefinition || !this.pickerOpen()) return;
    this.setError(null);
    const attempt = this.service.terminologyEdits.selectDefault(field.id, {
      iri: picked.termIri,
      label: picked.termLabel,
    });
    this.pending = attempt;
    const outcome = await attempt.result;
    if (this.destroyRef.destroyed || this.pending !== attempt) return;
    this.pending = null;
    if (outcome === 'applied') this.pickerOpen.set(false);
  }
}
