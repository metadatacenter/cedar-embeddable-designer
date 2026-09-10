import { Component, input, inject } from '@angular/core';
import { ContainerDraft, ChildNode, childName } from '../../core/model/container-draft';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-container-outline',
  template: `<ul>
    @for (node of container().children; track node.id) {
      <li>
        <button type="button" (click)="select(node)">
          {{ node.kind === 'element' ? '▸ ' : '' }}{{ childName(node) }}
        </button>
        @if (node.kind === 'element') {
          <app-container-outline [container]="node.definition" />
        }
      </li>
    }
  </ul>`,
  styles: [
    `
      ul {
        list-style: none;
        margin: 0;
        padding: 0 0 0 0.5rem;
      }
      button {
        text-align: left;
        padding: 0.4rem;
        width: 100%;
        overflow-wrap: anywhere;
        color: #0f7686;
      }
    `,
  ],
})
export class ContainerOutlineComponent {
  readonly container = input.required<ContainerDraft>();
  readonly service = inject(TemplateService);
  readonly childName = childName;
  select(node: ChildNode): void {
    this.service.openContainer(node.kind === 'element' ? node.id : this.container().id);
    if (node.kind === 'field') {
      this.service.selectedField.set(node.id);
      this.service.scrollRequest.set(node.id);
    }
  }
}
