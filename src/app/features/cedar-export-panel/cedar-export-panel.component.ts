import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';

import { TemplateService } from '../../core/services/template.service';
import { toCedarJson, toCedarYaml } from '../../core/cedar-shim';

export type ExportFormat = 'json' | 'yaml';

@Component({
  selector: 'app-cedar-export-panel',
  standalone: true,
  templateUrl: './cedar-export-panel.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./cedar-export-panel.component.scss'],
})
export class CedarExportPanelComponent {
  readonly service = inject(TemplateService);

  readonly activeFormat = signal<ExportFormat>('json');
  readonly copied = signal(false);

  /** Reactive CEDAR JSON-LD object — recomputes whenever template state changes */
  readonly cedarJson = computed(() =>
    toCedarJson(
      this.service.templateName(),
      this.service.templateDesc(),
      this.service.fields(),
      this.service.templateIdentifier(),
      this.service.templateVersion(),
    ),
  );

  /** Formatted JSON string */
  readonly cedarJsonString = computed(() => JSON.stringify(this.cedarJson(), null, 2));

  /** YAML string derived from JSON object */
  readonly cedarYamlString = computed(() => toCedarYaml(this.cedarJson()));

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

// ─── Syntax Highlighters ─────────────────────────────────────────────────────

function highlightJson(code: string): string {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            return `<span class="hl-key">${match}</span>`;
          }
          return `<span class="hl-string">${match}</span>`;
        }
        if (/true|false/.test(match)) return `<span class="hl-bool">${match}</span>`;
        if (/null/.test(match)) return `<span class="hl-null">${match}</span>`;
        return `<span class="hl-number">${match}</span>`;
      },
    );
}

function highlightYaml(code: string): string {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map((line) => {
      // Comment
      if (/^\s*#/.test(line)) return `<span class="hl-comment">${line}</span>`;
      // Key: value
      const keyMatch = line.match(/^(\s*)([\w\-@:'"]+)(\s*:)(.*)/);
      if (keyMatch) {
        const [, indent, key, colon, rest] = keyMatch;
        const highlightedRest = highlightYamlValue(rest);
        return `${indent}<span class="hl-key">${key}</span><span class="hl-punct">${colon}</span>${highlightedRest}`;
      }
      // List item
      const listMatch = line.match(/^(\s*-\s*)(.*)/);
      if (listMatch) {
        const [, bullet, rest] = listMatch;
        return `<span class="hl-punct">${bullet}</span>${highlightYamlValue(rest)}`;
      }
      return line;
    })
    .join('\n');
}

function highlightYamlValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'null' || trimmed === '~') return ` <span class="hl-null">${value}</span>`;
  if (trimmed === 'true' || trimmed === 'false') return ` <span class="hl-bool">${value}</span>`;
  if (/^-?\d/.test(trimmed)) return ` <span class="hl-number">${value}</span>`;
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return ` <span class="hl-string">${value}</span>`;
  if (trimmed === '') return value;
  return ` <span class="hl-string">${value}</span>`;
}
