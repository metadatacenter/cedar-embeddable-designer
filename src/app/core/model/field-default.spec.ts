import { defaultFromCef, defaultToCef, temporalDefaultError } from './field-default';
import { Field, TemporalSettings } from '../models/types';

describe('temporal defaults at the CEF boundary', () => {
  const cases: Array<[TemporalSettings['type'], TemporalSettings['granularity'], string, string]> = [
    ['xsd:date', 'year', '2026', '2026-01-01'],
    ['xsd:date', 'month', '2026-09', '2026-09-01'],
    ['xsd:date', 'day', '2026-09-09', '2026-09-09'],
    ['xsd:time', 'hour', '14+05:30', '14:00:00+05:30'],
    ['xsd:time', 'minute', '14:30Z', '14:30:00Z'],
    ['xsd:time', 'second', '14:30:10', '14:30:10'],
    ['xsd:time', 'decimalSecond', '14:30:10.001-07:00', '14:30:10.001-07:00'],
    ['xsd:dateTime', 'day', '2026-09-09', '2026-09-09T00:00:00'],
    ['xsd:dateTime', 'hour', '2026-09-09T14', '2026-09-09T14:00:00'],
    ['xsd:dateTime', 'minute', '2026-09-09T14:30+05:30', '2026-09-09T14:30:00+05:30'],
    ['xsd:dateTime', 'second', '2026-09-09T14:30:10Z', '2026-09-09T14:30:10Z'],
    ['xsd:dateTime', 'decimalSecond', '2026-09-09T14:30:10.001Z', '2026-09-09T14:30:10.001Z'],
  ];
  it.each(cases)('converts %s at %s precision without moving the offset', (type, granularity, declared, instance) => {
    const field: Field = {
      id: 1,
      type: 'date',
      name: 'Date',
      status: 'optional',
      options: [],
      allowMultiple: false,
      temporal: { type, granularity, timezoneEnabled: true, inputTimeFormat: '24h' },
      defaultValue: { kind: 'temporal', value: declared },
    };
    expect(defaultToCef(field)).toEqual({ kind: 'temporal', value: instance });
    expect(defaultFromCef(field, { kind: 'temporal', value: instance })).toEqual(field.defaultValue);
  });
});

describe('temporal default validation', () => {
  it.each([
    ['xsd:date', 'day', '2024-02-29', true],
    ['xsd:date', 'day', '2025-02-29', false],
    ['xsd:date', 'month', '2026-13', false],
    ['xsd:date', 'month', '2026-09-01', false],
    ['xsd:time', 'minute', '23:59', true],
    ['xsd:time', 'minute', '24:00', false],
    ['xsd:time', 'second', '12:00:60', false],
    ['xsd:time', 'minute', '12:00:01', false],
    ['xsd:time', 'decimalSecond', '12:00:01.123', true],
    ['xsd:dateTime', 'minute', '2026-04-31T12:00', false],
    ['xsd:dateTime', 'minute', '2026-04-30T12:00+14:01', false],
    ['xsd:dateTime', 'minute', '2026-04-30T12:00-14:00', true],
  ] as const)('checks %s %s default %s', (type, granularity, value, valid) => {
    const field = { temporal: { type, granularity, timezoneEnabled: true } } as Field;
    expect(temporalDefaultError(field, { kind: 'temporal', value }) === null).toBe(valid);
  });
  it('rejects an offset when timezone is disabled', () => {
    const field = { temporal: { type: 'xsd:time', granularity: 'minute', timezoneEnabled: false } } as Field;
    expect(temporalDefaultError(field, { kind: 'temporal', value: '12:00Z' })).toContain('timezone');
  });
});
