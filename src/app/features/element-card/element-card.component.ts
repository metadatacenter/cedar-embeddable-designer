import { IconComponent } from '../../shared/components/icon/icon.component';
import { invalidSettingsInputs } from '../../shared/settings-input';
import { ElementLabelsComponent } from '../element-labels/element-labels.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { AnnotationsEditorComponent } from '../annotations-editor/annotations-editor.component';
import { TypesPickerComponent } from '../types-picker/types-picker.component';
import { PropertyPickerComponent } from '../property-picker/property-picker.component';
import { publicationStatusLabel } from '../../shared/publication-status';
import { Component, input, inject, signal, effect, computed, ChangeDetectorRef, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { SETTINGS_TABS, settingsTabKey } from '../../shared/settings-tabs';
import { ElementNode, ElementPlacement } from '../../core/model/container-draft';
import { elementDisplayDescription, elementDisplayName } from '../../core/model/field-display-name';
import { containerArtifactMetadata } from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-element-card',
  imports: [
    IconComponent,
    ElementLabelsComponent,
    LanguageSelectorComponent,
    AnnotationsEditorComponent,
    FormsModule,
    PropertyPickerComponent,
    TypesPickerComponent,
    TranslatePipe,
  ],
  templateUrl: './element-card.component.html',
  styleUrls: ['../field-settings/field-settings.component.scss', './element-card.component.scss'],
})
export class ElementCardComponent {
  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.changeDetector.markForCheck();
  }

  readonly node = input.required<ElementNode>();
  readonly service = inject(TemplateService);
  private readonly language = inject(CedLanguageService);
  readonly tabKey = settingsTabKey;
  readonly draft = signal<ElementPlacement>({ allowMultiple: false });
  error(): string | null {
    return (
      this.service
        .validationReport()
        .issues.find(
          (issue) =>
            issue.nodeId === this.node().id &&
            issue.tab === this.activeTab &&
            issue.setting !== 'name' &&
            issue.setting !== 'key',
        )?.message ?? null
    );
  }
  readonly keyDraft = signal<string | null>(null);
  readonly keyError = computed(
    () =>
      this.service.validationReport().issues.find((issue) => issue.nodeId === this.node().id && issue.setting === 'key')
        ?.message ?? null,
  );
  expanded = false;
  activeTab: string = SETTINGS_TABS.configuration;
  readonly tabs: string[] = [
    SETTINGS_TABS.configuration,
    SETTINGS_TABS.display,
    SETTINGS_TABS.annotations,
    SETTINGS_TABS.elementMetadata,
  ];
  readonly artifact = computed(() => containerArtifactMetadata(this.node().definition));
  /** Whether the element's own definition is locked: it is published, or inside a published element. */
  readonly definitionLocked = computed(() => this.service.definitionLocked(this.node().id));
  /** Whether its placement in the parent is locked: it is inside a published element. */
  readonly placementLocked = computed(() => this.service.placementLocked(this.node().id));
  readonly shownDescription = computed(() => elementDisplayDescription(this.node()));
  readonly publicationStatus = computed(() => publicationStatusLabel(this.artifact().publicationStatus));
  tabId(tab: string): string {
    return 'element-settings-' + this.node().id + '-' + tab.replaceAll(' ', '-');
  }
  onTabKeydown(event: KeyboardEvent, index: number): void {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + this.tabs.length - 1) % this.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    else return;
    event.preventDefault();
    this.activeTab = this.tabs[next];
    const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    buttons?.[next].focus();
  }
  private loadedPlacement = '';
  private readonly changeDetector = inject(ChangeDetectorRef);
  constructor() {
    effect(() => {
      const issue = this.service.validationTarget();
      if (issue?.setting !== 'name' && issue?.nodeId === this.node().id) {
        this.expanded = true;
        this.activeTab = issue.tab;
        this.changeDetector.markForCheck();
      }
    });
    effect(() => {
      // Editing an inline descendant must not reset incomplete placement input.
      const placement = { ...this.node().placement, ...this.service.validation.changes(this.node().id) };
      const signature = JSON.stringify([this.node().id, placement]);
      if (signature === this.loadedPlacement) return;
      this.loadedPlacement = signature;
      this.draft.set(structuredClone(placement));
      this.keyDraft.set(placement.deploymentName ?? null);
    });
  }
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  saveProperty(iri: string): void {
    this.service.updateElementPlacement(
      this.node().id,
      { propertyIri: iri },
      'propertyIri',
      SETTINGS_TABS.configuration,
    );
  }
  saveKey(value: string): void {
    this.keyDraft.set(value);
    this.service.updateElementPlacement(this.node().id, { deploymentName: value }, 'key', SETTINGS_TABS.configuration);
  }
  readonly displayName = computed(() => elementDisplayName(this.node()));
  rename(value: string): void {
    this.service.updateElementDisplayName(this.node(), value);
  }
  applyPlacement(changed?: string): void {
    const tab = SETTINGS_TABS.configuration;
    const invalid = invalidSettingsInputs(
      this.host.nativeElement,
      this.service.validation.settingsInput(this.node().id, 'placement')?.invalid,
      changed,
    );
    const draft = this.draft();
    if (Object.keys(invalid).length && draft.allowMultiple) {
      this.service.validation.setInputError(
        this.node().id,
        'placement',
        this.language.t('settings.invalidNumber', {
          label: Object.values(invalid)[0] || this.language.t('settings.value'),
        }),
        tab,
        undefined,
        { changes: { ...draft }, invalid },
      );
      return;
    }
    this.service.updateElementPlacement(
      this.node().id,
      { allowMultiple: draft.allowMultiple, minItems: draft.minItems, maxItems: draft.maxItems },
      'placement',
      tab,
    );
  }
}
