import { TypesPickerComponent } from '../types-picker/types-picker.component';
import { PropertyPickerComponent } from '../property-picker/property-picker.component';
import { publicationStatusLabel } from '../../shared/publication-status';
import { Component, input, inject, signal, effect, computed, ChangeDetectorRef, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ElementNode, ElementPlacement } from '../../core/model/container-draft';
import { containerArtifactMetadata } from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-element-card',
  imports: [FormsModule, PropertyPickerComponent, TypesPickerComponent],
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
  readonly draft = signal<ElementPlacement>({ allowMultiple: false });
  readonly error = signal<string | null>(null);
  expanded = false;
  activeTab = 'Display';
  readonly tabs = ['Display', 'Element details', 'Occurrences', 'Element metadata'];
  readonly artifact = computed(() => containerArtifactMetadata(this.node().definition));
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
      if (issue?.nodeId === this.node().id) {
        this.expanded = true;
        this.activeTab = issue.tab;
        this.changeDetector.markForCheck();
      }
    });
    effect(() => {
      // Editing an inline descendant must not reset incomplete placement input.
      const signature = JSON.stringify([this.node().id, this.node().placement]);
      if (signature === this.loadedPlacement) return;
      this.loadedPlacement = signature;
      this.draft.set({ ...this.node().placement });
      this.error.set(null);
    });
  }
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  saveProperty(iri: string): void {
    const error = this.service.updateElementPlacement(this.node().id, { ...this.node().placement, propertyIri: iri });
    this.error.set(error);
    this.service.setSettingsError(this.node().id, 'propertyIri', error, 'Element metadata');
  }
  apply(): void {
    const invalid = Array.from(this.host.nativeElement.querySelectorAll('input')).find(
      (input) => input.validity.badInput,
    );
    if (invalid) {
      const message = `${invalid.closest('label')?.textContent?.trim() || 'Value'} must be a valid number.`;
      this.error.set(message);
      this.service.setSettingsError(this.node().id, 'placement', message, this.activeTab);
      return;
    }
    this.error.set(this.service.updateElementPlacement(this.node().id, this.draft()));
    this.service.setSettingsError(this.node().id, 'placement', this.error(), this.activeTab);
  }
}
