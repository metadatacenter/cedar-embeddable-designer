import { Provider } from '@angular/core';
import { TranslateLoader, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { DEFAULT_LANGUAGE, TRANSLATIONS, normalizeLanguage } from './messages';

/** Serves the bundled maps, so choosing a language never makes a request. */
export class BundledTranslateLoader implements TranslateLoader {
  getTranslation(language: string): Observable<TranslationObject> {
    return of(TRANSLATIONS[normalizeLanguage(language)]);
  }
}

/**
 * One translation service, with the bundled maps and English as its fallback.
 *
 * Each designer element lists these providers itself, beside `CedLanguageService`, so
 * every element on a page owns its language. Two designers set to different languages
 * then never share the state that decides which one is current.
 */
export function provideCedTranslations(): Provider[] {
  return provideTranslateService({
    /*
     * A class provider written out, not `provideTranslateLoader`. That helper decides
     * between `useClass` and `useFactory` by reading the class's source text, and the
     * minified build prints a class without the space the test looks for, so the
     * loader was called as a factory and the element failed to start.
     */
    loader: { provide: TranslateLoader, useClass: BundledTranslateLoader },
    lang: DEFAULT_LANGUAGE,
    fallbackLang: DEFAULT_LANGUAGE,
  });
}
