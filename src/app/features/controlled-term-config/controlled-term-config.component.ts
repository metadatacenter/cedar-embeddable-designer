import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  Input,
  effect,
  inject,
  signal,
  viewChild,
  ChangeDetectionStrategy,
  OnChanges,
  computed,
  DestroyRef,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { TerminologyEdit } from '../../core/services/terminology-edit-commands';
import { TemplateService } from '../../core/services/template.service';
import { Field, ControlledTermSet } from '../../core/models/types';
import { TerminologyService } from '../../core/services/terminology.service';
import { termPickerAvailable } from '../../core/model/term-picker';
import { fieldToJson } from '../../core/model/cedar-template';
import { fieldDisplayName } from '../../core/model/field-display-name';
import { trapTab } from '../../shared/focus-trap';

@Component({
  selector: 'app-controlled-term-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './controlled-term-config.component.html',
  styleUrl: './controlled-term-config.component.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [TranslatePipe],
})
export class ControlledTermConfigComponent implements OnChanges {
  readonly displayName = fieldDisplayName;
  readonly service = inject(TemplateService);
  private readonly terminology = inject(TerminologyService);
  private readonly i18n = inject(CedLanguageService);
  /** The designer's language, which the term picker and the summary render in. */
  readonly language = this.i18n.language;
  readonly terminologyBaseUrl = this.terminology.baseUrl;
  readonly pickerAvailable = termPickerAvailable();
  readonly pickerOpen = signal(false);
  readonly checking = computed(() => this.service.validation.isChecking(this.field?.id, 'controlledTerms'));
  readonly error = computed(() => {
    const id = this.field?.id;
    return this.service.settingError(id, 'controlledTerms');
  });
  readonly invalidDefault = signal(false);
  private pending: TerminologyEdit | null = null;
  @Input() field!: Field;
  pickerConstraints: ControlledTermSet = { constraints: [], actions: [] };

  private orderedConstraints(set: ControlledTermSet): ControlledTermSet {
    // Match the CEF summary's grouping; retain order within each kind.
    const order = ['ontology-branch', 'ontology', 'value-set', 'ontology-term'];
    return {
      ...set,
      constraints: [...set.constraints].sort((a, b) => order.indexOf(a.sourceType) - order.indexOf(b.sourceType)),
    };
  }

  /**
   * The dialog, and the button that opened it.
   *
   * The dialog carries `tabindex="-1"` so it can be focused without joining the tab
   * order, which gives the keyboard a place to start inside the overlay. Focus goes
   * back to the button on close, because leaving it on a dialog that no longer exists
   * drops the author at the top of the document.
   */
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly editButton = viewChild<ElementRef<HTMLElement>>('editButton');

  private setError(message: string | null): void {
    this.service.setSettingsError(this.field.id, 'controlledTerms', message);
  }

  constructor() {
    // Runs when the dialog appears, which is after the click that opened it: the
    // view child resolves only once the overlay has rendered.
    effect(() => this.dialog()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.pending?.cancel());
  }

  /** Tab must not leave the overlay while it is covering the card behind it. */
  onDialogKeydown(event: KeyboardEvent): void {
    const dialog = this.dialog()?.nativeElement;
    if (dialog) trapTab(dialog, event);
  }

  readonly summaryAvailable = customElements.get('cedar-embeddable-field') !== undefined;
  private readonly editorConfig = this.service.fieldEditorConfig();
  readonly summaryConfig = computed(() => ({
    ...this.editorConfig,
    readOnlyMode: true,
    previewMode: true,
    defaultLanguage: this.language(),
    fallbackLanguage: 'en',
  }));
  readonly summaryValue = { kind: 'none' };
  summaryArtifact: ReturnType<typeof fieldToJson> | null = null;

  ngOnChanges(): void {
    this.pickerConstraints = this.orderedConstraints(
      this.field.controlledTermConstraints ?? { constraints: [], actions: [] },
    );
    try {
      this.summaryArtifact = fieldToJson({ ...this.field, defaultValue: { kind: 'none' } });
    } catch {
      this.summaryArtifact = null;
    }
  }

  openPicker(): void {
    this.draftChanged();
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.draftChanged();
    this.pickerOpen.set(false);
    this.editButton()?.nativeElement.focus();
  }

  draftChanged(): void {
    this.pending?.cancel();
    this.pending = null;
    this.invalidDefault.set(false);
    this.setError(null);
  }

  async applyPicked(event: Event): Promise<void> {
    if (this.checking()) return;
    const set = this.orderedConstraints(structuredClone((event as CustomEvent<ControlledTermSet>).detail));
    this.invalidDefault.set(false);
    const attempt = this.service.terminologyEdits.changeConstraints(this.field.id, set);
    this.pending = attempt;
    const outcome = await attempt.result;
    if (this.pending !== attempt) return;
    if (outcome === 'needs-clear') this.invalidDefault.set(true);
    if (outcome === 'applied') this.closePicker();
  }

  clearDefaultAndApply(): void {
    if (this.pending?.clearDefaultAndApply()) this.closePicker();
  }
}
