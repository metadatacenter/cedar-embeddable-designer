import { valueLanguage } from './value-language';

describe('the language of a field value', () => {
  it('is the tag the field declares, in its canonical form', () => {
    expect(valueLanguage({ language: 'fr' })).toBe('fr');
    expect(valueLanguage({ language: 'EN-gb' })).toBe('en-GB');
    expect(valueLanguage({ language: 'haw' })).toBe('haw');
  });
  it('is absent when the field declares none', () => {
    expect(valueLanguage({})).toBeNull();
    expect(valueLanguage({ language: '' })).toBeNull();
    expect(valueLanguage({ language: '  ' })).toBeNull();
  });
  it('is absent when the declared tag names no language a browser reads', () => {
    expect(valueLanguage({ language: 'English' })).toBeNull();
    expect(valueLanguage({ language: 'fr_FR' })).toBeNull();
    expect(valueLanguage({ language: 'en--GB' })).toBeNull();
  });
});
