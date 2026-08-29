/**
 * Syntax highlighting for the JSON and YAML the designer shows.
 *
 * One copy. The two export panels each carried their own, character for
 * character, so a fix to either was a fix to one of them — which is how the
 * doubled space after every YAML key survived in both.
 *
 * The output is bound with `[innerHTML]`, so every value is escaped here before
 * any markup is added. Angular sanitizes what it is given as well; this is the
 * first of the two, not a substitute for it.
 */

function escapeHtml(code: string): string {
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightJson(code: string): string {
  return escapeHtml(code).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        return /:$/.test(match) ? `<span class="hl-key">${match}</span>` : `<span class="hl-string">${match}</span>`;
      }
      if (/true|false/.test(match)) {
        return `<span class="hl-bool">${match}</span>`;
      }
      if (/null/.test(match)) {
        return `<span class="hl-null">${match}</span>`;
      }
      return `<span class="hl-number">${match}</span>`;
    },
  );
}

export function highlightYaml(code: string): string {
  return escapeHtml(code)
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) {
        return `<span class="hl-comment">${line}</span>`;
      }
      const keyMatch = line.match(/^(\s*)([\w\-@:'"]+)(\s*:)(.*)/);
      if (keyMatch) {
        const [, indent, key, colon, rest] = keyMatch;
        return `${indent}<span class="hl-key">${key}</span><span class="hl-punct">${colon}</span>${highlightYamlValue(rest)}`;
      }
      const listMatch = line.match(/^(\s*-\s*)(.*)/);
      if (listMatch) {
        const [, bullet, rest] = listMatch;
        return `<span class="hl-punct">${bullet}</span>${highlightYamlValue(rest)}`;
      }
      return line;
    })
    .join('\n');
}

/**
 * A YAML value, highlighted.
 *
 * `value` arrives with the space that followed the colon still attached, so the
 * span is built around the trimmed text and the space re-emitted before it.
 * Prepending one to the untrimmed value put two after every key, which made the
 * model library's output look like something it had not written.
 */
function highlightYamlValue(value: string): string {
  const trimmed = value.trim();
  const lead = value.startsWith(' ') ? ' ' : '';

  if (trimmed === '') {
    return value;
  }
  if (trimmed === 'null' || trimmed === '~') {
    return `${lead}<span class="hl-null">${trimmed}</span>`;
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return `${lead}<span class="hl-bool">${trimmed}</span>`;
  }
  if (/^-?\d/.test(trimmed)) {
    return `${lead}<span class="hl-number">${trimmed}</span>`;
  }
  return `${lead}<span class="hl-string">${trimmed}</span>`;
}
