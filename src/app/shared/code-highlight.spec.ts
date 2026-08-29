import { highlightJson, highlightYaml } from './code-highlight';

/**
 * The highlighters, which are bound with `[innerHTML]` and therefore have to
 * escape before they decorate.
 *
 * There were two copies of these, character for character, one in each export
 * panel. A fix to either was a fix to one of them, which is how the doubled
 * space after every YAML key survived in both for as long as it did.
 */
describe('highlightJson', () => {
  it('escapes markup before adding its own', () => {
    expect(highlightJson('{"a": "<script>"}')).not.toContain('<script>');
    expect(highlightJson('{"a": "<script>"}')).toContain('&lt;script&gt;');
  });

  it('marks a key differently from a string value', () => {
    const html = highlightJson('{"name": "Study"}');

    expect(html).toContain('<span class="hl-key">"name":</span>');
    expect(html).toContain('<span class="hl-string">"Study"</span>');
  });

  it.each([
    ['true', 'hl-bool'],
    ['false', 'hl-bool'],
    ['null', 'hl-null'],
    ['42', 'hl-number'],
    ['-1.5e10', 'hl-number'],
  ])('marks %s as %s', (literal, className) => {
    expect(highlightJson(`{"a": ${literal}}`)).toContain(`<span class="${className}">${literal}</span>`);
  });
});

describe('highlightYaml', () => {
  it('escapes markup before adding its own', () => {
    expect(highlightYaml('name: "<script>"')).toContain('&lt;script&gt;');
  });

  it('leaves one space after a key, not two', () => {
    // The value arrives with the space that followed the colon still attached.
    // Prepending another put two after every key in the export panel.
    const html = highlightYaml('name: "Study"');

    expect(html).toBe(
      '<span class="hl-key">name</span><span class="hl-punct">:</span> <span class="hl-string">"Study"</span>',
    );
  });

  it('keeps indentation', () => {
    expect(highlightYaml('  key: 1').startsWith('  <span class="hl-key">key</span>')).toBe(true);
  });

  it('marks a list bullet as punctuation', () => {
    expect(highlightYaml('  - text-field')).toContain('<span class="hl-punct">  - </span>');
  });

  it('marks a comment as a comment and leaves it alone', () => {
    expect(highlightYaml('# a note')).toBe('<span class="hl-comment"># a note</span>');
  });

  it('leaves a key with no value as a key', () => {
    expect(highlightYaml('children:')).toBe('<span class="hl-key">children</span><span class="hl-punct">:</span>');
  });
});
