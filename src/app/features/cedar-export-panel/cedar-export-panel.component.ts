import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';

import { TemplateService } from '../../core/services/template.service';
import { highlightJson, highlightYaml } from '../../shared/code-highlight';

export type ExportFormat = 'json' | 'yaml';

@Component({
  selector: 'app-cedar-export-panel',
  standalone: true,
  templateUrl: './cedar-export-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./cedar-export-panel.component.scss'],
})
export class CedarExportPanelComponent {
  readonly service = inject(TemplateService);

  readonly activeFormat = signal<ExportFormat>('json');
  readonly copied = signal(false);

  /** Formatted JSON string */
  readonly cedarJsonString = computed(() => JSON.stringify(this.service.templateJson(), null, 2));

  /** YAML string derived from JSON object */
  readonly cedarYamlString = computed(() => this.service.templateYaml());

  /** Currently displayed code */
  readonly activeCode = computed(() =>
    this.activeFormat() === 'json' ? this.cedarJsonString() : this.cedarYamlString(),
  );

  setFormat(format: ExportFormat): void {
    this.activeFormat.set(format);
  }

  async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.activeCode());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = this.activeCode();
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  /** Line count for display */
  readonly lineCount = computed(() => this.activeCode().split('\n').length);

  /** Syntax-highlighted HTML for code display */
  readonly highlightedCode = computed(() => {
    const code = this.activeCode();
    const format = this.activeFormat();
    return format === 'json' ? highlightJson(code) : highlightYaml(code);
  });
}
