// Every designer message that carries a count, at zero, one and two, in English and Hungarian.
//
// A number before a noun needs a singular in English: "1 errors" on the outline's badge and "at
// least 1 characters" were what one meant. A counted message keeps its forms under `<key>.one`
// and `<key>.other`, and `countKey` in messages.ts, with the `countKey` pipe over it, is the one
// place that chooses. Hungarian keeps a noun singular after any number, so its two forms read
// alike. This fails when a message counting a plural noun has no singular, when a singular still
// reads as a plural, or when source names a form itself rather than asking `countKey`.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const catalogue = async (language) =>
  JSON.parse(await readFile(join(root, 'src/assets/i18n', `${language}.json`), 'utf8'));
function flatten(node, prefix = '', into = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, into);
    else into[path] = value;
  }
  return into;
}
const texts = { en: flatten(await catalogue('en')), hu: flatten(await catalogue('hu')) };
const NOT_PLURAL = new Set(['is', 'was', 'has', 'its', 'this', 'as']);
function readsPlural(text) {
  for (const match of text.matchAll(/\{\{\s*count\s*\}\}([^.,:;()—–|]*)/g))
    if (
      match[1]
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .some((word) => /s$/i.test(word) && !NOT_PLURAL.has(word.toLowerCase()))
    )
      return true;
  return false;
}
const counted = Object.keys(texts.en)
  .filter((key) => key.endsWith('.other') && texts.en[key.replace(/\.other$/, '.one')] !== undefined)
  .map((key) => key.replace(/\.other$/, ''));

test('every English message that counts a plural noun has a singular, in both languages', () => {
  const missing = Object.entries(texts.en)
    .filter(([key, text]) => !key.endsWith('.one') && !key.endsWith('.other') && readsPlural(text))
    .map(([key, text]) => `${key}: ${text}`);
  assert.deepEqual(missing, []);
  for (const key of counted)
    for (const language of ['en', 'hu'])
      assert.equal(typeof texts[language][`${key}.one`], 'string', `${language} has no ${key}.one`);
});

for (const key of counted)
  for (const language of ['en', 'hu'])
    for (const count of [0, 1, 2])
      test(`${key} with ${count}, in ${language}`, () => {
        const text = texts[language][`${key}.${count === 1 ? 'one' : 'other'}`];
        assert.equal(typeof text, 'string');
        if (language === 'en' && count === 1) {
          assert.ok(!readsPlural(text), `the singular still reads as a plural: ${text}`);
          assert.notEqual(text, texts.en[`${key}.other`]);
        }
      });

test('no source names a counted form itself', async () => {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) files.push(path);
    }
  }
  await walk(join(root, 'src/app'));
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const key of counted)
      if (new RegExp(`['"\`]${key.replace(/\./g, '\\.')}\\.(one|other)['"\`]`).test(source))
        offenders.push(`${file}: ${key}`);
  }
  assert.deepEqual(offenders, []);
});
