import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContainerDraft } from '../../core/model/container-draft';
import { TemplateService } from '../../core/services/template.service';
import { AlternateQuestionsComponent } from '../alternate-questions/alternate-questions.component';

@Component({
  selector: 'app-element-labels',
  imports: [FormsModule, AlternateQuestionsComponent],
  template: `
    <label
      >Preferred name
      <input [ngModel]="container().preferredLabel ?? ''" (ngModelChange)="change($event)" />
    </label>
    <app-alternate-questions [container]="container()" />
  `,
  styles: `
    @use '../../shared/control-style';
    :host {
      display: block;
      margin-top: 8px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: var(--cedar-font-size-small);
    }
    input {
      @include control-style.compact-control;
      width: 100%;
    }
  `,
})
export class ElementLabelsComponent {
  readonly container = input.required<ContainerDraft>();
  private readonly service = inject(TemplateService);
  change(value: string): void {
    if (this.container().kind !== 'element') return;
    this.service.updateContainerDefinition(this.container().id, { preferredLabel: value || null });
  }
}
