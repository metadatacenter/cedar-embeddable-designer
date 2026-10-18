import { TestBed } from '@angular/core/testing';
import { FieldLibraryService } from './field-library.service';
import { JsonSourcePolicy } from 'cedar-model-typescript-library/policy';
import { Library } from '../models/types';

const STORAGE_KEY = 'ced-field-library-v1';
const LAB: Library = { id: 1, name: 'Lab', description: '', icon: 'folder' };

describe('FieldLibraryService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });
  afterEach(() => localStorage.clear());

  it('saves the library when it changes', () => {
    const service = TestBed.inject(FieldLibraryService);
    service.libraries.set([LAB]);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ libraries: [LAB], fields: [] });
  });

  it('preserves numeric tokens in retained reusable field settings', () => {
    // Older drafts may carry numeric JSON tokens rather than the current raw-input strings.
    const source =
      '{"libraries":[],"fields":[{"id":1,"libraryId":1,"definition":{"id":1,"type":"number","name":"N","status":"optional","options":[],"defaultValue":{"kind":"none"},"allowMultiple":false,"numeric":{"type":"xsd:decimal","min":0.10000000000000001,"max":9007199254740993,"decimalPlaces":null,"unit":null}}}]}';
    localStorage.setItem(STORAGE_KEY, source);
    const service = TestBed.inject(FieldLibraryService);
    expect(service.fields()).toHaveLength(1);
    TestBed.tick();
    expect(JsonSourcePolicy.stringify(JsonSourcePolicy.parse(localStorage.getItem(STORAGE_KEY)!))).toBe(source);
  });

  it('leaves an unreadable library as stored', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const service = TestBed.inject(FieldLibraryService);
    service.libraries.set([LAB]);
    TestBed.tick();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json');
  });
});
