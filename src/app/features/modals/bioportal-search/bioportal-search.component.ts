import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TemplateService } from '../../../core/services/template.service';
import { ControlledTermConfig } from '../../../core/models/types';
import { IconComponent } from '../../../shared/components/icon/icon.component';

export interface BioPortalResult {
  '@id': string;
  prefLabel: string;
  definition?: string[];
  '@type'?: string;
  links?: {
    ontology?: string;
  };
  ontologyAcronym?: string;
  ontologyName?: string;
}

@Component({
  selector: 'app-bioportal-search-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './bioportal-search.component.html',
})
export class BioPortalSearchModalComponent implements OnInit, OnDestroy {
  readonly service = inject(TemplateService);

  @Input() isOpen = false;
  @Input() fieldName = '';
  @Input() config?: ControlledTermConfig;

  @Output() cancelled = new EventEmitter<void>();
  @Output() selected = new EventEmitter<BioPortalResult>();

  searchQuery = '';
  searchMode: 'term' | 'ontology' | 'value-set' = 'term';
  readonly showAdvanced = signal(false);
  selectedOntologies: string[] = [];
  ontologyInput = '';

  readonly results = signal<BioPortalResult[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  isDemoResults = false;

  private searchSubject = new Subject<string>();
  private sub?: Subscription;

  ngOnInit() {
    // Sync initial configuration
    if (this.config) {
      this.selectedOntologies = this.config.restrictedOntologies || [];
      if (this.config.sourceType === 'ontology') {
        this.searchMode = 'ontology';
      } else if (this.config.sourceType === 'value-set') {
        this.searchMode = 'value-set';
      } else {
        this.searchMode = 'term';
      }
    }

    // Set up debounced search
    this.sub = this.searchSubject.pipe(debounceTime(800), distinctUntilChanged()).subscribe(() => {
      this.performSearch();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  onQueryChange(value: string) {
    this.searchQuery = value;
    if (!this.searchQuery.trim() || !this.service.bioportalApiKey()) {
      this.results.set([]);
      this.errorMessage.set(null);
      return;
    }
    this.searchSubject.next(value);
  }

  handleSearchSubmit(e: Event) {
    e.preventDefault();
    this.performSearch();
  }

  async performSearch() {
    if (!this.searchQuery.trim()) {
      this.results.set([]);
      return;
    }

    const apiKey = this.service.bioportalApiKey();
    if (!apiKey) {
      this.errorMessage.set('Please configure your BioPortal API key in the user menu');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.isDemoResults = false;

    try {
      const scope = this.searchMode === 'value-set' ? 'value_sets' : 'classes,values';
      let url = `https://terminology.metadatacenter.org/bioportal/search?q=${encodeURIComponent(this.searchQuery)}&scope=${scope}&page=1&page_size=50`;

      if (this.searchMode === 'term' && this.selectedOntologies.length > 0) {
        url += `&ontologies=${this.selectedOntologies.join(',')}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `apikey token=${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your BioPortal API key in settings.');
        }
        if (response.status === 403) {
          throw new Error('Access forbidden. Please verify your API key has the correct permissions.');
        }
        const errorText = await response.text();
        throw new Error(`Search failed (${response.status}): ${errorText || response.statusText}`);
      }

      const data = await response.json();
      const resultsArray = data.collection || [];
      this.results.set(resultsArray);

      if (resultsArray.length === 0) {
        this.errorMessage.set('No results found. Try a different search term.');
      }
    } catch (err) {
      console.error('Search error:', err);
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        const mock = this.getMockResults(this.searchQuery);
        if (mock.length > 0) {
          this.results.set(mock);
          this.isDemoResults = true;
          this.errorMessage.set(
            'Note: Showing demo results. Live BioPortal search blocked by CORS restrictions in published environments. The search will work when using a proper backend proxy.',
          );
        } else {
          this.errorMessage.set(
            'Network error: Unable to connect to BioPortal due to CORS restrictions. Try testing locally or use a backend proxy.',
          );
        }
      } else {
        this.errorMessage.set(err instanceof Error ? err.message : 'Failed to search BioPortal');
      }
    } finally {
      this.loading.set(false);
    }
  }

  addOntology() {
    const term = this.ontologyInput.trim().toUpperCase();
    if (term && !this.selectedOntologies.includes(term)) {
      this.selectedOntologies = [...this.selectedOntologies, term];
      this.ontologyInput = '';
      this.performSearch();
    }
  }

  removeOntology(ontology: string) {
    this.selectedOntologies = this.selectedOntologies.filter((o) => o !== ontology);
    this.performSearch();
  }

  private getMockResults(query: string): BioPortalResult[] {
    const lowerQuery = query.toLowerCase();
    const mockData: Record<string, BioPortalResult[]> = {
      cardiac: [
        {
          '@id': 'http://purl.bioontology.org/ontology/SNOMEDCT/410429000',
          prefLabel: 'Cardiac arrest',
          definition: ['Sudden cessation of cardiac output and effective circulation'],
          '@type': 'Class',
          ontologyAcronym: 'SNOMEDCT',
          ontologyName: 'SNOMED CT',
        },
        {
          '@id': 'http://purl.bioontology.org/ontology/SNOMEDCT/80891009',
          prefLabel: 'Heart disease',
          definition: ['Pathological process involving the heart'],
          '@type': 'Class',
          ontologyAcronym: 'SNOMEDCT',
          ontologyName: 'SNOMED CT',
        },
      ],
      diabetes: [
        {
          '@id': 'http://purl.bioontology.org/ontology/SNOMEDCT/73211009',
          prefLabel: 'Diabetes mellitus',
          definition: ['A metabolic disorder characterized by abnormally high blood sugar levels'],
          '@type': 'Class',
          ontologyAcronym: 'SNOMEDCT',
          ontologyName: 'SNOMED CT',
        },
      ],
      cancer: [
        {
          '@id': 'http://purl.obolibrary.org/obo/DOID_162',
          prefLabel: 'Cancer',
          definition: ['A disease of cellular proliferation that is malignant'],
          '@type': 'Class',
          ontologyAcronym: 'DOID',
          ontologyName: 'Human Disease Ontology',
        },
      ],
    };

    for (const [key, val] of Object.entries(mockData)) {
      if (lowerQuery.includes(key)) {
        return val;
      }
    }

    return [
      {
        '@id': `http://example.org/term/${encodeURIComponent(query)}`,
        prefLabel: query.charAt(0).toUpperCase() + query.slice(1),
        definition: [`Demo result for: ${query}`],
        '@type': 'Class',
        ontologyAcronym: 'DEMO',
        ontologyName: 'Demo Ontology',
      },
    ];
  }
}
