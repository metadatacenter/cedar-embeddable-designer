import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  untracked,
} from '@angular/core';
import { TemplateService } from '../core/services/template.service';
import { TranslatePipe } from '@ngx-translate/core';
import { CountKeyPipe } from '../i18n/count-key.pipe';
import { countKey } from '../i18n/messages';
import { CedLanguageService } from '../i18n/ced-language.service';
import { CedValidationIssue } from '../ced-public-api';
import { IconComponent } from './components/icon/icon.component';

/** An issue's identity across renders, which a change of language leaves alone. */
const identity = (issue: CedValidationIssue): string =>
  JSON.stringify([issue.source, issue.nodeId, issue.setting, issue.code, issue.location, issue.severity]);

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
  private readonly i18n = inject(CedLanguageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly advisory = computed(() => this.issues().some((issue) => issue.severity === 'warning'));
  readonly issues = computed(() =>
    this.service.validationReport().issues.filter((issue) => this.service.access.readOnly() || issue.shown),
  );

  constructor() {
    /*
     * The summary is announced through the designer's live region when it lists an issue that
     * nothing else announced. An error at a control already has its own alert, and the host's
     * findings have their own announcement, so a summary that spoke for those too would say each
     * error twice. What is left is an issue that arrives with no visible control to say it: a
     * document loaded with defects, a check revealed inside closed settings, or a switch to read
     * only. The check runs after rendering, when each control's alert is in place. While a check
     * runs, the report holds interim issues that say only that it is running, so the summary
     * waits for its outcome and compares that with what it listed before.
     */
    let listed = new Set<string>();
    afterRenderEffect(() => {
      const issues = this.issues();
      if (this.service.validation.checking() || this.service.validationReport().pendingValidation) return;
      const added = issues.filter((issue) => !listed.has(identity(issue)));
      listed = new Set(issues.map(identity));
      if (added.length) untracked(() => this.announceUnsaid(added, issues.length));
    });
  }

  private announceUnsaid(added: CedValidationIssue[], count: number): void {
    const root = this.host.nativeElement.getRootNode() as Document | ShadowRoot;
    const alerts = new Set(
      [...root.querySelectorAll('[role="alert"]')]
        .filter((alert) => alert.checkVisibility())
        .map((alert) => alert.textContent?.trim()),
    );
    if (added.every((issue) => issue.source === 'host' || alerts.has(issue.message.trim()))) return;
    // An action can have announced its result in the same moment, and that message keeps its place.
    this.service.announceAfter(
      this.service.access.readOnly() || this.advisory()
        ? this.i18n.t('validation.inspectionSummary', { count })
        : this.i18n.t(countKey('validation.summary', count), { count }),
    );
  }
}
