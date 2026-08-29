import { Component, CUSTOM_ELEMENTS_SCHEMA, Input, inject, signal, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../core/services/template.service';
import { Field, ControlledTermConfig as TermConfig } from '../../core/models/types';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { TerminologyService } from '../../core/services/terminology.service';
import { PickedConstraint, termPickerAvailable, toControlledTermConfig } from '../../core/model/term-picker';

@Component({
  selector: 'app-controlled-term-config',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './controlled-term-config.component.html',
  /*
   * `<cedar-term-picker>` is a sibling web component the host page loads, not a
   * dependency this bundle carries, so Angular is told the tag is legitimate
   * rather than given a component to match it against.
   */
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControlledTermConfigComponent {
  readonly service = inject(TemplateService);
  private readonly terminology = inject(TerminologyService);

  /** The terminology server the picker should ask, or null if a host named none. */
  readonly terminologyBaseUrl = this.terminology.baseUrl;

  /**
   * Whether the picker can be offered.
   *
   * Read once, when the panel is built. A host loads the picker's script before
   * or alongside the designer's; one that has not is not going to have done so by
   * the time an author opens a field.
   */
  readonly pickerAvailable = termPickerAvailable();

  readonly pickerOpen = signal(false);

  openPicker(): void {
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  /**
   * The author chose a constraint, so the field takes it.
   *
   * Everything the four source types need arrives in the one event, which is the
   * difference the picker makes: the acronym, the IRI and the label used to be
   * three things an author typed from memory into free-text boxes, and nothing
   * checked any of them.
   */
  applyPicked(event: Event): void {
    const picked = (event as CustomEvent<PickedConstraint>).detail;
    this.service.updateControlledTermConfig(this.field.id, toControlledTermConfig(picked));
    this.pickerOpen.set(false);
  }

  @Input() field!: Field;

  readonly isExpanded = signal(false);
  readonly showPreview = signal(false);

  readonly sourceTypes = [
    {
      id: 'ontology-term' as const,
      label: 'Search for a Term',
      description: 'Users search BioPortal for specific terms',
      icon: 'star',
      color: '#0D9488',
      example: 'e.g., "cardiac arrest", "melanoma"',
      searchLabel: "Search for a term in BioPortal (e.g. 'microarray analysis')",
    },
    {
      id: 'ontology' as const,
      label: 'Search for an Ontology',
      description: 'Users select entire ontologies to explore',
      icon: 'library',
      color: '#7C3AED',
      example: 'e.g., NCIT, SNOMED CT, Disease Ontology',
      searchLabel: 'Search for an ontology in BioPortal (e.g. OBI) and explore it',
    },
    {
      id: 'value-set' as const,
      label: 'Search for a Value Set',
      description: 'Users select from predefined collections',
      icon: 'list',
      color: '#DC2626',
      example: "e.g., 'Delivery Procedures'",
      searchLabel: "Search for a value set in BioPortal (e.g. 'Delivery Procedures') and explore it",
    },
    {
      id: 'ontology-branch' as const,
      label: 'Ontology Branch',
      description: 'Restrict to subtree of an ontology',
      icon: 'beaker',
      color: '#059669',
      example: 'e.g., All types of "Carcinoma"',
      searchLabel: 'Search within a specific branch of an ontology',
    },
  ];

  get config(): TermConfig {
    return (
      this.field.controlledTermConfig || {
        sourceType: 'ontology-term',
        sourceId: '',
        sourceName: '',
        ontologyId: '',
        ontologyName: '',
        allowMultipleOntologies: false,
        searchDepth: 1,
        restrictedOntologies: [],
      }
    );
  }

  get currentSourceType() {
    return this.sourceTypes.find((t) => t.id === this.config.sourceType) || this.sourceTypes[0];
  }

  updateConfig(updates: Partial<TermConfig>) {
    const updatedConfig = {
      ...this.config,
      ...updates,
    };
    this.service.updateControlledTermConfig(this.field.id, updatedConfig);
  }

  updateSourceType(type: 'ontology-term' | 'ontology' | 'value-set' | 'ontology-branch') {
    this.updateConfig({ sourceType: type });
  }

  updateRestrictedOntologies(value: string) {
    const list = value
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    this.updateConfig({ restrictedOntologies: list });
  }
}
