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

/**
 * Parses a YAML string (emitted by toCedarYaml or standard CEDAR YAML) into an object structure.
 */
export function fromCedarYaml(yamlStr: string): any {
  if (!yamlStr || typeof yamlStr !== 'string') return null;

  const trimmed = yamlStr.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through
    }
  }

  const lines = yamlStr.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
  if (lines.length === 0) return null;

  function parseVal(v: string): any {
    v = v.trim();
    if (v === 'null' || v === '~') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return v;
  }

  const root: any = {};
  const stack: { indent: number; container: any; parentObj?: any; keyInParent?: string }[] = [
    { indent: -1, container: root }
  ];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const currentFrame = stack[stack.length - 1];

    if (line.startsWith('- ')) {
      const itemContent = line.slice(2).trim();

      if (!Array.isArray(currentFrame.container)) {
        const arr: any[] = [];
        if (currentFrame.parentObj && currentFrame.keyInParent) {
          currentFrame.parentObj[currentFrame.keyInParent] = arr;
        }
        currentFrame.container = arr;
      }

      const targetArray = currentFrame.container as any[];

      if (itemContent.includes(':')) {
        const colonIdx = itemContent.indexOf(':');
        const k = itemContent.slice(0, colonIdx).trim();
        const rawV = itemContent.slice(colonIdx + 1).trim();
        const obj: any = {};
        if (rawV.length > 0) {
          obj[k] = parseVal(rawV);
        }
        targetArray.push(obj);
        stack.push({ indent, container: obj });
      } else {
        const parsed = parseVal(itemContent);
        targetArray.push(parsed);
      }
    } else if (line.includes(':')) {
      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const valStr = line.slice(colonIdx + 1).trim();

      let targetObj = currentFrame.container;
      if (Array.isArray(targetObj)) {
        targetObj = targetObj[targetObj.length - 1];
      }

      if (valStr.length > 0) {
        targetObj[key] = parseVal(valStr);
      } else {
        let isNextArray = false;
        if (i + 1 < lines.length) {
          const nextRaw = lines[i + 1];
          const nextIndent = nextRaw.search(/\S/);
          if (nextIndent > indent && nextRaw.trim().startsWith('- ')) {
            isNextArray = true;
          }
        }

        const newContainer = isNextArray ? [] : {};
        targetObj[key] = newContainer;
        stack.push({
          indent,
          container: newContainer,
          parentObj: targetObj,
          keyInParent: key
        });
      }
    }
  }

  return root;
}
