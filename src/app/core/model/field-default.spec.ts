import { defaultFromCef, defaultToCef } from './field-default';
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
