import { TestBed } from '@angular/core/testing';
import { LanguageSelectorComponent } from './language-selector.component';
import { TemplateService } from '../../core/services/template.service';
import { buildContainer, readContainer, templateToJson } from '../../core/model/cedar-template';

for (const kind of ['text', 'richText', 'image', 'youtube', 'sectionBreak', 'pageBreak', 'template', 'element']) {
  it(`sets, preserves and clears language on ${kind}`, async () => {
    localStorage.clear();
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
    const isField = !['template', 'element'].includes(kind);
    if (isField) service.addField(kind, 0);
    if (kind === 'element') service.addElement(service.document().id);
    const fixture = TestBed.createComponent(LanguageSelectorComponent);
    const refresh = async () => {
      const element = service.document().children.find((node) => node.kind === 'element');
      fixture.componentRef.setInput(
        isField ? 'field' : 'container',
        isField
          ? service.fields()[0]
          : kind === 'element' && element?.kind === 'element'
            ? element.definition
            : service.document(),
      );
      fixture.detectChanges();
      await fixture.whenStable();
    };
    await refresh();
    const editor = fixture.componentInstance;
    expect(editor.value()).toBe('');
    editor.change('fr');
    await refresh();
    expect(editor.value()).toBe('fr');
    const artifact = service.templateJson();
    for (const source of [artifact, service.templateYaml()]) {
      expect(templateToJson(buildContainer(readContainer(source)))).toEqual(artifact);
    }
    editor.change('');
    await refresh();
    expect(editor.value()).toBe('');
    if (isField) {
      const field = service.fields()[0];
      service.updateFieldSettings(field.id, { language: 'en-GB' });
      await refresh();
      expect(editor.custom()).toBe('en-GB');
      fixture.componentRef.setInput('field', { ...service.fields()[0], publishedDefinition: {} });
      fixture.detectChanges();
      await fixture.whenStable();
      editor.change('de');
      expect(service.fields()[0].language).toBe('en-GB');
    }
  });
}
