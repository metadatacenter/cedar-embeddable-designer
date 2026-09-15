import { buildContainer, readContainer, templateToJson } from '../../core/model/cedar-template';
import { TestBed } from '@angular/core/testing';
import { AnnotationsEditorComponent } from './annotations-editor.component';
import { TemplateService } from '../../core/services/template.service';

for (const kind of ['field', 'template', 'element'] as const) {
  describe(`${kind} annotations`, () => {
    it('keeps incomplete rows local, rejects duplicate names and invalid IRIs, and saves removals', async () => {
      localStorage.clear();
      const service = TestBed.inject(TemplateService);
      service.templateName.set('Study');
      const fixture = TestBed.createComponent(AnnotationsEditorComponent);
      if (kind === 'element') service.addElement(service.document().id);
      const element = service.document().children.find((node) => node.kind === 'element');
      const container = kind === 'element' && element?.kind === 'element' ? element.definition : service.document();
      const owner = kind === 'field' ? service.fields()[0] : container;
      fixture.componentRef.setInput(kind === 'field' ? 'field' : 'container', owner);
      fixture.detectChanges();
      await fixture.whenStable();
      const editor = fixture.componentInstance;
      const before = service.templateJson();
      editor.add();
      expect(editor.addError()).toContain('name');
      expect(editor.rows()).toHaveLength(0);
      expect(service.validationReport().canSave).toBe(true);
      expect(service.templateJson()).toEqual(before);
      editor.editDraft({ name: 'note', value: 'Reviewed' });
      expect(editor.addError()).toBeNull();
      editor.add();
      expect(editor.error()).toBeNull();
      expect(service.validationReport().canSave).toBe(true);
      const saved = service.templateJson();
      editor.editDraft({ name: 'note', value: 'duplicate' });
      expect(editor.addError()).toBeNull();
      editor.add();
      expect(editor.addError()).toContain('unique');
      expect(service.templateJson()).toEqual(saved);
      editor.editDraft({ name: 'source', kind: 'iri', value: 'not an IRI' });
      expect(editor.addError()).toBeNull();
      editor.add();
      expect(editor.addError()).toBe('Annotation value must be a valid IRI.');
      expect(service.templateJson()).toEqual(saved);
      editor.editDraft({ value: 'urn:source' });
      editor.add();
      expect(editor.addError()).toBeNull();
      expect(editor.draft()).toEqual({ name: '', kind: 'literal', value: '' });
      const json = JSON.stringify(service.templateJson());
      expect(json).toContain('urn:source');
      expect(json).toContain('Reviewed');
      const artifact = service.templateJson();
      for (const source of [artifact, service.templateYaml()]) {
        expect(templateToJson(buildContainer(readContainer(source)))).toEqual(artifact);
      }

      editor.remove(1);
      editor.remove(0);
      expect(JSON.stringify(service.templateJson())).not.toContain('Reviewed');
      expect(service.validationReport().canSave).toBe(true);
    });
  });
}

it('retains invalid rows through unrelated input updates and protects published fields', async () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  const fixture = TestBed.createComponent(AnnotationsEditorComponent);
  const field = service.fields()[0];
  fixture.componentRef.setInput('field', {
    ...field,
    annotations: [{ name: 'note', kind: 'literal', value: 'imported' }],
  });
  fixture.detectChanges();
  await fixture.whenStable();
  const editor = fixture.componentInstance;
  expect(editor.rows()[0].value).toBe('imported');
  editor.edit(0, { name: '' });
  fixture.componentRef.setInput('field', {
    ...field,
    name: 'Renamed',
    annotations: [{ name: 'note', kind: 'literal', value: 'imported' }],
  });
  fixture.detectChanges();
  await fixture.whenStable();
  expect(editor.rows()).toHaveLength(1);
  expect(editor.error()).toContain('name');
  fixture.componentRef.setInput('field', { ...field, publishedDefinition: {} });
  fixture.detectChanges();
  await fixture.whenStable();
  const rows = editor.rows();
  editor.add();
  editor.edit(0, { name: 'changed' });
  editor.remove(0);
  expect(editor.rows()).toEqual(rows);
});
