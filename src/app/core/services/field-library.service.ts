import { Injectable, effect, signal } from '@angular/core';
import { CustomField, Library } from '../models/types';
import { validateFieldSpecification } from '../model/cedar-template';

const STORAGE_KEY = 'ced-field-library-v1';
@Injectable({ providedIn: 'root' })
export class FieldLibraryService {
  readonly libraries = signal<Library[]>([]);
  readonly fields = signal<CustomField[]>([]);
  /**
   * The translation key of a storage failure, or null.
   *
   * A key rather than text, because the library is shared by every designer on the page
   * and each renders the failure in its own language.
   */
  readonly error = signal<string | null>(null);
  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved) as { libraries: Library[]; fields: CustomField[] };
        // Caught below, which reports the unreadable library to the author.
        if (!Array.isArray(state.libraries) || !Array.isArray(state.fields)) throw new TypeError();
        for (const field of state.fields) validateFieldSpecification(field.definition);
        this.libraries.set(state.libraries);
        this.fields.set(state.fields);
      }
    } catch {
      this.error.set('fieldLibrary.loadFailed');
    }
    effect(() => {
      const state = { libraries: this.libraries(), fields: this.fields() };
      if (this.error()) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        this.error.set('fieldLibrary.saveFailed');
      }
    });
  }
}
