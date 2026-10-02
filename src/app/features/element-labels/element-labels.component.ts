import { Component, input } from '@angular/core';
import { ContainerDraft } from '../../core/model/container-draft';
import { AlternateQuestionsComponent } from '../alternate-questions/alternate-questions.component';

@Component({
  selector: 'app-element-labels',
  imports: [AlternateQuestionsComponent],
  template: ` <app-alternate-questions [container]="container()" /> `,
  styles: `
    @use '@org.metadatacenter/cedar-design-tokens/authoring';
    :host {
      display: block;
      margin-top: var(--cedar-space-2);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: var(--cedar-space-1);
      font-size: var(--cedar-font-size);
    }
    input {
      @include authoring.compact-control;
      width: 100%;
    }
  `,
})
export class ElementLabelsComponent {
  readonly container = input.required<ContainerDraft>();
}
