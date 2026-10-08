import { invalidSettingsInputs } from '../../shared/settings-input';
import { publicationStatusLabel } from '../../shared/publication-status';
import { fieldDisplayDescription, fieldDisplayName } from '../../core/model/field-display-name';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { AlternateQuestionsComponent } from '../alternate-questions/alternate-questions.component';
import { AnnotationsEditorComponent } from '../annotations-editor/annotations-editor.component';
import { PropertyPickerComponent } from '../property-picker/property-picker.component';
import { FieldDefaultValueComponent } from '../field-default-value/field-default-value.component';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  inject,
  effect,
  afterRenderEffect,
  ChangeDetectorRef,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { SETTINGS_TABS, settingsTabKey } from '../../shared/settings-tabs';
import { Field } from '../../core/models/types';
import {
  accepts,
  allowsDefault,
  allowsMultiple,
  allowsStatus,
  descriptorOf,
  FieldParameter,
  fieldArtifactMetadata,
  NUMERIC_TYPES,
  temporalGranularities,
} from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-field-settings',
  imports: [
    IconComponent,
    LanguageSelectorComponent,
    AlternateQuestionsComponent,
    AnnotationsEditorComponent,
    FormsModule,
    FieldDefaultValueComponent,
    PropertyPickerComponent,
    TranslatePipe,
  ],
  templateUrl: './field-settings.component.html',
  styleUrl: './field-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldSettingsComponent implements OnChanges {
  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.changeDetector.markForCheck();
  }

  @Input({ required: true }) field!: Field;
  @Input() hasValues = false;
  private readonly i18n = inject(CedLanguageService);
  readonly tabKey = settingsTabKey;
  readonly publicationStatusLabel = publicationStatusLabel;
  expanded = false;
  activeTab: string = SETTINGS_TABS.configuration;
  get valuesTab(): string {
    return ['richText', 'image', 'youtube'].includes(this.field.type) ? 'Content' : 'Constraints';
  }
  readonly allowsDefault = allowsDefault;
  get hasConstraints(): boolean {
    return (
      allowsDefault(this.field.type) ||
      this.accepts('temporalPrecision') ||
      this.accepts('textLength') ||
      this.accepts('numericBounds')
    );
  }
  /**
   * Configuration holds the settings of the field's place in its parent, so a field edited as a
   * document of its own, which has no parent, has no such tab.
   */
  get tabs(): string[] {
    return [
      ...(this.service.fieldDocumentMode() ? [] : [SETTINGS_TABS.configuration]),
      SETTINGS_TABS.display,
      ...(this.hasValues || this.hasConstraints ? [this.valuesTab] : []),
      SETTINGS_TABS.annotations,
      SETTINGS_TABS.fieldMetadata,
    ];
  }
  get selectedTab(): string {
    return this.tabs.includes(this.activeTab) ? this.activeTab : this.tabs[0];
  }
  selectTab(tab: string): void {
    this.activeTab = tab;
  }
  onTabKey(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs;
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    this.selectTab(tabs[next]);
    const parent = (event.currentTarget as HTMLElement).parentElement;
    parent?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  readonly service = inject(TemplateService);
  get artifact() {
    return fieldArtifactMetadata(this.field);
  }
  deploymentName = '';
  schemaIdentifier = '';
  hidden = false;
  continuePreviousLine = false;
  /** Whether the field's own definition is locked: it is published, or inside a published element. */
  get definitionLocked(): boolean {
    return this.service.definitionLocked(this.field.id);
  }
  /** Whether its placement in the parent is locked: it is inside a published element. */
  get placementLocked(): boolean {
    return this.service.placementLocked(this.field.id);
  }
  /** The name and description the parent shows the field by, which its header shares. */
  get shownName(): string {
    return fieldDisplayName(this.field);
  }
  get shownDescription(): string {
    return fieldDisplayDescription(this.field);
  }
  /** Whether the bounds are refused, which marks the row that holds them. */
  get boundsInvalid(): boolean {
    return this.service
      .visibleIssues()
      .some((issue) => issue.nodeId === this.field.id && issue.setting === 'occurrences');
  }
  get dynamic(): boolean {
    return descriptorOf(this.field.type).deployment !== 'static';
  }
  /** Whether this field's type takes a parameter, so the panel offers its control. */
  accepts(parameter: FieldParameter): boolean {
    return accepts(this.field.type, parameter);
  }
  text: NonNullable<Field['textConstraints']> = { minLength: null, maxLength: null, regex: null };
  readonly numericTypes = NUMERIC_TYPES;
  numeric: NonNullable<Field['numeric']> = {
    type: 'xsd:decimal',
    min: null,
    max: null,
    decimalPlaces: null,
    unit: null,
  };
  temporal: NonNullable<Field['temporal']> = {
    type: 'xsd:date',
    granularity: 'day',
    timezoneEnabled: false,
    inputTimeFormat: null,
  };
  get granularities() {
    return temporalGranularities(this.temporal.type);
  }
  changeTemporalType(type: NonNullable<Field['temporal']>['type']): void {
    this.temporal.type = type;
    if (!this.granularities.includes(this.temporal.granularity))
      this.temporal.granularity = type === 'xsd:time' ? 'minute' : 'day';
  }
  width: number | null = null;
  height: number | null = null;
  min: number | null = null;
  max: number | null = null;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  constructor() {
    let focused: unknown;
    afterRenderEffect(() => {
      const issue = this.service.validationTarget();
      if (!issue || issue.setting === 'name' || issue === focused || issue.nodeId !== this.field?.id) return;
      focused = issue;
      const panel = this.host.nativeElement.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');
      // A panel holding several settings marks each one's controls, so an issue reaches its own.
      const group = panel?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(issue.setting)}"]`) ?? panel;
      const control =
        issue.setting === 'defaultValue'
          ? panel?.querySelector<HTMLElement>(
              'app-field-default-value input, app-field-default-value textarea, app-field-default-value button',
            )
          : /^option-\d+$/.test(issue.setting)
            ? panel?.querySelector<HTMLElement>(
                `input[aria-label="${CSS.escape(this.i18n.t('fieldCard.option', { number: Number(issue.setting.slice(7)) + 1 }))}"]`,
              )
            : group?.querySelector<HTMLElement>('input, select, textarea, button');
      control?.focus({ preventScroll: true });
    });
    effect(() => {
      const issue = this.service.validationTarget();
      if (issue?.setting !== 'name' && issue?.nodeId === this.field?.id) {
        this.expanded = true;
        this.activeTab = issue.tab;
        this.changeDetector.markForCheck();
      }
    });
  }
  get error(): string | null {
    const message =
      this.service
        .visibleIssues()
        .filter(
          (issue) =>
            issue.nodeId === this.field.id &&
            issue.setting !== 'name' &&
            issue.setting !== 'key' &&
            issue.setting !== 'defaultValue' &&
            issue.tab === this.selectedTab,
        )
        .map((issue) => issue.message)
        .join(' ') || null;
    const prefix = this.i18n.t('errors.namedField', {
      name: this.field.name.trim() || this.i18n.t('common.anUnnamedField'),
      message: '',
    });
    return message?.startsWith(prefix) ? message.slice(prefix.length) : message;
  }
  get multiple(): boolean {
    return descriptorOf(this.field.type).deployment === 'alwaysMultiple' || this.field.allowMultiple;
  }
  /** Whether the type takes a requirement and the profile shows the control. */
  get offersRequirement(): boolean {
    return this.service.preferences().showRequired && allowsStatus(this.field.type);
  }
  /** Whether the author chooses the count and the profile shows the control. */
  get offersAllowMultiple(): boolean {
    return this.service.preferences().showAllowMultiple && allowsMultiple(this.field.type);
  }
  /**
   * Whether the panel offers the bounds. They stay in view, disabled, while Allow multiple is off,
   * except where the profile hides Allow multiple: the bounds then appear only on a field that is
   * already multiple. A checkbox takes none.
   */
  get offersBounds(): boolean {
    return this.field.type !== 'checkboxes' && (this.multiple || this.offersAllowMultiple);
  }
  private loadedFieldId: number | null = null;

  ngOnChanges(): void {
    const first = this.loadedFieldId !== this.field.id;
    if (first) {
      this.expanded = this.service.fieldDocumentMode();
      this.loadedFieldId = this.field.id;
    }
    const editing = this.service.editingField(this.field);
    const groups: Record<string, string> = {
      text: 'textConstraints',
      numeric: 'numeric',
      temporal: 'temporal',
      min: 'occurrences',
      max: 'occurrences',
      width: 'media',
      height: 'media',
    };
    const take = <T>(key: string, current: T, incoming: T, discard = first): T => {
      // An unparseable number has no typed draft. Retain its input buffer until
      // that control changes; typed rejected values belong to the coordinator.
      if (!discard && this.service.validation.inputError(this.field.id, groups[key] ?? key)) return current;
      return structuredClone(incoming);
    };

    this.deploymentName = take(
      'deploymentName',
      this.deploymentName,
      editing.deploymentName ?? this.service.childKey(editing.id),
    );
    this.schemaIdentifier = take('schemaIdentifier', this.schemaIdentifier, editing.schemaIdentifier ?? '');
    this.hidden = take('hidden', this.hidden, editing.hidden ?? false);
    this.continuePreviousLine = take(
      'continuePreviousLine',
      this.continuePreviousLine,
      editing.continuePreviousLine ?? false,
    );
    this.text = take('text', this.text, {
      ...(editing.textConstraints ?? { minLength: null, maxLength: null, regex: null }),
    });
    this.numeric = take('numeric', this.numeric, {
      ...(editing.numeric ?? { type: 'xsd:decimal', min: null, max: null, decimalPlaces: null, unit: null }),
    });
    this.temporal = take('temporal', this.temporal, {
      ...(editing.temporal ?? {
        type: editing.type === 'time' ? 'xsd:time' : 'xsd:date',
        granularity: editing.type === 'time' ? 'minute' : 'day',
        timezoneEnabled: false,
        inputTimeFormat: null,
      }),
    });
    this.width = take('width', this.width, editing.width ?? null);
    this.height = take('height', this.height, editing.height ?? null);
    // Turning Allow multiple off disables the bounds, and a refused bound goes with it.
    // Turned back on, they show the bounds the field kept.
    this.min = take('min', this.min, editing.minItems ?? null, first || !this.multiple);
    this.max = take('max', this.max, editing.maxItems ?? null, first || !this.multiple);
  }

  private badInput(
    form: HTMLElement | undefined,
    setting: string,
    tab: string,
    changes: Partial<Field>,
    changed?: string,
  ): boolean {
    const previous = this.service.validation.settingsInput(this.field.id, setting);
    const invalid = invalidSettingsInputs(form, previous?.invalid, changed);
    if (!Object.keys(invalid).length) return false;
    this.service.validation.setInputError(
      this.field.id,
      setting,
      this.i18n.t('settings.invalidNumber', {
        label: Object.values(invalid)[0] || this.i18n.t('settings.value'),
      }),
      tab,
      undefined,
      { changes, invalid },
    );
    return true;
  }
  saveIdentifier(): void {
    this.service.updateFieldSettings(this.field.id, { schemaIdentifier: this.schemaIdentifier || undefined });
  }
  get keyError(): string | null {
    return (
      this.service.displayedIssues().find((issue) => issue.nodeId === this.field.id && issue.setting === 'key')
        ?.message ?? null
    );
  }
  saveKey(): void {
    this.service.updateFieldSettings(this.field.id, { deploymentName: this.deploymentName });
  }
  saveProperty(iri: string): void {
    this.service.updateFieldSettings(this.field.id, { propertyIri: iri });
  }
  saveMedia(form?: HTMLFormElement, changed?: string): void {
    if (this.badInput(form, 'media', 'Content', { width: this.width, height: this.height }, changed)) return;
    this.service.updateFieldSettings(this.field.id, { width: this.width, height: this.height });
  }
  saveTemporal(): void {
    this.service.updateFieldSettings(this.field.id, {
      temporal: { ...this.temporal },
      type: this.temporal.type === 'xsd:time' ? 'time' : 'date',
    });
  }
  saveNumeric(form?: HTMLFormElement, changed?: string): void {
    if (this.badInput(form, 'numeric', 'Constraints', { numeric: { ...this.numeric } }, changed)) return;
    this.service.updateFieldSettings(this.field.id, { numeric: { ...this.numeric, unit: this.numeric.unit || null } });
  }
  saveText(form?: HTMLFormElement, changed?: string): void {
    if (this.badInput(form, 'textConstraints', 'Constraints', { textConstraints: { ...this.text } }, changed)) return;
    this.service.updateFieldSettings(this.field.id, {
      textConstraints: { ...this.text, regex: this.accepts('textPattern') ? this.text.regex || null : null },
    });
  }
  rename(value: string): void {
    this.service.updateFieldDisplayName(this.field.id, value);
  }
  saveLayout(): void {
    this.service.updateFieldSettings(this.field.id, {
      hidden: this.hidden,
      continuePreviousLine: this.continuePreviousLine,
    });
  }
  saveBounds(form?: HTMLFormElement, changed?: string): void {
    const bounds = { minItems: this.min, maxItems: this.max };
    if (this.badInput(form, 'occurrences', SETTINGS_TABS.configuration, bounds, changed)) return;
    this.service.updateFieldSettings(this.field.id, bounds);
  }
}
