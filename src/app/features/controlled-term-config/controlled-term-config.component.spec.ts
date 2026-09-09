import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ControlledTermConfigComponent } from './controlled-term-config.component';
import { TerminologyService } from '../../core/services/terminology.service';
import { TemplateService } from '../../core/services/template.service';
import { ControlledTermSet, Field } from '../../core/models/types';

describe('applying complete constraints', () => {
  const set: ControlledTermSet = {
    constraints: [
      { sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Disease' },
      { sourceType: 'ontology', ontologyId: 'NCIT', ontologyName: 'Cancer' },
    ],
    actions: [
      { action: 'delete', termUri: 'urn:excluded', sourceUri: 'urn:source', source: 'DOID', type: 'OntologyClass' },
    ],
  };
  let panel: ControlledTermConfigComponent;
  let service: TemplateService;
  let allows: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
    allows = vi.spyOn(TestBed.inject(TerminologyService), 'allowsDefault').mockResolvedValue(true);
    panel = TestBed.createComponent(ControlledTermConfigComponent).componentInstance;
    panel.field = {
      id: 1,
      name: 'Terms',
      type: 'controlledTerms',
      status: 'optional',
      options: [],
      allowMultiple: false,
      defaultValue: { kind: 'iri', iri: 'urn:term', label: 'Term' },
    } as Field;
    service.fields.set([panel.field]);
    panel.openPicker();
  });
  it('validates the whole set and keeps a permitted default', async () => {
    await panel.applyPicked(new CustomEvent('constraintsSelected', { detail: set }));
    expect(allows.mock.calls[0][0]._valueConstraints.ontologies).toHaveLength(2);
    expect(allows.mock.calls[0][0]._valueConstraints.actions).toEqual(set.actions);
    expect(service.fields()[0].defaultValue).toEqual(panel.field.defaultValue);
    expect(service.fields()[0].controlledTermConstraints).toEqual(set);
  });
  it('requires explicit clearing of an excluded default before applying', async () => {
    allows.mockResolvedValue(false);
    await panel.applyPicked(new CustomEvent('constraintsSelected', { detail: set }));
    expect(panel.invalidDefault()).toBe(true);
    expect(service.fields()[0].controlledTermConstraints).toBeUndefined();
    panel.clearDefaultAndApply();
    expect(service.fields()[0].defaultValue).toEqual({ kind: 'none' });
    expect(service.fields()[0].controlledTermConstraints).toEqual(set);
  });
  it('keeps the existing field on a validation outage or cancellation', async () => {
    allows.mockRejectedValue(new Error('Offline'));
    await panel.applyPicked(new CustomEvent('constraintsSelected', { detail: set }));
    expect(panel.error()).toBe('Offline');
    panel.closePicker();
    panel.clearDefaultAndApply();
    expect(service.fields()[0]).toEqual(panel.field);
  });
  it('ignores a membership response after the author cancels', async () => {
    let resolve!: (allowed: boolean) => void;
    allows.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    const pending = panel.applyPicked(new CustomEvent('constraintsSelected', { detail: set }));
    panel.closePicker();
    resolve(true);
    await pending;
    expect(service.fields()[0]).toEqual(panel.field);
  });
  it('does not apply an earlier invalid draft after the author edits it again', async () => {
    allows.mockResolvedValue(false);
    await panel.applyPicked(new CustomEvent('constraintsSelected', { detail: set }));
    panel.draftChanged();
    panel.clearDefaultAndApply();
    expect(service.fields()[0]).toEqual(panel.field);
  });
});
