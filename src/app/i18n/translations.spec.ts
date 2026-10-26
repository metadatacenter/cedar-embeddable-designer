/**
 * The translation files, as data.
 *
 * The designer ships two language maps and a host chooses between them. Nothing else
 * checks that they describe the same set of strings, and CEE's maps drifted apart in
 * exactly this way: a key missing from one language shows the author a raw key, and a key
 * whose name was translated along with its value is a key nothing ever looks up.
 *
 * These assertions are structural rather than linguistic. A test cannot know whether a
 * translation is good, but it can know that one exists, that it is not the English
 * verbatim, and that its key is still an identifier.
 */
import { describe, expect, it } from 'vitest';
import en from '../../assets/i18n/en.json';
import hu from '../../assets/i18n/hu.json';

type Flat = Record<string, string>;

const flatten = (node: object, prefix = ''): Flat => {
  const out: Flat = {};
  for (const [key, value] of Object.entries(node)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, `${prefix}${key}.`));
    } else {
      out[`${prefix}${key}`] = String(value);
    }
  }
  return out;
};

const REFERENCE = 'en';
const maps: Record<string, Flat> = { en: flatten(en), hu: flatten(hu) };
const LANGUAGES = Object.keys(maps);
const reference = maps[REFERENCE];

/**
 * Keys whose Hungarian is deliberately the English.
 *
 * Product and standard names stay untranslated, and a value made only of placeholders
 * and punctuation has no words to translate. Each entry is a key rather than a value, so
 * an unrelated string that happens to match is still caught.
 */
const IDENTICAL_BY_DESIGN = [
  'annotations.kind.iri',
  'manualIri.label',
  'errors.namedField',
  'fieldTypes.orcid.label',
  'fieldTypes.ror.label',
  'fieldTypes.pfas.label',
  'fieldTypes.rrid.label',
  'fieldTypes.pubmed.label',
  'fieldTypes.doi.label',
  'fieldTypes.youtube.label',
];

describe('the translation files', () => {
  it('all exist and are non-empty', () => {
    for (const language of LANGUAGES) {
      expect(Object.keys(maps[language]).length, `${language}.json is empty`).toBeGreaterThan(0);
    }
  });

  it.each(LANGUAGES.filter((language) => language !== REFERENCE))(
    '%s declares exactly the keys en declares',
    (language) => {
      const missing = Object.keys(reference).filter((key) => !(key in maps[language]));
      const extra = Object.keys(maps[language]).filter((key) => !(key in reference));

      // Named rather than counted, so a failure says which string an author will not see.
      expect(missing, `${language}.json is missing keys, so those strings fall back to English`).toEqual([]);
      expect(extra, `${language}.json has keys en does not, which is usually a translated key name`).toEqual([]);
    },
  );

  it.each(LANGUAGES)('%s uses ASCII key names, whatever language the values are in', (language) => {
    const nonAscii = Object.keys(maps[language]).filter((key) => !/^[\x20-\x7e]+$/.test(key));
    expect(nonAscii, 'keys are identifiers and must not be translated').toEqual([]);
  });

  it.each(LANGUAGES)('%s has no blank values', (language) => {
    const blank = Object.entries(maps[language])
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  it.each(LANGUAGES.filter((language) => language !== REFERENCE))('%s translates every string', (language) => {
    const untranslated = Object.entries(maps[language])
      .filter(([key, value]) => value === reference[key] && !IDENTICAL_BY_DESIGN.includes(key))
      .map(([key]) => key);
    expect(untranslated, 'a value identical to the English is an untranslated string').toEqual([]);
  });

  it('allows identical values only where they are still identical', () => {
    const stale = IDENTICAL_BY_DESIGN.filter((key) => maps['hu'][key] !== reference[key]);
    expect(stale, 'these keys are translated now; remove them from the list').toEqual([]);
  });

  it.each(LANGUAGES.filter((language) => language !== REFERENCE))(
    '%s interpolates what en interpolates',
    (language) => {
      const placeholders = (value: string) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map(([, name]) => name).sort();
      const mismatched = Object.keys(reference).filter(
        (key) =>
          JSON.stringify(placeholders(reference[key])) !== JSON.stringify(placeholders(maps[language][key] ?? '')),
      );
      expect(mismatched, 'a translation must use the same parameters as the English').toEqual([]);
    },
  );
});
