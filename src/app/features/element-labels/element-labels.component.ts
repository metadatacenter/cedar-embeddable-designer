import { Component, input } from '@angular/core';
import { ContainerDraft } from '../../core/model/container-draft';
import { AlternateQuestionsComponent } from '../alternate-questions/alternate-questions.component';

@Component({
  selector: 'app-element-labels',
  imports: [AlternateQuestionsComponent],
  template: ` <app-alternate-questions [container]="container()" /> `,
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
      font-size: var(--cedar-font-size);
    }
    input {
      @include control-style.compact-control;
      width: 100%;
    }
  `,
})
export class ElementLabelsComponent {
  readonly container = input.required<ContainerDraft>();
}
