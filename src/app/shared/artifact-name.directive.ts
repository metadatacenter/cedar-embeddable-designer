import { Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { TemplateService } from '../core/services/template.service';

/** Validation-summary navigation targets the name in the header, outside settings. */
@Directive({ selector: 'input[appArtifactName]' })
export class ArtifactNameDirective {
  readonly appArtifactName = input.required<number>();
  private readonly service = inject(TemplateService);
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  constructor() {
    let focused: unknown;
    afterRenderEffect(() => {
      const issue = this.service.validationTarget();
      if (issue && issue !== focused && issue.setting === 'name' && issue.nodeId === this.appArtifactName()) {
        focused = issue;
        this.element.nativeElement.focus({ preventScroll: true });
      }
    });
  }
}
