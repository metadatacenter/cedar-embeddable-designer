import { Component, Input, inject, signal, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../core/services/template.service';
import { Field, ControlledTermConfig as TermConfig } from '../../core/models/types';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-controlled-term-config',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './controlled-term-config.component.html',
})
export class ControlledTermConfigComponent {
  readonly service = inject(TemplateService);

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
