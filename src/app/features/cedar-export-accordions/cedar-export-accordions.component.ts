import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TemplateService } from '../../core/services/template.service';
import { toCedarJson, toCedarYaml } from '../../core/cedar-shim';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-cedar-export-accordions',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './cedar-export-accordions.component.html',
  styleUrls: ['./cedar-export-accordions.component.scss']
})
export class CedarExportAccordionsComponent {
  readonly service = inject(TemplateService);

  readonly jsonOpen = signal(false);
  readonly yamlOpen = signal(false);

  readonly jsonCopied = signal(false);
  readonly yamlCopied = signal(false);

  /** Reactive CEDAR JSON-LD object */
  readonly cedarJson = computed(() =>
    toCedarJson(
      this.service.templateName(),
      this.service.templateDesc(),
      this.service.fields(),
      this.service.templateIdentifier(),
      this.service.templateVersion()
    )
  );

  /** Formatted JSON string */
  readonly jsonString = computed(() =>
    JSON.stringify(this.cedarJson(), null, 2)
  );

  /** Formatted YAML string */
  readonly yamlString = computed(() =>
    toCedarYaml(this.cedarJson())
  );

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

// ─── Syntax Highlighters ─────────────────────────────────────────────────────

function highlightJson(code: string): string {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
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
      }
    );
}

function highlightYaml(code: string): string {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) return `<span class="hl-comment">${line}</span>`;
      const keyMatch = line.match(/^(\s*)([\w\-@:'"]+)(\s*:)(.*)/);
      if (keyMatch) {
        const [, indent, key, colon, rest] = keyMatch;
        const highlightedRest = highlightYamlValue(rest);
        return `${indent}<span class="hl-key">${key}</span><span class="hl-punct">${colon}</span>${highlightedRest}`;
      }
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
