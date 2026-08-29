import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';

import { TemplateService } from '../../core/services/template.service';
import { highlightJson, highlightYaml } from '../../shared/code-highlight';

@Component({
  selector: 'app-cedar-export-accordions',
  standalone: true,
  templateUrl: './cedar-export-accordions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./cedar-export-accordions.component.scss'],
})
export class CedarExportAccordionsComponent {
  readonly service = inject(TemplateService);

  readonly jsonOpen = signal(false);
  readonly yamlOpen = signal(false);

  readonly jsonCopied = signal(false);
  readonly yamlCopied = signal(false);

  /** Formatted JSON string */
  readonly jsonString = computed(() => JSON.stringify(this.service.templateJson(), null, 2));

  /** Formatted YAML string */
  readonly yamlString = computed(() => this.service.templateYaml());

  readonly jsonLineCount = computed(() => this.jsonString().split('\n').length);
  readonly yamlLineCount = computed(() => this.yamlString().split('\n').length);

  readonly highlightedJson = computed(() => highlightJson(this.jsonString()));
  readonly highlightedYaml = computed(() => highlightYaml(this.yamlString()));

  toggleJson(): void {
    this.jsonOpen.set(!this.jsonOpen());
  }

  toggleYaml(): void {
    this.yamlOpen.set(!this.yamlOpen());
  }

  async copyJson(event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    await this.copyText(this.jsonString());
    this.jsonCopied.set(true);
    setTimeout(() => this.jsonCopied.set(false), 2000);
  }

  async copyYaml(event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    await this.copyText(this.yamlString());
    this.yamlCopied.set(true);
    setTimeout(() => this.yamlCopied.set(false), 2000);
  }

  private async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  }
}
