import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  CedLanguage,
  DEFAULT_LANGUAGE,
  LOCALES,
  MessageParams,
  Translate,
  describeError,
  normalizeLanguage,
  renderParams,
} from './messages';

/*
 * Angular carries only `en-US` locale data by default. The Hungarian locale is
 * registered under the identifier `LOCALES.hu` names, which is the locale `locale`
 * reports while the designer speaks Hungarian.
 */
registerLocaleData(localeHu, LOCALES.hu);

/**
 * The language one designer speaks, and the means of rendering text in it.
 *
 * Provided by each element beside its own `TranslateService`, so the language belongs to
 * the element rather than to the page. The root instance serves code rendered outside an
 * element, which is the development host page and the unit tests.
 *
 * `language` is a signal, and `t` reads it. A computed value or a template that renders
 * text through `t` is therefore recomputed when the host changes the language, just as
 * text rendered through the translate pipe is.
 */
@Injectable({ providedIn: 'root' })
export class CedLanguageService {
  private readonly translate = inject(TranslateService);
  private readonly current = signal<CedLanguage>(DEFAULT_LANGUAGE);

  /** The active language. */
  readonly language = this.current.asReadonly();

  /** The Angular locale dates and numbers are formatted in. */
  readonly locale = computed(() => LOCALES[this.current()]);

  constructor() {
    this.translate.use(DEFAULT_LANGUAGE);
  }

  /** Switch language. A value other than a supported code selects English. */
  setLanguage(value: unknown): void {
    const language = normalizeLanguage(value);
    this.translate.use(language);
    this.current.set(language);
  }

  /** A key rendered in the active language. */
  readonly t: Translate = (key: string, params?: MessageParams): string => {
    const language = this.current();
    return this.translate.instant(key, renderParams(this.t, params), language) as string;
  };

  /** A caught error as the text an author reads, in the active language. */
  describe(error: unknown): string {
    return describeError(error, this.t);
  }
}
