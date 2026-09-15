import { Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContainerDraft } from '../../core/model/container-draft';
import { containerArtifactMetadata } from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';
import { publicationStatusLabel } from '../../shared/publication-status';
import { TypesPickerComponent } from '../types-picker/types-picker.component';

@Component({
  selector: 'app-container-settings',
  imports: [FormsModule, TypesPickerComponent],
  templateUrl: './container-settings.component.html',
  styleUrls: ['../field-settings/field-settings.component.scss', '../element-card/element-card.component.scss'],
  styles: `
    textarea {
      width: 100%;
      box-sizing: border-box;
      height: var(--cedar-control-height, 28px);
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
  readonly container = input.required<ContainerDraft>();
  readonly service = inject(TemplateService);
  readonly artifact = computed(() => containerArtifactMetadata(this.container()));
  readonly status = computed(() => publicationStatusLabel(this.artifact().publicationStatus));
  expanded = false;
  activeTab = 'Display';
  readonly metadataTab = computed(() =>
    this.container().kind === 'template' ? 'Template Metadata' : 'Element metadata',
  );
  readonly tabs = computed(() =>
    this.container().kind === 'template' ? ['Display', this.metadataTab()] : [this.metadataTab()],
  );
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
