import { Injectable, effect, signal } from '@angular/core';
import { CustomField, Library } from '../models/types';
import { validateFieldSpecification } from '../model/cedar-template';

const STORAGE_KEY = 'ced-field-library-v1';
@Injectable({ providedIn: 'root' })
export class FieldLibraryService {
  readonly libraries = signal<Library[]>([]);
  readonly fields = signal<CustomField[]>([]);
  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved) as { libraries: Library[]; fields: CustomField[] };
        if (!Array.isArray(state.libraries) || !Array.isArray(state.fields)) throw new TypeError();
        for (const field of state.fields) validateFieldSpecification(field.definition);
        this.libraries.set(state.libraries);
        this.fields.set(state.fields);
      }
    } catch {
      // An unreadable library stays as stored. Saving would replace it with the empty one.
      return;
    }
    effect(() => {
      const state = { libraries: this.libraries(), fields: this.fields() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage is full or refused. The next change tries again.
      }
    });
  }
}
