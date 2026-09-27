import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field } from '../../core/models/types';
import { ContainerDraft } from '../../core/model/container-draft';
import { containerArtifactMetadata } from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';
import { LANGUAGES } from './languages';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';

/**
 * The language list in the designer's own language.
 *
 * English keeps the Library of Congress names the list is written with. Another
 * language takes each name from the browser's CLDR data, which already names every ISO
 * 639-1 language in every locale the designer supports, and sorts by it; a code the
 * browser cannot name keeps its English name.
 */
function languageOptions(locale: string, english: boolean): readonly { code: string; name: string }[] {
  if (english) return LANGUAGES;
  const names = new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' });
  return LANGUAGES.map((language) => ({ code: language.code, name: names.of(language.code) ?? language.name })).sort(
    (a, b) => a.name.localeCompare(b.name, locale),
  );
}

@Component({
  selector: 'app-language-selector',
  imports: [FormsModule, TranslatePipe],
  template: `
    <label
      >{{ 'languageSelector.label' | translate }}
      <select
        [attr.aria-label]="'languageSelector.label' | translate"
        [disabled]="!!field()?.publishedDefinition"
        [ngModel]="value()"
        (ngModelChange)="change($event)"
      >
        <option value="">{{ 'common.notSpecified' | translate }}</option>
        @if (custom(); as code) {
          <option [value]="code">{{ 'languageSelector.current' | translate: { code: code } }}</option>
        }
        @for (language of languages(); track language.code) {
          <option [value]="language.code">{{ language.name }} ({{ language.code }})</option>
        }
      </select>
    </label>
    @if (error(); as message) {
      <p role="alert">{{ message }}</p>
    }
  `,
  styles: `
    @use '../../shared/control-style';
    :host {
      display: block;
      margin-top: 8px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: var(--cedar-font-size);
    }
    select {
      @include control-style.compact-control;
      width: 100%;
      max-width: 320px;
    }
    p {
      color: #b42318;
      margin: 4px 0;
    }
  `,
})
export class LanguageSelectorComponent {
  readonly field = input<Field>();
  readonly container = input<ContainerDraft>();
  private readonly i18n = inject(CedLanguageService);
  readonly languages = computed(() => languageOptions(this.i18n.locale(), this.i18n.language() === 'en'));
  readonly value = computed(() => this.field()?.language ?? this.container()?.metadata?.language ?? '');
  readonly custom = computed(() =>
    this.value() && !LANGUAGES.some((l) => l.code === this.value()) ? this.value() : '',
  );
  readonly error = signal<string | null>(null);
  private readonly service = inject(TemplateService);
  change(value: string): void {
    if (this.field()?.publishedDefinition) return;
    if (value && !LANGUAGES.some((l) => l.code === value) && value !== this.value()) return;
    const field = this.field();
    if (field) {
      this.error.set(this.service.updateFieldSettings(field.id, { language: value || undefined }));
    } else {
      const container = this.container();
      if (!container) return;
      const metadata = container.metadata ?? {
        artifact: containerArtifactMetadata(container),
        language: null,
        annotations: undefined,
        instanceType: null,
        header: null,
        footer: null,
      };
      this.service.updateContainerDefinition(container.id, { metadata: { ...metadata, language: value || null } });
    }
  }
}
