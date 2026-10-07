import { Component, computed, inject, input } from '@angular/core';
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
        [disabled]="locked()"
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
    @use '@org.metadatacenter/cedar-design-tokens/authoring';
    :host {
      display: block;
      margin-top: var(--cedar-space-2);
    }
    label {
      @include authoring.label-text;
      display: flex;
      flex-direction: column;
      gap: var(--cedar-space-1);
    }
    select {
      @include authoring.compact-control;
      width: 100%;
      max-width: 320px;
    }
    p {
      color: var(--cedar-status-error-text);
      margin: var(--cedar-space-1) 0;
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
  readonly error = computed(() => {
    const field = this.field();
    return field ? this.service.settingError(field.id, 'language') : null;
  });
  private readonly service = inject(TemplateService);
  /** Whether the artifact's own definition is locked: it is published, or inside a published element. */
  readonly locked = computed(() => {
    const id = this.field()?.id ?? this.container()?.id;
    return !!this.field()?.publishedDefinition || (id !== undefined && this.service.definitionLocked(id));
  });
  change(value: string): void {
    if (this.locked()) return;
    if (value && !LANGUAGES.some((l) => l.code === value) && value !== this.value()) return;
    const field = this.field();
    if (field) {
      this.service.updateFieldSettings(field.id, { language: value || undefined });
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
