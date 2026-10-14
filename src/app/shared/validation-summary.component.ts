import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TemplateService } from '../core/services/template.service';
import { TranslatePipe } from '@ngx-translate/core';
import { CountKeyPipe } from '../i18n/count-key.pipe';
import { IconComponent } from './components/icon/icon.component';

/** Authoring errors and read-only inspection share one navigable report. */
@Component({
  selector: 'app-validation-summary',
  imports: [IconComponent, CountKeyPipe, TranslatePipe],
  templateUrl: './validation-summary.component.html',
  styleUrl: './validation-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValidationSummaryComponent {
  readonly service = inject(TemplateService);
  readonly issues = computed(() =>
    this.service.access.readOnly() ? this.service.validationReport().issues : this.service.visibleIssues(),
  );
}
