import { TestBed } from '@angular/core/testing';
import { CedarEmbeddableDesignerElementComponent } from './cedar-embeddable-designer.element';
import { TemplateService } from '../core/services/template.service';
import { TerminologyService } from '../core/services/terminology.service';
import { templateToJson } from '../core/model/cedar-template';
import { CedConfig } from '../ced-public-api';

/**
 * The element's own contract, at unit level.
 *
 * The browser suite covers what a host page sees; this covers the decisions the
 * wrapper makes before anything is rendered — which assignments it accepts, which
 * it ignores, and what it does with one it cannot read. Those are cheaper to pin
 * here, and a failure names the rule rather than the symptom.
 */
describe('CedarEmbeddableDesignerElementComponent', () => {
  let service: TemplateService;
  let terminology: TerminologyService;

  function create() {
    const fixture = TestBed.createComponent(CedarEmbeddableDesignerElementComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
    terminology = TestBed.inject(TerminologyService);
  });

  describe('config', () => {
    it('is off until a host names a terminology server', () => {
      create();

      expect(terminology.configured()).toBe(false);
    });

    it('is applied when a host names one', () => {
      const fixture = create();

      fixture.componentRef.setInput('config', { terminologyBaseUrl: 'https://terminology.example.org/' });

      expect(terminology.configured()).toBe(true);
      expect(terminology.baseUrl()).toBe('https://terminology.example.org/');
    });

    it('takes one assignment and keeps it', () => {
      const fixture = create();

      fixture.componentRef.setInput('config', { terminologyBaseUrl: 'https://first.example.org/' });
      fixture.componentRef.setInput('config', { terminologyBaseUrl: 'https://second.example.org/' });

      /*
       * A host wanting different configuration creates a new element, which is
       * CEE's rule and for its reason: a second assignment that patched some keys
       * and replaced others is a contract no host could reason about.
       */
      expect(terminology.baseUrl()).toBe('https://first.example.org/');
    });

    it('ignores a null assignment rather than treating it as a reset', () => {
      const fixture = create();
      fixture.componentRef.setInput('config', { terminologyBaseUrl: 'https://first.example.org/' });

      fixture.componentRef.setInput('config', null);

      expect(terminology.baseUrl()).toBe('https://first.example.org/');
    });

    /**
     * Every key the contract declares is a key the designer reads.
     *
     * One key today, so this is thin — and it is the guard for the second, which
     * is where a declared option that nothing consumes normally appears.
     */
    it('reads every key its contract declares', () => {
      const config: Required<CedConfig> = { terminologyBaseUrl: 'https://declared.example.org/' };
      const fixture = create();

      fixture.componentRef.setInput('config', config);

      expect(terminology.baseUrl()).toBe(config.terminologyBaseUrl);
    });
  });

  describe('template', () => {
    it('opens a template a host assigns', () => {
      const fixture = create();
      service.templateName.set('Before');
      const source = templateToJson(service.template());
      service.resetTemplate();

      fixture.componentRef.setInput('template', source);

      expect(service.templateName()).toBe('Before');
    });

    it('ignores an empty assignment', () => {
      const fixture = create();
      service.templateName.set('Untouched');

      fixture.componentRef.setInput('template', null);

      expect(service.templateName()).toBe('Untouched');
    });

    it('reports a source it cannot read rather than throwing at the host', () => {
      const fixture = create();
      const reported: unknown[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => reported.push(args[0]);

      try {
        // Assigning a property is the host's own code. An exception there reads as
        // a fault in the host rather than as something the designer said.
        expect(() => fixture.componentRef.setInput('template', 'not a template')).not.toThrow();
      } finally {
        console.error = original;
      }

      expect(String(reported[0])).toContain('could not read the template');
    });
  });

  describe('what it publishes', () => {
    it('offers the current template as a property', () => {
      const fixture = create();

      expect(fixture.componentInstance.currentTemplate).toEqual(templateToJson(service.template()));
    });

    it('publishes a template when the editor changes', async () => {
      const fixture = create();
      const published: object[] = [];
      fixture.componentInstance.templateChange.subscribe((template) => published.push(template));

      service.templateName.set('Published');
      await fixture.whenStable();

      expect(published.length).toBeGreaterThan(0);
      expect((published[published.length - 1] as Record<string, unknown>)['schema:name']).toBe('Published');
    });

    it('publishes CEDAR JSON-LD rather than the editor state', () => {
      const fixture = create();
      const template = fixture.componentInstance.currentTemplate as Record<string, unknown>;

      expect(template['@type']).toBe('https://schema.metadatacenter.org/core/Template');
      expect(template['schema:schemaVersion']).toBe('1.6.0');
    });
  });
});
