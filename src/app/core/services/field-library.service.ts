import { Injectable, effect, signal } from '@angular/core';
import { CustomField, Library } from '../models/types';
import { validateFieldSpecification } from '../model/cedar-template';

const STORAGE_KEY = 'ced-field-library-v1';
@Injectable({ providedIn: 'root' })
export class FieldLibraryService {
  readonly libraries = signal<Library[]>([]);
  readonly fields = signal<CustomField[]>([]);
  readonly error = signal<string | null>(null);
  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved) as { libraries: Library[]; fields: CustomField[] };
        if (!Array.isArray(state.libraries) || !Array.isArray(state.fields)) throw new Error('Invalid field library');
        for (const field of state.fields) validateFieldSpecification(field.definition);
        this.libraries.set(state.libraries);
        this.fields.set(state.fields);
      }
    } catch {
      this.error.set('The saved field library could not be loaded. Its stored data has been left unchanged.');
    }
    effect(() => {
      const state = { libraries: this.libraries(), fields: this.fields() };
      if (this.error()) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        this.error.set('The browser could not save the field library. Export your fields before closing this page.');
      }
    });
  }
}
