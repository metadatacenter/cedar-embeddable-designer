import { fieldDisplayName } from '../../core/model/field-display-name';
import { ArtifactNameDirective } from '../../shared/artifact-name.directive';
import { FieldSummaryComponent } from '../field-summary/field-summary.component';
import { HeaderToggleDirective } from '../../shared/header-toggle.directive';
import { FieldSettingsComponent } from '../field-settings/field-settings.component';
import { Component, Input, inject, ChangeDetectionStrategy, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CountKeyPipe } from '../../i18n/count-key.pipe';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService, FIELD_TYPES } from '../../core/services/template.service';
import { Field } from '../../core/models/types';
import {
  choiceDefaultConflict,
  accepts,
  allowsDefault,
  allowsOptions,
  allowsStatus,
  contentKindOf,
} from '../../core/model/cedar-template';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ControlledTermConfigComponent } from '../controlled-term-config/controlled-term-config.component';

@Component({
  selector: 'app-field-card',
  standalone: true,
  imports: [
    ArtifactNameDirective,
    FieldSummaryComponent,
    HeaderToggleDirective,
    FieldSettingsComponent,
    FormsModule,
    IconComponent,
    ControlledTermConfigComponent,
    DragDropModule,
    CountKeyPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-card.component.html',
  styleUrls: ['../../shared/_field-error.scss', './field-card.component.scss'],
})
export class FieldCardComponent {
  private readonly settings = viewChild(FieldSettingsComponent);
  toggleSettings(): void {
    const settings = this.settings();
    settings?.toggleExpanded();
  }

  get occurrenceRange(): string {
    if (!this.field.allowMultiple || allowsOptions(this.field.type)) return '';
    return `(${this.field.minItems ?? 0} .. ${this.field.maxItems ?? '∞'})`;
  }

  @Input() field!: Field;
  @Input() standalone = false;

  readonly service = inject(TemplateService);

  readonly FIELD_TYPES_LIST = FIELD_TYPES;

  /** The name the header shows: the parent's display name, or the field's own where it has no parent. */
  get shownName(): string {
    return this.service.fieldDocumentMode() ? this.field.name : fieldDisplayName(this.field);
  }

  /**
   * Whether the field is published and its parent can still configure it, which is then all that
   * can change. A field designed on its own has no parent, and a read-only document configures nothing.
   */
  get configurationOnly(): boolean {
    return !!this.field.publishedDefinition && !this.standalone && this.service.validation.canPlace(this.field.id);
  }

  /** A field designed on its own has no placement, so its header edits its definition. */
  get headerLocked(): boolean {
    return this.service.fieldDocumentMode()
      ? this.service.definitionLocked(this.field.id) || !!this.field.publishedDefinition
      : this.service.placementLocked(this.field.id);
  }

  updateDisplayName(value: string): void {
    this.service.updateFieldDisplayName(this.field.id, value);
  }

  /*
   * What a type will actually accept, asked of the same table that builds it.
   * A control offered for a setting the artifact cannot carry is a control that
   * lies: a page break has no required value, and a radio's cardinality is
   * decided by its type rather than by its author.
   */
  choiceDefaultConflict = choiceDefaultConflict;
  allowsDefault = allowsDefault;

  allowsStatus(type: string): boolean {
    return allowsStatus(type);
  }

  allowsOptions(type: string): boolean {
    return allowsOptions(type);
  }

  /** Whether the type's values are drawn from a vocabulary, so the card offers the panel. */
  allowsControlledTerms(type: string): boolean {
    return accepts(type, 'controlledTermConstraints');
  }

  /** Whether the type's one static value is markup, which takes more than a single line. */
  hasMarkupContent(type: string): boolean {
    return contentKindOf(type) === 'markup';
  }

  /** The translation key of the label for a static field's one value, or nothing for a type without one. */
  contentLabel(type: string): string | null {
    switch (contentKindOf(type)) {
      case 'markup':
        return 'fieldCard.content.markup';
      case 'url':
        return 'fieldCard.content.url';
      case 'videoId':
        return 'fieldCard.content.videoId';
      default:
        return null;
    }
  }

  getFieldIcon(field: Field): string {
    return field.type;
  }

  /** The translation key of the field's type name, or the raw type where the palette has none. */
  getFieldTypeName(field: Field): string {
    if (field.temporal?.type === 'xsd:dateTime') return 'fieldTypes.dateTime.label';
    return FIELD_TYPES[field.type]?.labelKey || field.type;
  }
}
