import { Component, input, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ElementNode, Placement, findContainer } from '../../core/model/container-draft';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-element-card',
  imports: [FormsModule],
  template: `<section aria-label="Element" class="element-card">
    <details>
      <summary>Element settings</summary>
      <label>Property name <input [(ngModel)]="draft().deploymentName" (ngModelChange)="apply()" /></label>
      <label>Display label <input [(ngModel)]="draft().displayLabel" (ngModelChange)="apply()" /></label>
      <label>Display description <input [(ngModel)]="draft().displayDescription" (ngModelChange)="apply()" /></label>
      <label>Property IRI <input [(ngModel)]="draft().propertyIri" (ngModelChange)="apply()" /></label>
      <label
        >Status
        <select [(ngModel)]="draft().status" (ngModelChange)="apply()">
          <option value="optional">Optional</option>
          <option value="required">Required</option>
          <option value="recommended">Recommended</option>
        </select></label
      >
      <label class="check"
        ><input type="checkbox" [(ngModel)]="draft().allowMultiple" (ngModelChange)="apply()" /> Allow multiple</label
      >
      @if (draft().allowMultiple) {
        <label
          >Minimum occurrences
          <input type="number" min="0" step="1" [(ngModel)]="draft().minItems" (ngModelChange)="apply()"
        /></label>
        <label
          >Maximum occurrences
          <input type="number" min="0" step="1" [(ngModel)]="draft().maxItems" (ngModelChange)="apply()"
        /></label>
      }
      <label class="check"
        ><input type="checkbox" [(ngModel)]="draft().hidden" (ngModelChange)="apply()" /> Hidden</label
      >
      <label class="check"
        ><input type="checkbox" [(ngModel)]="draft().continuePreviousLine" (ngModelChange)="apply()" /> Continue
        previous line</label
      >
      <label
        >Move element to
        <select
          aria-label="Move element to container"
          [ngModel]="service.parentContainerId(node().id)"
          (ngModelChange)="service.moveChild(node().id, +$event)"
        >
          @for (destination of destinations(); track destination.id) {
            <option [value]="destination.id">{{ destination.name }}</option>
          }
        </select>
      </label>
      <div class="actions">
        <button type="button" (click)="service.duplicateElement(node().id)">Duplicate Element</button>
        <button type="button" (click)="service.deleteChild(node().id)">Remove Element</button>
      </div>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </details>
  </section>`,
  styles: [
    `
      :host {
        display: block;
      }
      .element-card {
        color: #334155;
        background: #f4f6f6;
        border: 0;
        border-radius: 0.5rem;
        padding: 4px 8px;
      }
      header,
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: space-between;
        align-items: center;
      }
      p {
        margin: 4px 0;
      }
      .actions {
        justify-content: flex-start;
        margin-top: 4px;
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
        margin-top: 0;
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
      .check {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .check input {
        margin: 0;
        width: 14px;
        height: 14px;
        flex: none;
      }
      .actions button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 30px;
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
  private loadedPlacement = '';
  constructor() {
    effect(() => {
      // Editing an inline descendant must not reset incomplete placement input.
      const signature = JSON.stringify([this.node().id, this.node().placement]);
      if (signature === this.loadedPlacement) return;
      this.loadedPlacement = signature;
      this.draft.set({ ...this.node().placement });
      this.error.set(null);
    });
  }
  destinations() {
    return this.service.containerChoices().filter((choice) => !findContainer(this.node().definition, choice.id));
  }
  apply(): void {
    this.error.set(this.service.updateElementPlacement(this.node().id, this.draft()));
  }
}
