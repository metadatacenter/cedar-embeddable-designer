import { Field } from '../models/types';

/**
 * The language a field declares for its values, as a tag the `lang` attribute can carry.
 *
 * A field without one, or with a tag no browser reads as a language, gives null, and the value
 * then takes the language of the text around it. The primary subtag must be a two- or
 * three-letter code, because that is the form ISO 639 gives and the only one a screen reader
 * switches its voice for. A malformed tag stays in the field's settings for the author to repair.
 */
export function valueLanguage(field: Pick<Field, 'language'>): string | null {
  const tag = field.language?.trim();
  if (!tag || !/^[a-z]{2,3}(?:-|$)/i.test(tag)) return null;
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}
