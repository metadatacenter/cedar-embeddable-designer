import { Field } from '../models/types';
import { temporalDefaultError } from './field-default';

/** Truncate decimal digits toward zero without floating-point multiplication or rounding. */
export function truncateDecimal(value: number, places: number): number {
  if (!Number.isFinite(value)) return value;
  const [coefficient, exponent = '0'] = String(Math.abs(value)).split('e');
  const digits = coefficient.replace('.', '');
  const keep = coefficient.split('.')[0].length + Number(exponent) + places;
  if (keep >= digits.length) return value;
  if (keep <= 0) return 0;
  return Number(`${value < 0 ? '-' : ''}${digits.slice(0, keep)}e-${places}`) || 0;
}

/** Only an explicit reduction in precision discards data; loading and ordinary edits stay strict. */
export function reducePrecision(current: Field, changes: Partial<Field>): Partial<Field> {
  const value = changes.defaultValue ?? current.defaultValue;
  const before = current.temporal;
  const after = changes.temporal;
  if (
    before &&
    after &&
    before.type === after.type &&
    value.kind === 'temporal' &&
    !temporalDefaultError(current, value)
  ) {
    const order = ['year', 'month', 'day', 'hour', 'minute', 'second', 'decimalSecond'];
    if (order.indexOf(after.granularity) < order.indexOf(before.granularity)) {
      const offset = /(?:Z|[+-]\d{2}:\d{2})$/.exec(value.value)?.[0] ?? '';
      const base = offset ? value.value.slice(0, -offset.length) : value.value;
      const length = { year: 4, month: 7, day: 10, hour: 2, minute: 5, second: 8, decimalSecond: undefined }[
        after.granularity
      ];
      if (length !== undefined) {
        const hasTime = ['hour', 'minute', 'second'].includes(after.granularity);
        const end = length + (hasTime && after.type === 'xsd:dateTime' ? 11 : 0);
        changes = {
          ...changes,
          defaultValue: { kind: 'temporal', value: base.slice(0, end) + (hasTime ? offset : '') },
        };
      }
    }
  }
  const numeric = changes.numeric;
  const places = numeric?.decimalPlaces;
  if (
    numeric &&
    places != null &&
    Number.isSafeInteger(places) &&
    places >= 0 &&
    places < (current.numeric?.decimalPlaces ?? Infinity)
  ) {
    changes = {
      ...changes,
      numeric: {
        ...numeric,
        min: numeric.min === null ? null : truncateDecimal(numeric.min, places),
        max: numeric.max === null ? null : truncateDecimal(numeric.max, places),
      },
    };
    if (value.kind === 'number') changes.defaultValue = { kind: 'number', value: truncateDecimal(value.value, places) };
  }
  return changes;
}
