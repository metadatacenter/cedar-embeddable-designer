import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-alternate-questions',
  imports: [FormsModule, IconComponent],
  templateUrl: './alternate-questions.component.html',
  styleUrl: './alternate-questions.component.scss',
})
export class AlternateQuestionsComponent {
  readonly field = input.required<Field>();
  readonly question = signal('');
  readonly error = signal<string | null>(null);
  readonly questions = computed(() => this.field().alternateLabels ?? []);
  readonly disabled = computed(() => !!this.field().publishedDefinition);
  private readonly service = inject(TemplateService);
  private owner: number | undefined;

  constructor() {
    effect(() => {
      if (this.owner !== this.field().id) {
        this.owner = this.field().id;
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
      this.error.set('Question cannot be blank.');
      return;
    }
    if (this.questions().some((existing) => existing.trim() === question)) {
      this.error.set('Questions must be unique.');
      return;
    }
    const error = this.service.updateFieldSettings(this.field().id, {
      alternateLabels: [...this.questions(), question],
    });
    this.error.set(error);
    if (!error) this.question.set('');
  }
  remove(index: number): void {
    if (this.disabled()) return;
    this.error.set(
      this.service.updateFieldSettings(this.field().id, {
        alternateLabels: this.questions().filter((_, i) => i !== index),
      }),
    );
  }
}
