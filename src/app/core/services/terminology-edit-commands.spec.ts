import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { TerminologyService } from './terminology.service';
import type { ControlledTermSet } from '../models/types';

it('owns constraint recovery without a view and commits the cleared default and new constraints together', async () => {
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  service.fields.set([
    {
      id: 1,
      type: 'controlledTerms',
      name: 'Term',
      options: [],
      status: 'optional',
      allowMultiple: false,
      defaultValue: { kind: 'iri', iri: 'urn:term', label: 'Term' },
    },
  ]);
  vi.spyOn(TestBed.inject(TerminologyService), 'allowsDefault').mockResolvedValue(false);
  const constraints: ControlledTermSet = {
    constraints: [{ sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Disease' }],
    actions: [],
  };
  const edit = service.terminologyEdits.changeConstraints(1, constraints);
  constraints.constraints.length = 0;
  expect(await edit.result).toBe('needs-clear');
  expect(service.fields()[0].controlledTermConstraints).toBeUndefined();
  const update = vi.spyOn(service.session.document, 'update');
  expect(edit.clearDefaultAndApply()).toBe(true);
  expect(update).toHaveBeenCalledTimes(1);
  expect(service.fields()[0]).toMatchObject({
    defaultValue: { kind: 'none' },
    controlledTermConstraints: { constraints: [{ ontologyId: 'DOID' }] },
  });
  expect(service.validationReport().canSave).toBe(true);
  expect(edit.clearDefaultAndApply()).toBe(false);
});
