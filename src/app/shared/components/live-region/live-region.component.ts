import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TemplateService } from '../../../core/services/template.service';

/**
 * The designer's one polite live region, which reads out what `TemplateService.announce` says.
 *
 * It is rendered from the start and kept visually hidden, so a screen reader knows the region
 * before its first message. Errors keep their own alerts beside the control they concern. The
 * validation summary speaks here only for an issue none of those alerts announced.
 */
@Component({
  selector: 'app-live-region',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="live-region" role="status" aria-live="polite" aria-atomic="true">
    {{ service.announcement() }}
  </p>`,
  styles: `
    @use '@org.metadatacenter/cedar-design-tokens/patterns';
    .live-region {
      @include patterns.visually-hidden;
    }
  `,
})
export class LiveRegionComponent {
  readonly service = inject(TemplateService);
}
