import { TestBed } from '@angular/core/testing';
import { CedarEmbeddableDesignerElementComponent } from '../../element/cedar-embeddable-designer.element';
import { CedarEmbeddableFieldDesignerElementComponent } from '../../element/cedar-embeddable-field-designer.element';
import { TerminologyService } from './terminology.service';

for (const Component of [CedarEmbeddableDesignerElementComponent, CedarEmbeddableFieldDesignerElementComponent]) {
  describe(Component.name, () => {
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({});
    });
    for (const ending of ['', '/']) {
      it(`passes the same normalized bases to its service and CEF (${ending || 'no slash'})`, () => {
        const fixture = TestBed.createComponent<
          CedarEmbeddableDesignerElementComponent | CedarEmbeddableFieldDesignerElementComponent
        >(Component);
        fixture.componentRef.setInput('config', {
          terminologyBaseUrl: `https://terms.example${ending}`,
          bridgeBaseUrl: `https://bridge.example${ending}`,
        });
        const terminology = fixture.debugElement.injector.get(TerminologyService);
        expect(terminology.baseUrl()).toBe('https://terms.example/');
        expect(fixture.componentInstance.service.fieldEditorConfig()).toEqual({
          terminologyBaseUrl: 'https://terms.example/',
          bridgeBaseUrl: 'https://bridge.example/',
        });
      });
    }
    for (const bad of [42, false, {}, [], null]) {
      it(`ignores invalid base ${JSON.stringify(bad)} without losing valid siblings`, () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fixture = TestBed.createComponent<
          CedarEmbeddableDesignerElementComponent | CedarEmbeddableFieldDesignerElementComponent
        >(Component);
        fixture.componentRef.setInput('config', { terminologyBaseUrl: bad, bridgeBaseUrl: 'https://bridge.example' });
        expect(fixture.debugElement.injector.get(TerminologyService).configured()).toBe(false);
        expect(fixture.componentInstance.service.fieldEditorConfig()).toEqual({
          bridgeBaseUrl: 'https://bridge.example/',
        });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
      });
    }
    it('does not consume its first assignment on malformed config, warns on unknown keys and remains set-once', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fixture = TestBed.createComponent<
        CedarEmbeddableDesignerElementComponent | CedarEmbeddableFieldDesignerElementComponent
      >(Component);
      fixture.componentRef.setInput('config', 42);
      fixture.componentRef.setInput('config', { typo: true, terminologyBaseUrl: ' https://terms.example ' });
      fixture.componentRef.setInput('config', { terminologyBaseUrl: 'https://ignored.example/' });
      expect(fixture.debugElement.injector.get(TerminologyService).baseUrl()).toBe('https://terms.example/');
      expect(fixture.componentInstance.service.fieldEditorConfig()).toEqual({
        terminologyBaseUrl: 'https://terms.example/',
      });
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });
    it('accepts empty config without inventing production endpoints', () => {
      const fixture = TestBed.createComponent<
        CedarEmbeddableDesignerElementComponent | CedarEmbeddableFieldDesignerElementComponent
      >(Component);
      fixture.componentRef.setInput('config', { terminologyBaseUrl: '', bridgeBaseUrl: undefined });
      expect(fixture.componentInstance.service.fieldEditorConfig()).toEqual({});
      expect(fixture.debugElement.injector.get(TerminologyService).configured()).toBe(false);
    });
  });
}
