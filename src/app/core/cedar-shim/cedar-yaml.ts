// SHIM: JSON → YAML converter for the CEDAR Model format.
// Formats CEDAR Template Model objects according to the CEDAR Structural Specification:
// https://metadatacenter.github.io/cedar-structural-spec/grammar.html

export function toCedarYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const entries = Object.entries(item as Record<string, unknown>);
          if (entries.length === 0) return `${pad}- {}`;
          const [firstKey, firstVal] = entries[0];
          const firstLine = `${pad}- ${firstKey}: ${toCedarYaml(firstVal, indent + 1)}`;
          const restLines = entries.slice(1).map(([k, v]) => {
            const keyPad = '  '.repeat(indent + 1);
            if (typeof v === 'object' && v !== null) {
              return `${keyPad}${k}:\n${toCedarYaml(v, indent + 2)}`;
            }
            return `${keyPad}${k}: ${toCedarYaml(v, indent + 1)}`;
          });
          return [firstLine, ...restLines].join('\n');
        }
        return `${pad}- ${toCedarYaml(item, indent + 1)}`;
      })
      .join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        if (v === null || v === undefined) return `${pad}${k}: null`;
        if (typeof v === 'object' && !Array.isArray(v)) {
          if (Object.keys(v as object).length === 0) return `${pad}${k}: {}`;
          return `${pad}${k}:\n${toCedarYaml(v, indent + 1)}`;
        }
        if (Array.isArray(v)) {
          if (v.length === 0) return `${pad}${k}: []`;
          return `${pad}${k}:\n${toCedarYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${toCedarYaml(v, indent + 1)}`;
      })
      .join('\n');
  }

  return String(value);
}
