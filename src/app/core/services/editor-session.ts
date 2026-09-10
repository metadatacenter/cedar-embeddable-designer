import { computed, signal } from '@angular/core';
import { ContainerDraft, findContainer, flatView, replaceFields, updateContainer } from '../model/container-draft';
import type { Field } from '../models/types';

/** One document tree and one navigation state per designer; nested containers share it. */
export class EditorSession {
  readonly document;
  readonly activeId;
  readonly active;
  constructor(document: ContainerDraft) {
    this.document = signal(document);
    this.activeId = signal(document.id);
    this.active = computed(() => findContainer(this.document(), this.activeId()) ?? this.document());
  }
  replace(document: ContainerDraft): void {
    this.document.set(document);
    this.activeId.set(document.id);
  }
  update(update: (container: ContainerDraft) => ContainerDraft): void {
    this.document.update((root) => updateContainer(root, this.active().id, update));
  }
  property<K extends keyof ContainerDraft>(key: K) {
    const value = computed(() => this.active()[key]);
    const set = (next: ContainerDraft[K]) => this.update((container) => ({ ...container, [key]: next }));
    return Object.assign(value, {
      set,
      update: (update: (previous: ContainerDraft[K]) => ContainerDraft[K]) => set(update(value())),
    });
  }
  fieldBinding() {
    const value = computed(() => flatView(this.active()).fields);
    const set = (fields: Field[]) => this.update((container) => replaceFields(container, fields));
    return Object.assign(value, { set, update: (update: (previous: Field[]) => Field[]) => set(update(value())) });
  }
}
