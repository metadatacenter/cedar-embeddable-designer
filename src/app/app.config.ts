import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideCedTranslations } from './i18n/i18n';

/**
 * The application's providers.
 *
 * The translation service here serves only what renders outside a designer element,
 * which is the development host page. Each element provides its own.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), ...provideCedTranslations()],
};
