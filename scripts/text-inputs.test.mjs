/**
 * Every text box in this codebase carries `autocomplete="off"`.
 *
 * Without it, a browser lists beneath a text box what was once typed into any box
 * with the same name or id, on this site or another. In the designer that list
 * covers the designer's own menus and suggestions, and none of its entries is the
 * value the box asks for. The attribute holds only by discipline: a new box written
 * without it breaks no build, and the first sign is an author finding last week's
 * searches over the import dialog.
 *
 * Run under `node --test` rather than with the unit suite, which runs in a
 * browser environment and cannot read the source tree it is testing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const SRC = resolve(fileURLToPath(new URL('..', import.meta.url)), 'src');

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

// A browser never offers typed history for these input types.
const NO_HISTORY = new Set([
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'hidden',
  'button',
  'submit',
  'reset',
  'image',
]);

/** Each `<input>` and `<textarea>` opening tag in `text`, with the line it starts on. */
function* textEntryTags(text) {
  for (const match of text.matchAll(/<(input|textarea)(?=[\s/>])/g)) {
    let quote = null;
    let end = match.index + match[0].length;
    for (; end < text.length; end++) {
      const character = text[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    const tag = text.slice(match.index, end + 1);
    const type = /\stype="([^"]*)"/.exec(tag)?.[1];
    if (match[1] === 'input' && NO_HISTORY.has(type)) continue;
    yield { tag, line: text.slice(0, match.index).split('\n').length };
  }
}

test('every text box carries autocomplete="off"', () => {
  const templates = walk(join(SRC, 'app')).filter(
    (file) => file.endsWith('.html') || (file.endsWith('.ts') && !file.endsWith('.spec.ts')),
  );
  const missing = templates.flatMap((file) =>
    [...textEntryTags(readFileSync(file, 'utf8'))]
      .filter(({ tag }) => !/\sautocomplete="off"/.test(tag))
      .map(({ line }) => `${relative(SRC, file)}:${line}`),
  );

  assert.ok(templates.length > 0);
  assert.deepEqual(missing, []);
});
