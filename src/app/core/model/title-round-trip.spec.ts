import { TestBed } from '@angular/core/testing';
import { TemplateService } from '../services/template.service';

// The model library reads an artifact's title as its name gives it. A rename after loading must
// therefore write that title too, or saving and reopening changes the artifact.
it('keeps a renamed template, element and field the same through saving and reopening', () => {
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  const id = service.addElement(service.session.document().id);
  service.updateContainerDefinition(id, { name: 'Section' });
  service.loadTemplate(service.templateJson());
  const element = service.session.document().children.find((node) => node.kind === 'element')!;
  service.updateContainerDefinition(element.id, { name: 'Renamed section' });
  service.updateOwnFieldName(service.fields()[1].id, 'Root category');
  service.templateName.set('Study two');
  const saved = service.templateJson();
  service.loadTemplate(saved);
  expect(service.templateJson()).toEqual(saved);
});
