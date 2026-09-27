import { provideCedTranslations } from './app/i18n/i18n';

/**
 * The providers every unit test's environment starts with.
 *
 * A component tested on its own has no designer element around it, and it is the
 * element that provides the translation service in the application. This root instance
 * stands in for it, in English, the designer's default language.
 */
export default provideCedTranslations();
