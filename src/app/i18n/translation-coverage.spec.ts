/**
 * A guard against user-visible text that bypasses the translation files.
 *
 * Every string an author can see is meant to come from `src/assets/i18n/en.json` and its
 * Hungarian counterpart. A literal written straight into a template or a message still
 * renders, in English, whatever language the host chose, and nothing else would notice.
 * This suite reads the source and fails on such a literal, so the rule holds as the code
 * changes rather than only on the day the designer was localized.
 *
 * The scan is lexical rather than a compiler pass. The unit suite is bundled for a browser
 * environment and reads the source through `import.meta.glob`, so it cannot load the
 * TypeScript or Angular compilers. The rules are therefore stated as patterns, and they
 * are listed below so that what counts as a finding is explicit.
 *
 * Deliberate exceptions live in `i18n-allowlist.json` beside this file. Each entry
 * identifies a file and the exact text found there, and gives a reason. The suite fails
 * on any finding the list does not cover and on any entry that no longer matches a
 * finding, so the list cannot outlive the code it excuses.
 */
import { describe, expect, it } from 'vitest';
import en from '../../assets/i18n/en.json';
import allowList from './i18n-allowlist.json';

interface Finding {
  readonly file: string;
  readonly text: string;
}

interface AllowListEntry {
  readonly file: string;
  readonly text: string;
  readonly reason: string;
}

const html = import.meta.glob<string>('/src/app/**/*.html', { eager: true, query: '?raw', import: 'default' });
const typescript = import.meta.glob<string>('/src/app/**/*.ts', { eager: true, query: '?raw', import: 'default' });

/** Test code and fixtures are not rendered to authors. */
const inScope = (file: string): boolean => !file.endsWith('.spec.ts') && !file.includes('/fixtures/');

const relative = (file: string): string => file.replace(/^\//, '');

const LETTER = /\p{L}/u;

/** Every key the English map declares, flattened to dotted paths. */
const KEYS: ReadonlySet<string> = new Set(
  (function flatten(node: object, prefix: string): string[] {
    return Object.entries(node).flatMap(([key, value]) =>
      value !== null && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
    );
  })(en, ''),
);

/**
 * Whether a literal is a translation key rather than text.
 *
 * A literal ending in a dot passes when it begins at least one key, because code that
 * selects one of a family of keys (`'fieldTypes.' + type`) writes only the prefix. A
 * literal beginning with a dot passes when it continues one, for the same reason.
 */
const isKey = (literal: string): boolean =>
  KEYS.has(literal) ||
  (literal.endsWith('.') && [...KEYS].some((key) => key.startsWith(literal))) ||
  (/^\.[\w$-]+$/.test(literal) && [...KEYS].some((key) => key.includes(`${literal}.`) || key.endsWith(literal)));

/** Whether a literal reads as a phrase: words separated by space, or a sentence. */
const isProse = (literal: string): boolean =>
  /\p{L}[^\n]*\s+[^\n]*\p{L}/u.test(literal) || /\p{L}[.!?…:]$/u.test(literal);

// ---------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------

/**
 * The static attributes whose values are read or shown to people.
 *
 * The first nine are the general rule every CEDAR frontend applies. `action` is this
 * repository's own: `app-manual-iri` renders it as the label of its submit button.
 */
const TEXT_ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'title',
  'placeholder',
  'alt',
  'label',
  'mattooltip',
  'action',
];

const isTextAttribute = (name: string): boolean => {
  const bare = name.toLowerCase().replace(/^attr\./, '');
  return TEXT_ATTRIBUTES.includes(bare);
};

/** The inline templates of a TypeScript source, with the source they came from removed. */
function inlineTemplates(source: string): { templates: string[]; rest: string } {
  const templates: string[] = [];
  const rest = source.replace(/\btemplate\s*:\s*`([\s\S]*?)`/g, (match, body: string) => {
    templates.push(body);
    return ' '.repeat(match.length);
  });
  return { templates, rest };
}

/** The index just past the parenthesised group that opens at `start`, honouring quotes. */
function closingParen(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '(') {
      depth++;
    } else if (c === ')' && --depth === 0) {
      return i + 1;
    }
  }
  return text.length;
}

/**
 * A text run with Angular's block syntax removed.
 *
 * `@if (…) {`, `} @else {`, `@for (…; track …) {`, `@switch`, `@case`, `@default`,
 * `@empty`, `@let … ;` and the closing braces are syntax, not text.
 */
function withoutBlocks(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const block = /^@(else\s+if|if|else|for|switch|case|default|empty|defer|placeholder|loading|error|let)\b/.exec(
      text.slice(i),
    );
    if (block) {
      i += block[0].length;
      if (block[1] === 'let') {
        const end = text.indexOf(';', i);
        i = end < 0 ? text.length : end + 1;
        continue;
      }
      while (/\s/.test(text[i] ?? '')) i++;
      if (text[i] === '(') i = closingParen(text, i);
      continue;
    }
    const c = text[i];
    out += c === '{' || c === '}' ? ' ' : c;
    i++;
  }
  return out;
}

/** The quoted literals inside an Angular expression that are not keys or identifiers. */
function expressionLiterals(expression: string): string[] {
  const found: string[] = [];
  for (const match of expression.matchAll(/(['"])((?:(?!\1).)*)\1/g)) {
    const literal = match[2];
    const index = match.index;
    if (!LETTER.test(literal) || isKey(literal)) continue;
    const before = expression.slice(0, index);
    const after = expression.slice(index + match[0].length);
    // A comparison operand is an identifier, and a pipe argument is a format or option.
    if (/(===|!==|==|!=)\s*$/.test(before) || /^\s*(===|!==|==|!=)/.test(after)) continue;
    if (/\|\s*[\w]+(\s*:\s*[^|:]+)*\s*:\s*$/.test(before)) continue;
    // A single word passed as an argument, or a key's suffix, names something; phrases are text.
    if (/^\.?[\w$-]+(\.[\w$-]+)*$/.test(literal) && /[(,+]\s*$/.test(before)) continue;
    found.push(literal);
  }
  return found;
}

const INTERPOLATION = /\{\{([\s\S]*?)\}\}/g;
const ENTITY = /&(#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi;
const TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** What a template shows without going through translation. */
function scanTemplate(template: string): string[] {
  const findings: string[] = [];
  const source = template.replace(/<!--[\s\S]*?-->/g, ' ');
  const checkText = (text: string) => {
    for (const [, expression] of text.matchAll(INTERPOLATION)) findings.push(...expressionLiterals(expression));
    const residue = collapse(withoutBlocks(text.replace(INTERPOLATION, ' ').replace(ENTITY, ' ')));
    if (LETTER.test(residue)) findings.push(residue);
  };
  let cursor = 0;
  let raw = 0;
  for (const tag of source.matchAll(TAG)) {
    const name = tag[2].toLowerCase();
    if (raw === 0) checkText(source.slice(cursor, tag.index));
    cursor = tag.index + tag[0].length;
    // `<style>` and `<script>` bodies are not text.
    if (name === 'style' || name === 'script') raw += tag[1] ? -1 : 1;
    if (tag[1]) continue;
    for (const attribute of tag[3].matchAll(ATTRIBUTE)) {
      const attributeName = attribute[1];
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
      const bound = /^\[(.+)\]$/.exec(attributeName);
      if (bound) {
        if (isTextAttribute(bound[1])) findings.push(...expressionLiterals(value));
      } else if (isTextAttribute(attributeName)) {
        // A static value may be a key that the component renders, as `action` is.
        if (isKey(value)) continue;
        for (const [, expression] of value.matchAll(INTERPOLATION)) findings.push(...expressionLiterals(expression));
        const residue = collapse(value.replace(INTERPOLATION, ' ').replace(ENTITY, ' '));
        if (LETTER.test(residue)) findings.push(residue);
      }
    }
  }
  if (raw === 0) checkText(source.slice(cursor));
  return findings;
}

// ---------------------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------------------

interface Literal {
  readonly start: number;
  readonly text: string;
}

/**
 * The string literals of a TypeScript source, and the source with every literal and
 * comment blanked out, so that patterns over the code cannot match inside either.
 *
 * A template literal contributes its static parts joined by a space; its
 * substitutions stay in the blanked code, where they are scanned as code.
 */
function lex(source: string): { code: string; literals: Literal[] } {
  const literals: Literal[] = [];
  const code = source.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (code[k] !== '\n') code[k] = ' ';
  };
  let i = 0;
  let previous = '';
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && /[(,=:[!&|?{};]$|^$|\breturn$/.test(previous)) {
      // A regular expression literal, which may hold quotes that open nothing.
      let k = i + 1;
      let inClass = false;
      while (k < source.length && source[k] !== '\n') {
        if (source[k] === '\\') k++;
        else if (source[k] === '[') inClass = true;
        else if (source[k] === ']') inClass = false;
        else if (source[k] === '/' && !inClass) break;
        k++;
      }
      blank(i, k + 1);
      i = k + 1;
      previous = 'x';
      continue;
    }
    if (c === "'" || c === '"') {
      let k = i + 1;
      let text = '';
      while (k < source.length && source[k] !== c && source[k] !== '\n') {
        if (source[k] === '\\') {
          text += source[k + 1];
          k += 2;
        } else text += source[k++];
      }
      literals.push({ start: i, text });
      blank(i + 1, k);
      i = k + 1;
      previous = 'x';
      continue;
    }
    if (c === '`') {
      let k = i + 1;
      const parts: string[] = [''];
      const blanks: [number, number][] = [];
      let partStart = k;
      while (k < source.length && source[k] !== '`') {
        if (source[k] === '\\') {
          parts[parts.length - 1] += source[k + 1];
          k += 2;
        } else if (source[k] === '$' && source[k + 1] === '{') {
          blanks.push([partStart, k]);
          let depth = 1;
          k += 2;
          while (k < source.length && depth > 0) {
            if (source[k] === '{') depth++;
            else if (source[k] === '}') depth--;
            k++;
          }
          parts.push('');
          partStart = k;
        } else parts[parts.length - 1] += source[k++];
      }
      blanks.push([partStart, k]);
      literals.push({ start: i, text: parts.join(' ') });
      for (const [from, to] of blanks) blank(from, to);
      i = k + 1;
      previous = 'x';
      continue;
    }
    if (!/\s/.test(c)) previous = /[\w$]/.test(c) ? (previous + c).slice(-8) : c;
    i++;
  }
  return { code: code.join(''), literals };
}

/**
 * The places in TypeScript where a literal reaches an author.
 *
 * Each sink is a pattern over the code immediately before a literal. A strong sink flags
 * any literal holding a letter; a weak sink flags only a phrase, because the same
 * positions also carry identifiers such as a settings tab's name.
 */
const SINKS: readonly { readonly name: string; readonly before: RegExp; readonly strong: boolean }[] = [
  {
    name: 'an object property that is displayed',
    before:
      /(?:^|[{,(\s])(label|title|message|placeholder|ariaLabel|summary|tooltip|description|preview|heading)\s*:\s*[^,;{}:]*$/,
    strong: true,
  },
  {
    name: 'a write to a signal that is displayed',
    before: /\b\w*(error|Error|notice|Notice|status|Status|message|Message|heading|Heading)\.set\([^;]*$/,
    strong: true,
  },
  {
    name: 'an assignment to a displayed field',
    before: /(?<![\w.])(?:this\.)?(error|message|notice|heading)\s*=(?!=)[^;]*$/,
    strong: true,
  },
  { name: 'a browser dialog', before: /\b(confirm|alert|prompt)\([^;]*$/, strong: true },
  {
    name: 'a settings error reported to the UI',
    before: /\b(setError|report|setSettingsError)\([^;]*$/,
    strong: false,
  },
  { name: 'a returned message', before: /\breturn\s+[^;]*$/, strong: false },
  { name: 'an error whose message is shown', before: /\bnew\s+\w*Error\([^;]*$/, strong: false },
];

/** The calls that are themselves sinks, whose identifier arguments are therefore text. */
const SINK_CALLS = /^(set|confirm|alert|prompt|setError|report|setSettingsError|Error|\w+Error)$/;

function scanTypeScript(source: string): string[] {
  const { code, literals } = lex(source);
  const findings: string[] = [];
  for (const literal of literals) {
    if (!LETTER.test(literal.text) || isKey(literal.text)) continue;
    const before = code.slice(Math.max(0, literal.start - 240), literal.start);
    const after = code.slice(literal.start + literal.text.length + 2, literal.start + literal.text.length + 8);
    if (/^\.?[\w$-]+(\.[\w$-]+)*$/.test(literal.text)) {
      // An identifier compared with, joined to a key, or passed to an ordinary call is not text.
      if (/(===|!==)\s*$/.test(before) || /^\s*(===|!==)/.test(after) || /\+\s*$/.test(before)) continue;
      const call = /([\w$]+)\(\s*$/.exec(before);
      if (call && !SINK_CALLS.test(call[1])) continue;
    }
    const sink = SINKS.find((candidate) => candidate.before.test(before));
    if (sink && (sink.strong || isProse(literal.text))) findings.push(collapse(literal.text));
  }
  return findings;
}

// ---------------------------------------------------------------------------------------

function findings(): Finding[] {
  const out: Finding[] = [];
  for (const [file, source] of Object.entries(html)) {
    if (!inScope(file)) continue;
    for (const text of scanTemplate(source)) out.push({ file: relative(file), text });
  }
  for (const [file, source] of Object.entries(typescript)) {
    if (!inScope(file)) continue;
    const { templates, rest } = inlineTemplates(source);
    for (const template of templates)
      for (const text of scanTemplate(template)) out.push({ file: relative(file), text });
    for (const text of scanTypeScript(rest)) out.push({ file: relative(file), text });
  }
  return out;
}

const allowed = allowList as readonly AllowListEntry[];
const matches = (entry: AllowListEntry, finding: Finding) => entry.file === finding.file && entry.text === finding.text;

describe('user-visible text', () => {
  const all = findings();

  it('comes from the translation files, or is on the allow-list', () => {
    const unlisted = all.filter((finding) => !allowed.some((entry) => matches(entry, finding)));
    expect(unlisted, 'translate these strings, or allow-list them with a reason').toEqual([]);
  });

  it('has an allow-list with no stale entries', () => {
    const stale = allowed.filter((entry) => !all.some((finding) => matches(entry, finding)));
    expect(stale, 'these entries excuse nothing any more; remove them').toEqual([]);
  });

  it('has a reason for every allow-list entry', () => {
    expect(allowed.filter((entry) => !entry.reason?.trim())).toEqual([]);
  });
});
