import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { ContainerDraft } from '../../core/model/container-draft';
import { Field } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-alternate-questions',
  imports: [FormsModule, IconComponent, TranslatePipe],
  templateUrl: './alternate-questions.component.html',
  styleUrl: './alternate-questions.component.scss',
})
export class AlternateQuestionsComponent {
  readonly field = input<Field>();
  readonly container = input<ContainerDraft>();
  /**
   * The prefix of this editor's keys: an element has alternate names, a field alternate
   * questions, and each has its own sentences rather than one noun substituted into them.
   */
  readonly keys = computed(() => (this.container() ? 'alternates.names.' : 'alternates.questions.'));
  private readonly i18n = inject(CedLanguageService);
  readonly question = signal('');
  readonly error = signal<string | null>(null);
  readonly questions = computed(() => this.field()?.alternateLabels ?? this.container()?.alternateLabels ?? []);
  readonly disabled = computed(() => !!this.field()?.publishedDefinition);
  private readonly service = inject(TemplateService);
  private owner: number | undefined;

  constructor() {
    effect(() => {
      const owner = this.field()?.id ?? this.container()?.id;
      if (this.owner !== owner) {
        this.owner = owner;
        this.question.set('');
        this.error.set(null);
      }
    });
  }
  edit(value: string): void {
    if (this.disabled()) return;
    this.question.set(value);
    this.error.set(null);
  }
  add(): void {
    if (this.disabled()) return;
    const question = this.question().trim();
    if (!question) {
      this.error.set(this.i18n.t(this.keys() + 'blank'));
      return;
    }
    if (this.questions().some((existing) => existing.trim() === question)) {
      this.error.set(this.i18n.t(this.keys() + 'unique'));
      return;
    }
    const error = this.save([...this.questions(), question]);
    this.error.set(error);
    if (!error) this.question.set('');
  }
  private save(alternateLabels: string[]): string | null {
    const field = this.field();
    if (field) return this.service.updateFieldSettings(field.id, { alternateLabels });
    const container = this.container();
    if (container?.kind === 'element') this.service.updateContainerDefinition(container.id, { alternateLabels });
    return null;
  }
  remove(index: number): void {
    if (this.disabled()) return;
    this.error.set(this.save(this.questions().filter((_, i) => i !== index)));
  }
}
