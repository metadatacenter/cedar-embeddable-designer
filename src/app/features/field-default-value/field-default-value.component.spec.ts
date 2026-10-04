import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FieldDefaultValueComponent } from './field-default-value.component';
import { TemplateService } from '../../core/services/template.service';
import { TerminologyService } from '../../core/services/terminology.service';
import { Field } from '../../core/models/types';

function setup() {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(FieldDefaultValueComponent);
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Test template');
  const field: Field = {
    id: 1,
    type: 'controlledTerms',
    name: 'Disease',
    status: 'optional',
    options: [],
    allowMultiple: false,
    defaultValue: { kind: 'none' },
    controlledTermConstraints: {
      constraints: [{ sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Disease', version: { id: 'pin' } }],
      actions: [],
    },
  };
  service.fields.set([field]);
  fixture.componentRef.setInput('field', field);
  const allows = vi.spyOn(TestBed.inject(TerminologyService), 'allowsDefault').mockResolvedValue(true);
  const panel = fixture.componentInstance;
  panel.openPicker();
  return { fixture, service, field, allows, panel };
}
const selection = () =>
  new CustomEvent('selected', { detail: { type: 'class', termIri: 'urn:cancer', termLabel: 'Cancer' } });

it('saves a verified controlled default and clears it explicitly', async () => {
  const { panel, service } = setup();
  await panel.selectTerm(selection());
  expect(service.fields()[0].defaultValue).toEqual({ kind: 'iri', iri: 'urn:cancer', label: 'Cancer' });
  expect(panel.pickerOpen()).toBe(false);
  panel.clear();
  expect(service.fields()[0].defaultValue).toEqual({ kind: 'none' });
});
it('does not save a late response after cancelling default selection', async () => {
  const { panel, service, allows } = setup();
  let resolve!: (value: boolean) => void;
  allows.mockReturnValue(
    new Promise<boolean>((done) => {
      resolve = done;
    }),
  );
  const pending = panel.selectTerm(selection());
  panel.cancelPicker();
  resolve(true);
  await pending;
  expect(service.fields()[0].defaultValue).toEqual({ kind: 'none' });
  expect(panel.checking()).toBe(false);
});
it('keeps the current default on a rejected term or a validation outage', async () => {
  const { panel, service, allows } = setup();
  allows.mockResolvedValue(false);
  await panel.selectTerm(selection());
  expect(panel.error()).toContain('not permitted');
  allows.mockRejectedValue(new Error('Offline'));
  await panel.selectTerm(selection());
  expect(panel.error()).toBe('Offline');
  expect(service.fields()[0].defaultValue).toEqual({ kind: 'none' });
});
it('deduplicates source scopes while retaining distinct release pins', () => {
  const { panel, fixture, field } = setup();
  const constraint = field.controlledTermConstraints!.constraints[0];
  fixture.componentRef.setInput('field', {
    ...field,
    controlledTermConstraints: {
      constraints: [constraint, constraint, { ...constraint, version: { id: 'other' } }],
      actions: [],
    },
  });
  expect(panel.pickerSources()).toEqual([
    { sourceAcronym: 'DOID', sourceSystem: undefined, version: { id: 'pin' } },
    { sourceAcronym: 'DOID', sourceSystem: undefined, version: { id: 'other' } },
  ]);
});

it('blocks saving while terminology validation is pending and clears the report on cancellation', async () => {
  const { panel, service, allows } = setup();
  let resolve!: (value: boolean) => void;
  allows.mockReturnValue(
    new Promise<boolean>((done) => {
      resolve = done;
    }),
  );
  const pending = panel.selectTerm(selection());
  expect(service.validationReport().canSave).toBe(false);
  expect(service.validationReport().issues[0].setting).toBe('defaultValue');
  panel.cancelPicker();
  expect(service.validationReport().canSave).toBe(true);
  resolve(true);
  await pending;
  expect(service.validationReport().canSave).toBe(true);
});

for (const outcome of ['accept', 'reject', 'offline'])
  for (const transition of ['rename', 'edit', 'reject-edit', 'delete', 'reset', 'cancel', 'destroy']) {
    it(`ignores a late ${outcome} after ${transition}, including before the next input render`, async () => {
      const { panel, service, allows, fixture } = setup();
      let resolve!: (value: boolean) => void;
      let reject!: (error: Error) => void;
      allows.mockReturnValue(
        new Promise<boolean>((done, fail) => {
          resolve = done;
          reject = fail;
        }),
      );
      const pending = panel.selectTerm(selection());
      expect(service.validationReport().canSave).toBe(false);
      if (transition === 'rename') service.updateFieldDisplayName(1, 'Renamed');
      if (transition === 'edit') service.updateFieldSettings(1, { schemaIdentifier: 'Changed' });
      if (transition === 'reject-edit')
        service.updateFieldSettings(1, { annotations: [{ name: 'bad', kind: 'iri', value: 'relative' }] });
      if (transition === 'delete') service.deleteField(1);
      if (transition === 'reset') service.resetTemplate();
      if (transition === 'cancel') panel.cancelPicker();
      if (transition === 'destroy') fixture.destroy();
      expect(service.validation.isChecking(1, 'defaultValue')).toBe(false);
      const before = structuredClone(service.document());
      const report = service.validationReport();
      if (outcome === 'offline') reject(new Error('Old outage'));
      else resolve(outcome === 'accept');
      await pending;
      expect(service.document()).toEqual(before);
      expect(service.validationReport()).toEqual(report);
    });
  }
for (const earlier of ['accept', 'reject', 'offline']) {
  it(`an earlier ${earlier} cannot clear or overwrite a second selection`, async () => {
    const { panel, service, allows } = setup();
    let firstResolve!: (value: boolean) => void;
    let firstReject!: (error: Error) => void;
    let secondResolve!: (value: boolean) => void;
    allows
      .mockReturnValueOnce(
        new Promise<boolean>((done, fail) => {
          firstResolve = done;
          firstReject = fail;
        }),
      )
      .mockReturnValueOnce(
        new Promise<boolean>((done) => {
          secondResolve = done;
        }),
      );
    const first = panel.selectTerm(selection());
    panel.cancelPicker();
    panel.openPicker();
    const second = panel.selectTerm(selection());
    if (earlier === 'offline') firstReject(new Error('Old outage'));
    else firstResolve(earlier === 'accept');
    await first;
    expect(panel.checking()).toBe(true);
    expect(service.validationReport().canSave).toBe(false);
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'none' });
    secondResolve(true);
    await second;
    expect(service.validationReport().canSave).toBe(true);
    expect(service.fields()[0].defaultValue).toMatchObject({ iri: 'urn:cancer' });
  });
}

it('does not offer to clear a valid default because another setting is broken', () => {
  const { panel, service, fixture, field } = setup();
  const imported: Field = {
    ...field,
    defaultValue: { kind: 'iri', iri: 'urn:valid', label: 'Valid' },
    annotations: [{ name: 'source', kind: 'iri', value: 'relative' }],
  };
  service.fields.set([imported]);
  fixture.componentRef.setInput('field', imported);
  expect(service.validationReport().canSave).toBe(false);
  expect(panel.invalidDefaultText()).toBeNull();
});
