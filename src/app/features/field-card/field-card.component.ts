import { publicationStatusLabel } from '../../shared/publication-status';
import { FieldSettingsComponent } from '../field-settings/field-settings.component';
import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService, FIELD_TYPES } from '../../core/services/template.service';
import { Field } from '../../core/models/types';
import {
  fieldArtifactMetadata,
  choiceDefaultConflict,
  accepts,
  allowsDefault,
  allowsMultiple,
  allowsOptions,
  allowsStatus,
  contentKindOf,
} from '../../core/model/cedar-template';
import { FieldDefaultValueComponent } from '../field-default-value/field-default-value.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ControlledTermConfigComponent } from '../controlled-term-config/controlled-term-config.component';

@Component({
  selector: 'app-field-card',
  standalone: true,
  imports: [
    CommonModule,
    FieldSettingsComponent,
    FormsModule,
    IconComponent,
    ControlledTermConfigComponent,
    DragDropModule,
    FieldDefaultValueComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-card.component.html',
  styleUrls: ['../../shared/_field-error.scss', './field-card.component.scss'],
})
export class FieldCardComponent {
  get identityLabel(): string {
    const metadata = fieldArtifactMetadata(this.field);
    return [metadata.version, publicationStatusLabel(metadata.publicationStatus)].filter(Boolean).join(' · ');
  }
  @Input() field!: Field;
  @Input() standalone = false;

  readonly service = inject(TemplateService);

  get FIELD_TYPES_LIST() {
    return Object.fromEntries(Object.entries(FIELD_TYPES).filter(([key]) => this.service.canAddField(key)));
  }

  /*
   * What a type will actually accept, asked of the same table that builds it.
   * A control offered for a setting the artifact cannot carry is a control that
   * lies: a page break has no required value, and a radio's cardinality is
   * decided by its type rather than by its author.
   */
  fieldArtifactMetadata = fieldArtifactMetadata;
  choiceDefaultConflict = choiceDefaultConflict;
  allowsDefault = allowsDefault;

  allowsStatus(type: string): boolean {
    return allowsStatus(type);
  }

  allowsMultiple(type: string): boolean {
    return allowsMultiple(type);
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

  /** The label for a static field's one value, or nothing for a type without one. */
  contentLabel(type: string): string | null {
    switch (contentKindOf(type)) {
      case 'markup':
        return 'Content';
      case 'url':
        return 'Image URL';
      case 'videoId':
        return 'YouTube video ID';
      default:
        return null;
    }
  }

  getFieldIcon(field: Field): string {
    return field.type;
  }

  getFieldTypeName(field: Field): string {
    if (field.temporal?.type === 'xsd:dateTime') return 'Date and time';
    return FIELD_TYPES[field.type]?.label || field.type;
  }
}
