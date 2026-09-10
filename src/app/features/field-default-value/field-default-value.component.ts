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
} from '@angular/core';
import { defaultFromCef, defaultToCef } from '../../core/model/field-default';
import { accepts, defaultValueError, fieldToJson } from '../../core/model/cedar-template';
import { CeeTemplateObject } from '../../core/model/cee-preview';
import { Field, FieldDefaultValue } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';
import { TerminologyService } from '../../core/services/terminology.service';
import { PickedConstraint } from '../../core/model/term-picker';

const FIELD_TAG = 'cedar-embeddable-field';

/** The portion of the sibling element's contract used for field defaults. */
interface FieldElement extends HTMLElement {
  config: { readOnlyMode: boolean; bridgeBaseUrl?: string; terminologyBaseUrl?: string };
  fieldObject: CeeTemplateObject;
  value: FieldDefaultValue;
  readonly currentValue: FieldDefaultValue;
}

@Component({
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
  readonly terminologyBaseUrl = this.terminology.baseUrl;
  /**
   * Whether this field's values come from a vocabulary, which decides how its
   * default is authored: through the term picker, checked against the field's
   * constraints, rather than through CEF.
   */
  readonly allowsControlledTerms = computed(() => accepts(this.field().type, 'controlledTermConstraints'));
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
  readonly pickerAvailable = signal(customElements.get('cedar-term-picker') !== undefined);
  readonly pickerOpen = signal(false);
  readonly error = signal<string | null>(null);
  private readonly mount = viewChild<ElementRef<HTMLDivElement>>('mount');
  private pending: object | null = null;
  private editor: FieldElement | null = null;
  private artifactKey: string | null = null;
  private configKey: string | null = null;

  constructor() {
    const destroyRef = this.destroyRef;
    for (const [tag, ready] of [
      [FIELD_TAG, this.available],
      ['cedar-term-picker', this.pickerAvailable],
    ] as const) {
      void customElements.whenDefined(tag).then(() => {
        if (!destroyRef.destroyed) ready.set(true);
      });
    }
    destroyRef.onDestroy(() => this.editor?.removeEventListener('valueChange', this.acceptValue));

    effect(() => {
      const host = this.mount()?.nativeElement;
      const field = this.field();
      const config = {
        ...this.service.fieldEditorConfig(),
        readOnlyMode: !!field.publishedDefinition || accepts(field.type, 'controlledTermConstraints'),
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
        this.error.set(null);
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
  };

  private save(value: FieldDefaultValue): void {
    const error = defaultValueError(this.field(), value);
    this.error.set(error);
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
    this.checking.set(false);
    this.error.set(null);
  }

  clear(): void {
    this.cancelPicker();
    this.save({ kind: 'none' });
  }

  async selectTerm(event: Event): Promise<void> {
    const picked = (event as CustomEvent<PickedConstraint>).detail;
    if (picked?.type !== 'class') {
      this.error.set('Choose a single term for the default value.');
      return;
    }
    if (this.checking()) return;
    const field = this.field();
    if (field.publishedDefinition || !this.pickerOpen()) return;
    const attempt = {};
    this.pending = attempt;
    this.checking.set(true);
    this.error.set(null);
    try {
      const allowed = await this.terminology.allowsDefault(
        fieldToJson({ ...field, defaultValue: { kind: 'none' }, importedChoiceDefault: undefined }),
        picked.termIri,
        picked.termLabel,
      );
      // A response for a field the author has since changed cannot set its default.
      if (this.destroyRef.destroyed || this.pending !== attempt || this.field() !== field) return;
      if (!allowed) {
        this.error.set('This term is not permitted by the field constraints.');
        return;
      }
      this.save({ kind: 'iri', iri: picked.termIri, label: picked.termLabel });
      if (this.error() === null) this.pickerOpen.set(false);
    } catch (error) {
      if (this.destroyRef.destroyed || this.pending !== attempt || this.field() !== field) return;
      this.error.set(
        error instanceof Error ? error.message : 'Could not check the term against the field constraints.',
      );
    } finally {
      if (this.pending === attempt) {
        this.pending = null;
        this.checking.set(false);
      }
    }
  }
}
