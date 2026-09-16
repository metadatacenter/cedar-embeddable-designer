import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContainerDraft } from '../../core/model/container-draft';
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
  readonly field = input<Field>();
  readonly container = input<ContainerDraft>();
  readonly noun = computed(() => (this.container() ? 'name' : 'question'));
  readonly heading = computed(() => (this.container() ? 'Alternate names' : 'Alternate questions'));
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
      this.error.set(this.container() ? 'Name cannot be blank.' : 'Question cannot be blank.');
      return;
    }
    if (this.questions().some((existing) => existing.trim() === question)) {
      this.error.set(this.container() ? 'Names must be unique.' : 'Questions must be unique.');
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
