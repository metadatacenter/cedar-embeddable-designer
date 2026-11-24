import { TestBed } from '@angular/core/testing';
import { CedarEmbeddableDesignerElementComponent } from './cedar-embeddable-designer.element';
import { TemplateService } from '../core/services/template.service';
import { TerminologyService } from '../core/services/terminology.service';
import { templateToJson, JsonSourcePolicy } from '../core/model/cedar-template';
import { CedConfig, CedJsonObject, CedPreferences, CedPreferencesInput } from '../ced-public-api';

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
    service = fixture.debugElement.injector.get(TemplateService);
    terminology = fixture.debugElement.injector.get(TerminologyService);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('isolates documents, configuration and preferences between elements', () => {
    const first = create();
    const second = create();
    const a = first.componentInstance.service;
    const b = second.componentInstance.service;
    a.templateName.set('First');
    b.templateName.set('Second');
    first.componentRef.setInput('config', { terminologyBaseUrl: 'https://first.example/' });
    second.componentRef.setInput('config', { terminologyBaseUrl: 'https://second.example/' });
    a.applyPreset('semantic');
    b.applyPreset('basic');
    expect(a.templateName()).toBe('First');
    expect(b.templateName()).toBe('Second');
    expect(first.debugElement.injector.get(TerminologyService).baseUrl()).toBe('https://first.example/');
    expect(second.debugElement.injector.get(TerminologyService).baseUrl()).toBe('https://second.example/');
    expect(a.getActivePreset()).toBe('semantic');
    expect(b.getActivePreset()).toBe('basic');
  });

  it('judges an artifact a host hands it without loading it', () => {
    const element = create().componentInstance;
    element.newArtifact('template');
    service.templateName.set('Judged');
    const artifact = element.currentArtifact as CedJsonObject;
    const open = JSON.stringify(artifact);
    expect(element.validateArtifact(artifact).canSave).toBe(true);
    // A retained `_ui.pages` is what a host's merged payload can carry and the server refuses.
    const refused = { ...artifact, _ui: { ...(artifact['_ui'] as CedJsonObject), pages: [] } };
    const verdict = element.validateArtifact(refused);
    expect(verdict.canSave).toBe(false);
    expect(verdict.findings.some((finding) => finding.path.startsWith('/_ui/pages'))).toBe(true);
    expect(JSON.stringify(element.currentArtifact)).toBe(open);
  });

  it('lets a host start an element, track edits and explicitly reject an unreadable load', () => {
    const fixture = create();
    const element = fixture.componentInstance;
    element.newArtifact('template');
    expect(service.children()).toHaveLength(0);
    element.newArtifact('element');
    expect((element.currentArtifact as Record<string, unknown>)['@type']).toBe(
      'https://schema.metadatacenter.org/core/TemplateElement',
    );
    expect(element.isDirty).toBe(false);
    service.templateName.set('A new element');
    expect(element.isDirty).toBe(true);
    const saved = element.currentArtifact;
    element.loadArtifact(saved);
    expect(element.isDirty).toBe(false);
    expect(() => element.loadArtifact('not a CEDAR document')).toThrow();
    expect(element.currentArtifact).toEqual(saved);
  });

  /**
   * The event a host's unsaved-changes guard listens to.
   *
   * Reading `isDirty` is not the same check: the event comes from an effect, and an effect scheduled
   * with this component's view ran once and never again, so a host would have heard "clean" and
   * nothing after it. Each transition is driven the way a host drives it, and each must be heard.
   */
  it('announces each change of unsaved state across an edit, a saved adoption and a second edit', async () => {
    const fixture = create();
    const element = fixture.componentInstance;
    const heard: boolean[] = [];
    element.dirtyChange.subscribe((dirty) => heard.push(dirty));
    expect(element.isDirty).toBe(false);

    service.templateName.set('Edited');
    await fixture.whenStable();
    expect(heard.at(-1)).toBe(true);

    element.loadArtifact(element.currentArtifact, { preserveView: true });
    await fixture.whenStable();
    expect(heard.at(-1)).toBe(false);

    service.templateName.set('Edited again');
    await fixture.whenStable();
    expect(heard.at(-1)).toBe(true);
    // Repeated values are harmless; a missing transition is what a host cannot recover from.
    expect(heard.filter((dirty, index) => index === 0 || dirty !== heard[index - 1])).toEqual([true, false, true]);
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
      const config: Required<CedConfig> = {
        terminologyBaseUrl: 'https://declared.example.org/',
        bridgeBaseUrl: 'https://bridge.example.org/',
      };
      const fixture = create();

      fixture.componentRef.setInput('config', config);

      expect(terminology.baseUrl()).toBe(config.terminologyBaseUrl);
      expect(fixture.componentInstance.service.fieldEditorConfig().bridgeBaseUrl).toBe(config.bridgeBaseUrl);
    });
  });

  /**
   * Preferences a host stores between elements.
   *
   * The service decides what counts as a change and how a stored value is read. What is pinned here
   * is the wiring a host depends on: the property reads and replaces the state the designer's
   * controls obey, and the event comes from a root effect, which is the kind that keeps firing.
   */
  describe('preferences', () => {
    it('offers the complete state as a property, in a copy the host may change', () => {
      const element = create().componentInstance;

      const read = element.preferences;
      expect(read).toMatchObject({ showElements: true, fieldSelectionStyle: 'inline', hiddenFieldTypes: [] });
      expect(Object.keys(read.presets)).toEqual(['basic', 'semantic', 'modular']);
      read.showElements = false;
      read.presets.basic.hiddenFieldTypes.push('text');

      expect(element.preferences.showElements).toBe(true);
      expect(element.preferences.presets.basic.hiddenFieldTypes).toEqual(['controlledTerms']);
    });

    it('applies the state a host assigns to what the designer offers', () => {
      const fixture = create();
      const stored: CedPreferencesInput = {
        showRequired: false,
        showElements: false,
        fieldSelectionStyle: 'sidebar',
        hiddenFieldTypes: ['email'],
      };

      fixture.componentRef.setInput('preferences', stored);

      expect(service.preferences()).toMatchObject({
        showRequired: false,
        showElements: false,
        fieldSelectionStyle: 'sidebar',
      });
      expect(service.preferences().visibleFieldTypes['email']).toBe(false);
      expect(service.preferences().visibleFieldTypes['text']).toBe(true);
      expect(fixture.componentInstance.preferences).toMatchObject(stored);
    });

    it('accepts an assignment at any time, and restores the defaults on null', () => {
      const fixture = create();
      const defaults = fixture.componentInstance.preferences;

      fixture.componentRef.setInput('preferences', { showElements: false });
      fixture.componentRef.setInput('preferences', { showRequired: false });
      expect(fixture.componentInstance.preferences).toMatchObject({ showElements: true, showRequired: false });

      fixture.componentRef.setInput('preferences', null);
      expect(fixture.componentInstance.preferences).toEqual(defaults);
    });

    it('reports a value it cannot use rather than throwing at the host', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fixture = create();
      const before = fixture.componentInstance.preferences;

      expect(() => fixture.componentRef.setInput('preferences', 'basic')).not.toThrow();

      expect(fixture.componentInstance.preferences).toEqual(before);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it('announces each change the author makes, and neither its own start nor a host assignment', async () => {
      const fixture = create();
      const element = fixture.componentInstance;
      const heard: CedPreferences[] = [];
      element.preferencesChange.subscribe((preferences) => heard.push(preferences));

      await fixture.whenStable();
      expect(heard).toEqual([]);

      fixture.componentRef.setInput('preferences', { showElements: false });
      await fixture.whenStable();
      expect(heard).toEqual([]);

      service.updatePreference('showRequired', false);
      await fixture.whenStable();
      expect(heard).toHaveLength(1);
      expect(heard[0]).toEqual(element.preferences);
      expect(heard[0]).toMatchObject({ showElements: false, showRequired: false });

      // The preset dialog writes the definitions directly.
      service.presetDefinitions.update((presets) => ({ ...presets, basic: { ...presets.basic, showElements: true } }));
      await fixture.whenStable();
      expect(heard).toHaveLength(2);
      expect(heard[1].presets.basic.showElements).toBe(true);

      service.applyPreset('semantic');
      await fixture.whenStable();
      expect(heard).toHaveLength(3);
      expect(service.getActivePreset()).toBe('semantic');
    });

    it('announces a copy, so a listener cannot change the state the designer holds', async () => {
      const fixture = create();
      const element = fixture.componentInstance;
      let heard = 0;
      element.preferencesChange.subscribe((preferences) => {
        heard += 1;
        preferences.showRequired = true;
        preferences.hiddenFieldTypes.push('text');
      });

      service.updatePreference('showRequired', false);
      await fixture.whenStable();

      expect(heard).toBe(1);
      expect(element.preferences).toMatchObject({ showRequired: false, hiddenFieldTypes: [] });
      // The listener's edit is not a change of the author's, so nothing more is announced.
      await fixture.whenStable();
      expect(heard).toBe(1);
    });

    it('keeps each element to its own preferences and its own announcements', async () => {
      const first = create();
      const second = create();
      const heard: CedPreferences[] = [];
      second.componentInstance.preferencesChange.subscribe((preferences) => heard.push(preferences));

      first.componentInstance.service.updatePreference('showElements', false);
      await first.whenStable();
      await second.whenStable();

      expect(first.componentInstance.preferences.showElements).toBe(false);
      expect(second.componentInstance.preferences.showElements).toBe(true);
      expect(heard).toEqual([]);
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
    it('preserves exact atoms in getters, events, recovery and host reassignment', async () => {
      const fixture = create();
      const element = fixture.componentInstance;
      service.templateName.set('Precise');
      service.addField('number', service.fields().length);
      const field = service.fields().find((item) => item.type === 'number')!;
      service.fields.update((fields) =>
        fields.map((item) =>
          item.id !== field.id
            ? item
            : {
                ...item,
                name: 'Exact',
                numeric: {
                  type: 'xsd:long',
                  min: '9223372036854775806',
                  max: '9223372036854775807',
                  decimalPlaces: null,
                  unit: null,
                },
                defaultValue: { kind: 'number', value: '9223372036854775807' },
              },
        ),
      );
      const expected = JsonSourcePolicy.stringify(element.currentArtifact);
      expect(expected).toContain('9223372036854775806');
      const events: string[] = [];
      element.templateChange.subscribe((artifact) => events.push(JsonSourcePolicy.stringify(artifact)));
      await fixture.whenStable();
      expect(events.at(-1)).toBe(expected);
      const draft = element.captureDraft();
      element.loadArtifact(element.currentArtifact);
      expect(JsonSourcePolicy.stringify(element.currentArtifact)).toBe(expected);
      element.restoreDraft(draft);
      expect(JsonSourcePolicy.stringify(element.currentArtifact)).toBe(expected);
    });

    it('isolates public snapshots and event channels from host mutations', async () => {
      const fixture = create();
      const element = fixture.componentInstance;
      service.templateName.set('Original');
      service.markSaved();
      const expected = structuredClone(element.currentArtifact);
      for (const snapshot of [element.currentArtifact, element.currentTemplate]) {
        const artifact = snapshot as Record<string, unknown>;
        artifact['schema:name'] = 'Host edit';
        (artifact['properties'] as Record<string, unknown>)['Title'] = null;
      }
      expect(element.currentArtifact).toEqual(expected);
      expect(element.isDirty).toBe(false);
      expect(element.canSave).toBe(true);

      const received: object[] = [];
      element.templateChange.subscribe((artifact) => {
        (artifact as Record<string, unknown>)['schema:name'] = 'Listener edit';
      });
      element.artifactChange.subscribe((artifact) => received.push(artifact));
      service.templateName.set('Next');
      await fixture.whenStable();
      expect(received.at(-1)).toMatchObject({ 'schema:name': 'Next' });
      (received.at(-1) as Record<string, unknown>)['schema:name'] = 'Later edit';
      expect(element.currentArtifact).toMatchObject({ 'schema:name': 'Next' });
    });

    /**
     * A loaded document can be editable before it can be written. While it cannot, a host must hear
     * nothing rather than the last artifact that could, which it would otherwise save as current.
     */
    it('publishes nothing while the document cannot be written, and the repaired artifact after', async () => {
      const fixture = create();
      const element = fixture.componentInstance;
      const templates: Record<string, unknown>[] = [];
      const artifacts: object[] = [];
      element.templateChange.subscribe((artifact) => templates.push(artifact as Record<string, unknown>));
      element.artifactChange.subscribe((artifact) => artifacts.push(artifact));
      service.templateName.set('Writable');
      await fixture.whenStable();
      const heard = [templates.length, artifacts.length];
      const title = service.fields()[0].id;
      const lengths = (minLength: number, maxLength: number) =>
        service.fields.update((fields) =>
          fields.map((field) =>
            field.id === title ? { ...field, textConstraints: { minLength, maxLength, regex: null } } : field,
          ),
        );

      lengths(3, 1);
      await fixture.whenStable();
      expect(() => service.templateJson()).toThrow();
      expect(element.canSave).toBe(false);
      expect([templates.length, artifacts.length]).toEqual(heard);

      lengths(1, 3);
      await fixture.whenStable();
      expect(templates.length).toBe(heard[0] + 1);
      expect(artifacts.length).toBe(heard[1] + 1);
      const properties = templates.at(-1)!['properties'] as Record<string, Record<string, unknown>>;
      expect(properties['Title']['_valueConstraints']).toMatchObject({ minLength: 1, maxLength: 3 });
    });

    it('offers the current template as a property', () => {
      const fixture = create();

      expect(fixture.componentInstance.currentTemplate).toEqual(templateToJson(service.template()));
    });

    it('publishes a template when the designer changes', async () => {
      const fixture = create();
      const published: object[] = [];
      fixture.componentInstance.templateChange.subscribe((template) => published.push(template));

      service.templateName.set('Published');
      await fixture.whenStable();

      expect(published.length).toBeGreaterThan(0);
      expect((published[published.length - 1] as Record<string, unknown>)['schema:name']).toBe('Published');
    });

    it('publishes CEDAR JSON-LD rather than the state the designer holds', () => {
      const fixture = create();
      const template = fixture.componentInstance.currentTemplate as Record<string, unknown>;

      expect(template['@type']).toBe('https://schema.metadatacenter.org/core/Template');
      expect(template['schema:schemaVersion']).toBe('1.6.0');
    });
  });
});
