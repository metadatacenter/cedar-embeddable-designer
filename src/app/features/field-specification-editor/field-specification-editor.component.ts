import { Component, Input, OnChanges, Output, EventEmitter, effect, inject } from '@angular/core';
import { Field } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { FieldCardComponent } from '../field-card/field-card.component';
@Component({
  selector: 'app-field-specification-editor',
  imports: [FieldCardComponent],
  providers: [TemplateService, PreferencesService],
  template: `@for (field of service.fields(); track field.id) {
    <app-field-card [field]="field" [standalone]="true"></app-field-card>
  }`,
})
export class FieldSpecificationEditorComponent implements OnChanges {
  @Input({ required: true }) field!: Field;
  @Output() fieldChange = new EventEmitter<Field>();
  readonly service = inject(TemplateService);
  private readonly parent = inject(TemplateService, { skipSelf: true });
  constructor() {
    this.service.preferences.update((p) => ({
      ...p,
      showHelpText: true,
      showDefaultValue: true,
      showRequired: true,
      showAllowMultiple: true,
    }));
    effect(() => {
      const field = this.service.fields()[0];
      if (field && this.field) this.fieldChange.emit(structuredClone(field));
    });
    effect(() => this.service.fieldEditorConfig.set(this.parent.fieldEditorConfig()));
  }
  ngOnChanges() {
    this.service.fields.set([structuredClone(this.field)]);
  }
}
