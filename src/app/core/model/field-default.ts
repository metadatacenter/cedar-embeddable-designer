import { Field, FieldDefaultValue } from '../models/types';
import { Translate, english } from '../../i18n/messages';

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

/**
 * Check the declared default, without Date.parse normalizing invalid dates or offsets.
 *
 * The message is rendered through `t`, which is English unless the caller supplies the
 * designer's language.
 */
export function temporalDefaultError(field: Field, value: FieldDefaultValue, t: Translate = english): string | null {
  if (value.kind !== 'temporal') return null;
  const { type, granularity } = settings(field);
  const date = '(\\d{4})(?:-(\\d{2}))?(?:-(\\d{2}))?';
  const time = '(\\d{2})(?::(\\d{2}))?(?::(\\d{2})(?:\\.(\\d+))?)?';
  const zone = '(Z|[+-]\\d{2}:\\d{2})?';
  const pattern =
    type === 'xsd:date' || granularity === 'day' ? date : type === 'xsd:time' ? time + zone : date + 'T' + time + zone;
  const match = new RegExp('^' + pattern + '$').exec(value.value);
  if (!match) return t('defaultValue.temporal.pattern');
  let clock = 1;
  if (type !== 'xsd:time') {
    const [, y, m, d] = match;
    const year = Number(y),
      month = m ? Number(m) : 1,
      day = d ? Number(d) : 1;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!year || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return t('defaultValue.temporal.date');
    const requiredParts = granularity === 'year' ? 1 : granularity === 'month' ? 2 : 3;
    if (1 + Number(!!m) + Number(!!d) !== requiredParts) return t('defaultValue.temporal.precision');
    clock = 4;
  }
  if (type === 'xsd:date' || granularity === 'day') return null;
  const [hour, minute, second, fraction, offset] = match.slice(clock);
  if (Number(hour) > 23 || (minute && Number(minute) > 59) || (second && Number(second) > 59))
    return t('defaultValue.temporal.time');
  const parts = 1 + Number(!!minute) + Number(!!second);
  const requiredParts = granularity === 'hour' ? 1 : granularity === 'minute' ? 2 : 3;
  if (parts !== requiredParts || (fraction && granularity !== 'decimalSecond'))
    return t('defaultValue.temporal.precision');
  if (offset) {
    if (!field.temporal?.timezoneEnabled) return t('defaultValue.temporal.timezoneDisabled');
    if (offset !== 'Z') {
      const hours = Number(offset.slice(1, 3)),
        minutes = Number(offset.slice(4));
      if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return t('defaultValue.temporal.offset');
    }
  }
  return null;
}
