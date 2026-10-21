import { NumericPolicy, JsonSourcePolicy } from '../../core/model/cedar-template';
import { DialogHeaderComponent } from '../../shared/components/dialog-header/dialog-header.component';
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
import { fieldDisplayName } from '../../core/model/field-display-name';
import { valueLanguage } from '../../core/model/value-language';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { trapTab } from '../../shared/focus-trap';

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
  imports: [DialogHeaderComponent, TranslatePipe],
  selector: 'app-field-default-value',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './field-default-value.component.html',
  styleUrl: './field-default-value.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldDefaultValueComponent {
  readonly field = input.required<Field>();
  readonly service = inject(TemplateService);
  readonly displayName = fieldDisplayName;
  /** Whether the field's own definition is locked: it is published, or inside a published element. */
  locked(): boolean {
    return !!this.field().publishedDefinition || this.service.definitionLocked(this.field().id);
  }
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
  /** The language the field declares for its values, which a text default is written in. A number has none. */
  readonly valueLanguage = computed(() => (this.field().type === 'number' ? null : valueLanguage(this.field())));
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
  /**
   * The term dialog and the button that opens it. The dialog takes focus when it opens, as the
   * constraint dialog does, and focus goes back to the button when it closes.
   */
  private readonly termDialog = viewChild<ElementRef<HTMLElement>>('termDialog');
  private readonly editTermButton = viewChild<ElementRef<HTMLElement>>('editTermButton');
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
    effect(() => this.termDialog()?.nativeElement.focus());
    effect(() => {
      if (this.locked()) {
        this.pending?.cancel();
        this.pending = null;
        this.pickerOpen.set(false);
      }
    });
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
        readOnlyMode: this.locked() || accepts(field.type, 'controlledTermConstraints'),
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
      const key = JsonSourcePolicy.stringify(artifact);
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
    const detail = (
      event as CustomEvent<{
        value: FieldDefaultValue;
        valid: boolean;
        pendingValidation?: boolean;
        structurallyValid?: boolean;
        semanticChecks?: Array<{ status: string }>;
        problems?: Array<{ category?: string }>;
      }>
    ).detail;
    if (this.allowsControlledTerms() || this.locked()) return;
    if (
      detail?.valid === true ||
      detail?.pendingValidation === true ||
      (detail?.structurallyValid === true &&
        detail.semanticChecks?.length &&
        detail.semanticChecks.every((check) => check.status === 'notChecked' || check.status === 'unavailable') &&
        detail.problems?.every((problem) => problem.category === 'verification'))
    )
      this.save(defaultFromCef(this.field(), detail.value));
    else this.setError(this.i18n.t('defaultValue.invalid'), true, detail?.value);
  };

  editNative(text: string): void {
    if (this.locked()) return;
    this.draft.set(text);
    if (text === '') {
      this.save({ kind: 'none' });
      return;
    }
    if (this.field().type === 'number') {
      try {
        const value = NumericPolicy.value(text);
        this.save({ kind: 'number', value: typeof value === 'number' ? value : text });
      } catch {
        this.setError(this.i18n.t('defaultValue.invalidNumber'), false, text);
      }
    } else {
      this.save({ kind: 'literal', value: text });
    }
  }

  private save(value: FieldDefaultValue): void {
    this.setError(null);
    this.service.updateDefaultValue(this.field().id, value);
  }

  openPicker(): void {
    if (this.locked()) return;
    this.cancelPicker();
    this.pickerOpen.set(true);
  }

  cancelPicker(): void {
    this.pending?.cancel();
    this.pending = null;
    this.pickerOpen.set(false);
    this.setError(null);
  }

  /** Closes the term dialog at the author's request: its close button, the picker's Cancel, or Escape. */
  dismissPicker(): void {
    this.cancelPicker();
    this.editTermButton()?.nativeElement.focus();
  }

  /** Tab must not leave the dialog while it covers the card, and an Escape the picker has not used closes it. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      this.dismissPicker();
      return;
    }
    const dialog = this.termDialog()?.nativeElement;
    if (dialog) trapTab(dialog, event);
  }

  clear(): void {
    if (this.locked()) return;
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
    if (this.locked() || !this.pickerOpen()) return;
    this.setError(null);
    const attempt = this.service.terminologyEdits.selectDefault(field.id, {
      iri: picked.termIri,
      label: picked.termLabel,
    });
    this.pending = attempt;
    const outcome = await attempt.result;
    if (this.destroyRef.destroyed || this.pending !== attempt) return;
    this.pending = null;
    if (outcome === 'applied') {
      this.pickerOpen.set(false);
      this.editTermButton()?.nativeElement.focus();
      this.service.announce(this.i18n.t('announce.defaultTerm', { term: picked.termLabel || picked.termIri }));
    }
  }
}
