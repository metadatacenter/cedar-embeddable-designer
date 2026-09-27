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
import { accepts, defaultValueError, fieldToJson } from '../../core/model/cedar-template';
import { CeeTemplateObject } from '../../core/model/cee-preview';
import { Field, FieldDefaultValue } from '../../core/models/types';
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
  readonly native = computed(() => ['text', 'paragraph', 'number'].includes(this.field().type));
  readonly draft = signal('');
  private defaultKey = '';
  readonly checking = signal(false);
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
  readonly error = signal<string | null>(null);
  readonly editorReportsError = signal(false);
  private readonly mount = viewChild<ElementRef<HTMLDivElement>>('mount');
  private pending: object | null = null;
  private editor: FieldElement | null = null;
  private artifactKey: string | null = null;
  private configKey: string | null = null;

  private reportValidation(): void {
    this.service.setSettingsError(
      this.field().id,
      'defaultValue',
      this.error() ?? (this.checking() ? this.i18n.t('controlledTerms.checkingConstraints') : null),
    );
  }
  private setError(message: string | null, editorReportsError = false): void {
    this.editorReportsError.set(editorReportsError);
    this.error.set(message);
    untracked(() => this.reportValidation());
  }
  private setChecking(checking: boolean): void {
    this.checking.set(checking);
    untracked(() => this.reportValidation());
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
    destroyRef.onDestroy(() => this.editor?.removeEventListener('valueChange', this.acceptValue));

    effect(() => {
      const field = this.field();
      if (!this.native()) return;
      const key = JSON.stringify([field.id, field.defaultValue]);
      if (key !== this.defaultKey) {
        this.defaultKey = key;
        const value = field.defaultValue;
        this.draft.set(value.kind === 'literal' || value.kind === 'number' ? String(value.value) : '');
        this.setError(null);
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
      const artifact = fieldToJson({ ...field, defaultValue: { kind: 'none' }, importedChoiceDefault: undefined });
      const key = JSON.stringify(artifact);
      if (key !== this.artifactKey) {
        this.editor.fieldObject = artifact;
        this.artifactKey = key;
        this.setError(null);
      }
      const value = defaultToCef(field);
      if (JSON.stringify(this.editor.currentValue) !== JSON.stringify(value)) {
        this.editor.value = value;
      }
    });
  }

  private readonly acceptValue = (event: Event): void => {
    const detail = (event as CustomEvent<{ value: FieldDefaultValue; valid: boolean }>).detail;
    if (this.allowsControlledTerms() || this.field().publishedDefinition) return;
    if (detail?.valid === true) this.save(defaultFromCef(this.field(), detail.value));
    else this.setError(this.i18n.t('defaultValue.invalid'), true);
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
        this.setError(this.i18n.t('defaultValue.invalidNumber'));
        return;
      }
      this.save({ kind: 'number', value: Number(text) });
    } else {
      this.save({ kind: 'literal', value: text });
    }
  }

  private save(value: FieldDefaultValue): void {
    const error = defaultValueError(this.field(), value, this.i18n.t);
    this.setError(error);
    if (error === null) this.service.updateDefaultValue(this.field().id, value);
  }

  openPicker(): void {
    if (this.field().publishedDefinition) return;
    this.cancelPicker();
    this.pickerOpen.set(true);
  }

  cancelPicker(): void {
    this.pending = null;
    this.pickerOpen.set(false);
    this.setChecking(false);
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
    const attempt = {};
    this.pending = attempt;
    this.setChecking(true);
    this.setError(null);
    try {
      const allowed = await this.terminology.allowsDefault(
        fieldToJson({ ...field, defaultValue: { kind: 'none' }, importedChoiceDefault: undefined }),
        picked.termIri,
        picked.termLabel,
      );
      // A response for a field the author has since changed cannot set its default.
      if (this.destroyRef.destroyed || this.pending !== attempt || this.field() !== field) return;
      if (!allowed) {
        this.setError(this.i18n.t('defaultValue.termNotPermitted'));
        return;
      }
      this.save({ kind: 'iri', iri: picked.termIri, label: picked.termLabel });
      if (this.error() === null) this.pickerOpen.set(false);
    } catch (error) {
      if (this.destroyRef.destroyed || this.pending !== attempt || this.field() !== field) return;
      this.setError(error instanceof Error ? this.i18n.describe(error) : this.i18n.t('defaultValue.termCheckFailed'));
    } finally {
      if (this.pending === attempt) {
        this.pending = null;
        this.setChecking(false);
      }
    }
  }
}
