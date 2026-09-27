import { IconComponent } from '../../shared/components/icon/icon.component';
import { ElementLabelsComponent } from '../element-labels/element-labels.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { AnnotationsEditorComponent } from '../annotations-editor/annotations-editor.component';
import { ChangeDetectorRef } from '@angular/core';
import { Component, computed, inject, input, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SETTINGS_TABS, settingsTabKey } from '../../shared/settings-tabs';
import { ContainerDraft } from '../../core/model/container-draft';
import { containerArtifactMetadata } from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';
import { publicationStatusLabel } from '../../shared/publication-status';
import { TypesPickerComponent } from '../types-picker/types-picker.component';

@Component({
  selector: 'app-container-settings',
  imports: [
    IconComponent,
    ElementLabelsComponent,
    LanguageSelectorComponent,
    AnnotationsEditorComponent,
    FormsModule,
    TypesPickerComponent,
    TranslatePipe,
  ],
  templateUrl: './container-settings.component.html',
  styleUrls: ['../field-settings/field-settings.component.scss', '../element-card/element-card.component.scss'],
  styles: `
    textarea {
      width: 100%;
      box-sizing: border-box;
      height: var(--cedar-control-height, var(--cedar-control-height-default));
      resize: none;
    }
    .display-fields {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
    }
  `,
})
export class ContainerSettingsComponent {
  private readonly changeDetector = inject(ChangeDetectorRef);
  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.changeDetector.markForCheck();
  }

  readonly container = input.required<ContainerDraft>();
  readonly service = inject(TemplateService);
  readonly tabKey = settingsTabKey;
  readonly artifact = computed(() => containerArtifactMetadata(this.container()));
  readonly status = computed(() => publicationStatusLabel(this.artifact().publicationStatus));
  constructor() {
    effect(() => {
      const issue = this.service.validationTarget();
      if (issue?.setting !== 'name' && issue?.nodeId === this.container().id) {
        this.expanded = true;
        this.activeTab = issue.tab;
        this.changeDetector.markForCheck();
      }
    });
  }
  expanded = false;
  activeTab = 'Display';
  readonly metadataTab = computed<string>(() =>
    this.container().kind === 'template' ? SETTINGS_TABS.templateMetadata : SETTINGS_TABS.elementMetadata,
  );
  readonly tabs = computed(() => ['Display', 'Annotations', this.metadataTab()]);
  tabId(tab: string): string {
    return 'container-settings-' + this.container().id + '-' + tab.replaceAll(' ', '-');
  }
  selected(): string {
    return this.tabs().includes(this.activeTab) ? this.activeTab : this.metadataTab();
  }
  keydown(event: KeyboardEvent, index: number): void {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % this.tabs().length;
    else if (event.key === 'ArrowLeft') next = (index + this.tabs().length - 1) % this.tabs().length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs().length - 1;
    else return;
    event.preventDefault();
    this.activeTab = this.tabs()[next];
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next].focus();
  }
  update(key: 'header' | 'footer', value: string): void {
    const container = this.container();
    const metadata = container.metadata ?? {
      artifact: this.artifact(),
      language: null,
      annotations: undefined,
      instanceType: null,
      header: null,
      footer: null,
    };
    this.service.updateContainerDefinition(container.id, { metadata: { ...metadata, [key]: value || null } });
  }
}
