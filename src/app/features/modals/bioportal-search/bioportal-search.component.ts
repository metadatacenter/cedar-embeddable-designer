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
import { TerminologyHit, TerminologyService } from '../../../core/services/terminology.service';
import { ControlledTermConfig } from '../../../core/models/types';
import { IconComponent } from '../../../shared/components/icon/icon.component';

export type BioPortalResult = TerminologyHit;

@Component({
  selector: 'app-bioportal-search-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bioportal-search.component.html',
})
export class BioPortalSearchModalComponent implements OnInit, OnDestroy {
  readonly service = inject(TemplateService);
  private readonly terminology = inject(TerminologyService);

  /** Whether a terminology server has been named, for the panel to say so. */
  readonly searchConfigured = this.terminology.configured;

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
    if (!this.searchQuery.trim()) {
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

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const scope = this.searchMode === 'value-set' ? 'value_sets' : 'classes,values';
      const sources = this.searchMode === 'term' ? this.selectedOntologies : [];
      const hits = await this.terminology.search(this.searchQuery, scope, sources);

      this.results.set(hits);
      if (hits.length === 0) {
        this.errorMessage.set('No results found. Try a different search term.');
      }
    } catch (error: unknown) {
      /*
       * A failure is reported as a failure. This used to fall back to hard-coded
       * results carrying real-looking SNOMEDCT and DOID identifiers, and to a term
       * invented at `http://example.org/term/<query>` for anything it had no canned
       * answer to — all of them selectable, and what an author selected went into
       * the template.
       */
      this.results.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'The controlled-term search failed.');
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
}
