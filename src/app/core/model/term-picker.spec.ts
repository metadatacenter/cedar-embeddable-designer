import { termPickerAvailable } from './term-picker';

describe('offering the picker', () => {
  it('is offered when the host has registered it', () => {
    expect(termPickerAvailable({ get: () => class extends HTMLElement {} })).toBe(true);
  });

  it('is not offered when the host has not', () => {
    // The picker is a sibling component the host loads, not a dependency this
    // bundle carries, so its absence is a normal state rather than a fault.
    expect(termPickerAvailable({ get: () => undefined })).toBe(false);
  });
});
