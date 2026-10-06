import { TestBed } from '@angular/core/testing';
import { FieldLibraryService } from './field-library.service';
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

  it('leaves an unreadable library as stored', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const service = TestBed.inject(FieldLibraryService);
    service.libraries.set([LAB]);
    TestBed.tick();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json');
  });
});
