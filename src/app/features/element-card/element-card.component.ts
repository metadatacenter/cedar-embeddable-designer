import { Component, input, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ElementNode, Placement } from '../../core/model/container-draft';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-element-card',
  imports: [FormsModule],
  template: `<section aria-label="Element" class="element-card">
    <header>
      <strong>{{ node().definition.name }}</strong
      ><span>Element · {{ node().definition.children.length }} children</span>
    </header>
    <p>{{ node().definition.description }}</p>
    <div class="actions">
      <button type="button" (click)="service.openContainer(node().id)">Edit Element</button>
      <button type="button" (click)="service.duplicateElement(node().id)">Duplicate Element</button>
      <button type="button" (click)="service.deleteChild(node().id)">Remove Element</button>
    </div>
    <details>
      <summary>Placement</summary>
      <label>Property name <input [(ngModel)]="draft().deploymentName" /></label>
      <label>Display label <input [(ngModel)]="draft().displayLabel" /></label>
      <label>Display description <input [(ngModel)]="draft().displayDescription" /></label>
      <label>Property IRI <input [(ngModel)]="draft().propertyIri" /></label>
      <label
        >Status
        <select [(ngModel)]="draft().status">
          <option value="optional">Optional</option>
          <option value="required">Required</option>
          <option value="recommended">Recommended</option>
        </select></label
      >
      <label><input type="checkbox" [(ngModel)]="draft().allowMultiple" /> Allow multiple</label>
      @if (draft().allowMultiple) {
        <label>Minimum occurrences <input type="number" min="0" step="1" [(ngModel)]="draft().minItems" /></label>
        <label>Maximum occurrences <input type="number" min="0" step="1" [(ngModel)]="draft().maxItems" /></label>
      }
      <label><input type="checkbox" [(ngModel)]="draft().hidden" /> Hidden</label>
      <label><input type="checkbox" [(ngModel)]="draft().continuePreviousLine" /> Continue previous line</label>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      <button type="button" (click)="apply()">Apply placement</button>
    </details>
  </section>`,
  styles: [
    `
      :host {
        display: block;
      }
      .element-card {
        background: white;
        border: 1px solid #b7d6db;
        border-radius: 0.5rem;
        padding: 1rem;
      }
      header,
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: space-between;
      }
      header span {
        color: #64748b;
        font-size: 0.8rem;
      }
      button {
        color: #0f7686;
        padding: 0.4rem;
      }
      details {
        margin-top: 0.5rem;
      }
      label {
        display: block;
        margin: 0.5rem 0;
        font-size: 0.8rem;
      }
      input:not([type='checkbox']),
      select {
        display: block;
        border: 1px solid #cbd5e1;
        border-radius: 0.25rem;
        padding: 0.35rem;
        width: 100%;
        box-sizing: border-box;
      }
      p[role='alert'] {
        color: #b91c1c;
      }
    `,
  ],
})
export class ElementCardComponent {
  readonly node = input.required<ElementNode>();
  readonly service = inject(TemplateService);
  readonly draft = signal<Placement>({ status: 'optional', allowMultiple: false });
  readonly error = signal<string | null>(null);
  constructor() {
    effect(() => {
      this.draft.set({ ...this.node().placement });
      this.error.set(null);
    });
  }
  apply(): void {
    this.error.set(this.service.updateElementPlacement(this.node().id, this.draft()));
  }
}
