import { describe, expect, it } from 'vitest';
import { Field } from '../models/types';
import { reducePrecision, truncateDecimal } from './precision-change';

describe('reducing precision', () => {
  it.each([
    ['xsd:date', 'month', 'year', '2021-11', '2021'],
    ['xsd:date', 'day', 'month', '2024-02-29', '2024-02'],
    ['xsd:dateTime', 'decimalSecond', 'second', '2024-02-29T23:59:59.987-10:00', '2024-02-29T23:59:59-10:00'],
    ['xsd:dateTime', 'second', 'minute', '2024-02-29T23:59:59Z', '2024-02-29T23:59Z'],
    ['xsd:dateTime', 'minute', 'day', '2024-02-29T23:59+05:30', '2024-02-29'],
    ['xsd:time', 'minute', 'hour', '23:59+05:30', '23+05:30'],
  ])('%s %s to %s discards only hidden parts', (type, from, to, value, expected) => {
    const temporal = { type, granularity: from, timezoneEnabled: true } as Field['temporal'];
    const field = { temporal, defaultValue: { kind: 'temporal', value } } as Field;
    expect(
      reducePrecision(field, { temporal: { ...temporal!, granularity: to } as Field['temporal'] }).defaultValue,
    ).toEqual({ kind: 'temporal', value: expected });
  });
  it.each([
    [1.239, 2, 1.23],
    [-1.239, 2, -1.23],
    [1.15, 2, 1.15],
    [1.234e-7, 8, 1.2e-7],
    [-0.009, 2, 0],
    [123.4, 0, 123],
    [1e21, 2, 1e21],
  ])('truncates %s to %s decimal places', (value, places, expected) =>
    expect(truncateDecimal(value, places)).toBe(expected),
  );
  it('leaves defaults unchanged when precision is increased or unchanged', () => {
    const temporal = { type: 'xsd:date', granularity: 'year', timezoneEnabled: false, inputTimeFormat: null } as const;
    const field = { temporal, defaultValue: { kind: 'temporal', value: '2021' } } as Field;
    expect(reducePrecision(field, { temporal: { ...temporal, granularity: 'month' } }).defaultValue).toBeUndefined();
    expect(reducePrecision(field, { temporal }).defaultValue).toBeUndefined();
  });
});
