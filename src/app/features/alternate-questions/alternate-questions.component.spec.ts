import { FieldSettingsComponent } from '../field-settings/field-settings.component';
import { TestBed } from '@angular/core/testing';
import { AlternateQuestionsComponent } from './alternate-questions.component';
import { TemplateService } from '../../core/services/template.service';
import { buildContainer, readContainer, templateToJson } from '../../core/model/cedar-template';

it('rejects blank questions on Add, saves alternate labels, and supports round trips and removal', async () => {
  localStorage.clear();
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  const fixture = TestBed.createComponent(AlternateQuestionsComponent);
  const refresh = async () => {
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await refresh();
  const editor = fixture.componentInstance;
  const before = service.templateJson();
  for (const value of ['', ' \n\t']) {
    editor.edit(value);
    expect(editor.error()).toBeNull();
    editor.add();
    expect(editor.error()).toBe('Question cannot be blank.');
    expect(service.templateJson()).toEqual(before);
    expect(service.validationReport().canSave).toBe(true);
  }
  editor.edit('What is your name?');
  editor.add();
  await refresh();
  expect(editor.question()).toBe('');
  const saved = service.templateJson();
  for (const duplicate of ['What is your name?', '  What is your name?  ']) {
    editor.edit(duplicate);
    expect(editor.error()).toBeNull();
    editor.add();
    expect(editor.error()).toBe('Questions must be unique.');
    expect(service.templateJson()).toEqual(saved);
    expect(editor.questions()).toHaveLength(1);
  }
  editor.edit('How should we address you?');
  editor.add();
  await refresh();
  expect(editor.questions()).toEqual(['What is your name?', 'How should we address you?']);
  const artifact = service.templateJson();
  for (const source of [artifact, service.templateYaml()]) {
    expect(templateToJson(buildContainer(readContainer(source)))).toEqual(artifact);
  }
  editor.remove(0);
  await refresh();
  expect(editor.questions()).toEqual(['How should we address you?']);
  fixture.componentRef.setInput('field', { ...service.fields()[0], publishedDefinition: {} });
  fixture.detectChanges();
  await fixture.whenStable();
  editor.edit('Forbidden');
  editor.add();
  editor.remove(0);
  expect(service.fields()[0].alternateLabels).toEqual(['How should we address you?']);
});

for (const type of ['text', 'richText', 'image', 'youtube', 'sectionBreak', 'pageBreak']) {
  it(`shows alternate questions only for non-static fields: ${type}`, async () => {
    localStorage.clear();
    const service = TestBed.inject(TemplateService);
    const fixture = TestBed.createComponent(FieldSettingsComponent);
    fixture.componentRef.setInput('field', { ...service.fields()[0], type });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(!!fixture.nativeElement.querySelector('app-alternate-questions')).toBe(type === 'text');
  });
}
