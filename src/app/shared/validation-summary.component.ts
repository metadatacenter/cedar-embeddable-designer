import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TemplateService } from '../core/services/template.service';
import { IconComponent } from './components/icon/icon.component';

/** The same revealed-error summary for template, element and standalone field authoring. */
@Component({
  selector: 'app-validation-summary',
  imports: [IconComponent],
  templateUrl: './validation-summary.component.html',
  styleUrl: './validation-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValidationSummaryComponent {
  readonly service = inject(TemplateService);
}
