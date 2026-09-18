import { TestBed } from '@angular/core/testing';
import { TypesPickerComponent } from './types-picker.component';
import { TemplateService } from '../../core/services/template.service';

it('adds unique IRIs to imported types without fabricating ontology constraints', async () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  const fixture = TestBed.createComponent(TypesPickerComponent);
  const refresh = async () => {
    fixture.componentRef.setInput('container', service.document());
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await refresh();
  const editor = fixture.componentInstance;
  const choose = (iris: string[]) =>
    editor.select(
      new CustomEvent('constraintsSelected', {
        detail: {
          constraints: iris.map((sourceId) => ({
            sourceType: 'ontology-term',
            sourceId,
            sourceName: 'Label',
            ontologyId: 'TEST',
            termType: 'OntologyClass',
          })),
          actions: [],
        },
      }),
    );
  editor.open();
  choose(['urn:one']);
  await refresh();
  editor.open();
  expect(editor.emptySelection).toEqual({ constraints: [], actions: [] });
  choose(['urn:one', 'urn:two']);
  await refresh();
  expect(editor.types()).toEqual(['urn:one', 'urn:two']);
  const saved = service.templateJson();
  editor.open();
  choose(['not an IRI']);
  expect(editor.error()).toBeTruthy();
  expect(service.templateJson()).toEqual(saved);
  editor.close();
  editor.remove('urn:one');
  await refresh();
  expect(editor.types()).toEqual(['urn:two']);
  fixture.componentRef.setInput('disabled', true);
  fixture.detectChanges();
  editor.remove('urn:two');
  expect(service.document().metadata?.instanceTypes).toEqual(['urn:two']);
});
