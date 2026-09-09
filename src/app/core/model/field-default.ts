import { Field, FieldDefaultValue } from '../models/types';

function settings(field: Field) {
  return (
    field.temporal ?? {
      type: field.type === 'time' ? 'xsd:time' : 'xsd:date',
      granularity: field.type === 'time' ? 'minute' : 'day',
    }
  );
}

/** Defaults use declared precision; CEF edits complete XSD instance literals. */
export function defaultFromCef(field: Field, value: FieldDefaultValue): FieldDefaultValue {
  if (value.kind !== 'temporal') return value;
  const { type, granularity } = settings(field);
  const text = value.value;
  if (type === 'xsd:date' || granularity === 'day') {
    return { kind: 'temporal', value: text.slice(0, granularity === 'year' ? 4 : granularity === 'month' ? 7 : 10) };
  }
  const offset = /(?:Z|[+-]\d{2}:\d{2})$/.exec(text)?.[0] ?? '';
  const start = type === 'xsd:dateTime' ? 11 : 0;
  const length = granularity === 'hour' ? 2 : granularity === 'minute' ? 5 : granularity === 'second' ? 8 : null;
  return { kind: 'temporal', value: length === null ? text : text.slice(0, start + length) + offset };
}

/** Pad only hidden temporal parts, without a Date conversion that would move the timezone. */
export function defaultToCef(field: Field): FieldDefaultValue {
  const value = field.defaultValue;
  if (value.kind !== 'temporal') return value;
  const { type, granularity } = settings(field);
  const text = value.value;
  if (type === 'xsd:date') {
    return {
      kind: 'temporal',
      value: granularity === 'year' ? `${text}-01-01` : granularity === 'month' ? `${text}-01` : text,
    };
  }
  if (type === 'xsd:dateTime' && granularity === 'day') return { kind: 'temporal', value: `${text}T00:00:00` };
  const offset = /(?:Z|[+-]\d{2}:\d{2})$/.exec(text)?.[0] ?? '';
  const base = offset ? text.slice(0, -offset.length) : text;
  const padding = granularity === 'hour' ? ':00:00' : granularity === 'minute' ? ':00' : '';
  return { kind: 'temporal', value: base + padding + offset };
}
