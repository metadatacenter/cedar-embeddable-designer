import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ElementLabelsComponent } from './element-labels.component';
import { AlternateQuestionsComponent } from '../alternate-questions/alternate-questions.component';
import { TemplateService } from '../../core/services/template.service';
import { buildContainer, readContainer, templateToJson } from '../../core/model/cedar-template';

for (const standalone of [false, true]) {
  it(`edits, validates and preserves element names (${standalone ? 'standalone' : 'nested'})`, async () => {
    localStorage.clear();
    const service = TestBed.inject(TemplateService);
    service.templateName.set('Study');
    service.addElement(service.document().id);
    const element = () => {
      if (standalone && service.document().kind === 'element') return service.document();
      const node = service.document().children.find((child) => child.kind === 'element');
      if (!node || node.kind !== 'element') throw new Error('Element missing');
      return node.definition;
    };
    if (standalone) service.loadTemplate(templateToJson(buildContainer(element())));
    const fixture = TestBed.createComponent(ElementLabelsComponent);
    const refresh = async () => {
      fixture.componentRef.setInput('container', element());
      fixture.detectChanges();
      await fixture.whenStable();
    };
    await refresh();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Study participant';
    input.dispatchEvent(new Event('input'));
    await refresh();
    expect(element().preferredLabel).toBe('Study participant');
    const names = fixture.debugElement.query(By.directive(AlternateQuestionsComponent))
      .componentInstance as AlternateQuestionsComponent;
    names.edit('  ');
    expect(names.error()).toBeNull();
    names.add();
    expect(names.error()).toBe('Name cannot be blank.');
    names.edit('Subject');
    names.add();
    await refresh();
    names.edit(' Subject ');
    names.add();
    expect(names.error()).toBe('Names must be unique.');
    expect(element().alternateLabels).toEqual(['Subject']);
    names.edit('Participant');
    names.add();
    await refresh();
    expect(fixture.nativeElement.querySelectorAll('tbody input')).toHaveLength(0);
    const json = service.templateJson();
    expect(templateToJson(buildContainer(readContainer(json)))).toEqual(json);
    const saved = readContainer(json);
    const savedElement = standalone ? saved : saved.children.find((child) => child.kind === 'element')?.definition;
    expect(savedElement?.preferredLabel).toBe('Study participant');
    expect(savedElement?.alternateLabels).toEqual(['Subject', 'Participant']);
    names.remove(0);
    fixture.componentInstance.change('');
    await refresh();
    expect(element().preferredLabel).toBeNull();
    expect(element().alternateLabels).toEqual(['Participant']);
  });
}
