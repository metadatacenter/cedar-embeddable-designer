/**
 * The designer's languages and messages, without Angular.
 *
 * The model code throws and returns messages identified by translation keys, and it is
 * also loaded outside Angular, by the browser suite's Node process among others. This
 * module therefore imports nothing but the two language maps. The Angular providers
 * that serve the same maps to the translate pipe are in `i18n.ts`.
 */
import en from '../../assets/i18n/en.json';
import hu from '../../assets/i18n/hu.json';

/** A language map: nested objects whose leaves are the translated strings. */
export type LanguageMap = { readonly [key: string]: string | LanguageMap };

/**
 * The languages the designer's own text is written in.
 *
 * Both maps are bundled into the element, which ships as one script with nothing beside
 * it, so a language never costs a request and can never fail to arrive. CEE bundles its
 * maps for the same reason.
 */
export type CedLanguage = 'en' | 'hu';

export const DEFAULT_LANGUAGE: CedLanguage = 'en';

/** The bundled language maps, by language. */
export const TRANSLATIONS: Readonly<Record<CedLanguage, LanguageMap>> = { en, hu };

/**
 * The Angular locale each language formats dates and numbers with.
 *
 * English keeps `en-US`, which is the locale Angular used before the designer was
 * localized, so every date an English author sees is formatted exactly as it was.
 */
export const LOCALES: Readonly<Record<CedLanguage, string>> = { en: 'en-US', hu: 'hu-HU' };

/** A host's choice of language, where anything but a supported code means English. */
export function normalizeLanguage(value: unknown): CedLanguage {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.hasOwn(TRANSLATIONS, code) ? (code as CedLanguage) : DEFAULT_LANGUAGE;
}

/**
 * A message identified by its translation key, with the values it interpolates.
 *
 * A parameter may itself be a message, which is rendered in the same language before it
 * is interpolated. That is how a message naming a field wraps a message the field's own
 * validation produced.
 */
export interface Message {
  readonly key: string;
  readonly params?: MessageParams;
}

export type MessageParams = Readonly<Record<string, string | number | Message>>;

/** Renders a key in one language. */
export type Translate = (key: string, params?: MessageParams) => string;

const isMessage = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && typeof (value as Message).key === 'string';

/** The parameters, with any nested message rendered through `translate`. */
export function renderParams(
  translate: Translate,
  params: MessageParams | undefined,
): Record<string, string | number> | undefined {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      isMessage(value) ? translate(value.key, value.params) : value,
    ]),
  );
}

/**
 * A key rendered from the bundled map of one language.
 *
 * The interpolation is the one `@ngx-translate/core`'s default parser performs, so a key
 * rendered here and a key rendered through the translate pipe read the same.
 */
export function translateIn(language: CedLanguage, key: string, params?: MessageParams): string {
  let node: unknown = TRANSLATIONS[language];
  for (const part of key.split('.')) {
    node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  if (typeof node !== 'string') return language === DEFAULT_LANGUAGE ? key : translateIn(DEFAULT_LANGUAGE, key, params);
  const values = renderParams((k, p) => translateIn(language, k, p), params) ?? {};
  return node.replace(/{{\s*([\w.]+)\s*}}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

/**
 * English, for code that runs without a designer around it.
 *
 * Model functions take a `Translate` and default to this one, so a caller with no
 * language, such as a unit test or the model's own validation, receives the English
 * text the designer has always produced.
 */
export const english: Translate = (key, params) => translateIn(DEFAULT_LANGUAGE, key, params);

/**
 * An error an author may read, identified by a translation key.
 *
 * Its `message` is the English rendering, which is what the console, the host and the
 * tests have always seen. Where the error is shown to an author, `describeError`
 * renders the key again in the designer's language.
 */
export class LocalizedError extends Error {
  constructor(
    readonly text: Message,
    options?: ErrorOptions,
  ) {
    super(english(text.key, text.params), options);
    this.name = 'LocalizedError';
  }
}

/** A key and its parameters, as the value `LocalizedError` carries. */
export const message = (key: string, params?: MessageParams): Message => ({ key, params });

/**
 * The text to show an author for a caught error.
 *
 * A localized error is rendered in the requested language. Any other error, such as one
 * the CEDAR model library raised, is shown as its own message, because its text does not
 * come from the designer.
 */
export function describeError(error: unknown, translate: Translate): string {
  if (error instanceof LocalizedError) return translate(error.text.key, error.text.params);
  return error instanceof Error ? error.message : String(error);
}

/** The error as a message parameter: its key where it has one, and its text otherwise. */
export function errorParam(error: unknown): string | Message {
  if (error instanceof LocalizedError) return error.text;
  return error instanceof Error ? error.message : String(error);
}
