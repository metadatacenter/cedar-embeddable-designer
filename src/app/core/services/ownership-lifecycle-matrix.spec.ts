import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { TerminologyService } from './terminology.service';
import { FieldSettingsComponent } from '../../features/field-settings/field-settings.component';
import type { Field } from '../models/types';

const constraintSet = {
  constraints: [{ sourceType: 'ontology' as const, ontologyId: 'DOID', ontologyName: 'Disease' }],
  actions: [],
};
function setup(kind: 'default' | 'constraints') {
  const service = TestBed.inject(TemplateService);
  service.templateName.set('Study');
  service.fields.set([
    {
      id: 1,
      name: 'Term',
      type: 'controlledTerms',
      status: 'optional',
      options: [],
      allowMultiple: false,
      controlledTermConstraints: kind === 'default' ? constraintSet : undefined,
      defaultValue: kind === 'default' ? { kind: 'none' } : { kind: 'iri', iri: 'urn:term', label: 'Term' },
    },
  ]);
  return service;
}
function begin(service: TemplateService, kind: 'default' | 'constraints') {
  return kind === 'default'
    ? service.terminologyEdits.selectDefault(1, { iri: 'urn:new', label: 'New' })
    : service.terminologyEdits.changeConstraints(1, constraintSet);
}
const transitions = [
  'rename',
  'rejected-edit',
  'raw-input',
  'new-check',
  'delete',
  'load',
  'reset',
  'read-only',
  'read-only-and-back',
  'cancel',
] as const;
function transition(
  service: TemplateService,
  change: (typeof transitions)[number],
  cancel: () => void,
  source: object,
) {
  if (change === 'rename') service.updateFieldName(1, 'Renamed');
  if (change === 'rejected-edit')
    service.updateFieldSettings(1, { annotations: [{ name: 'source', kind: 'iri', value: 'relative' }] });
  if (change === 'raw-input') service.validation.setInputError(1, 'defaultValue', 'Unfinished input', 'Constraints');
  if (change === 'new-check') service.validation.beginCheck(1, 'defaultValue', 'New check');
  if (change === 'delete') service.deleteField(1);
  if (change === 'load') service.loadTemplate(source);
  if (change === 'reset') service.resetTemplate();
  if (change.startsWith('read-only')) service.validation.setReadOnly(true);
  if (change === 'read-only-and-back') service.validation.setReadOnly(false);
  if (change === 'cancel') cancel();
}

// The matrix varies who still owns a reply, rather than just its field type or depth.
for (const kind of ['default', 'constraints'] as const)
  for (const outcome of ['allow', 'deny', 'failure'] as const)
    for (const change of transitions)
      it(`${kind}: ${outcome} arriving after ${change} cannot alter its successor`, async () => {
        const service = setup(kind);
        const source = service.templateJson();
        let resolve!: (allowed: boolean) => void;
        let reject!: (error: Error) => void;
        const lookup = vi.spyOn(TestBed.inject(TerminologyService), 'allowsDefault').mockReturnValue(
          new Promise<boolean>((done, fail) => {
            resolve = done;
            reject = fail;
          }),
        );
        const edit = begin(service, kind);
        const signal = lookup.mock.calls[0][3]!;
        expect(signal.aborted).toBe(false);
        transition(service, change, () => edit.cancel(), source);
        expect(signal.aborted).toBe(true);
        const document = structuredClone(service.document());
        const report = structuredClone(service.validationReport());
        const dirty = service.isDirty();
        if (outcome === 'failure') reject(new Error('Old failure'));
        else resolve(outcome === 'allow');
        expect(await edit.result).toBe('stale');
        expect(edit.clearDefaultAndApply()).toBe(false);
        expect(service.document()).toEqual(document);
        expect(service.validationReport()).toEqual(report);
        expect(service.isDirty()).toBe(dirty);
      });

for (const change of transitions)
  it(`a constraint recovery cannot outlive ${change}`, async () => {
    const service = setup('constraints');
    const source = service.templateJson();
    vi.spyOn(TestBed.inject(TerminologyService), 'allowsDefault').mockResolvedValue(false);
    const edit = begin(service, 'constraints');
    expect(await edit.result).toBe('needs-clear');
    transition(service, change, () => edit.cancel(), source);
    const before = structuredClone(service.document());
    expect(edit.clearDefaultAndApply()).toBe(false);
    expect(service.document()).toEqual(before);
  });

interface SettingsCase {
  setting: string;
  type: string;
  seed: Partial<Field>;
  input: string;
  prepare(panel: FieldSettingsComponent, value: number | null): void;
  read(panel: FieldSettingsComponent): number | null;
  save(panel: FieldSettingsComponent, form?: HTMLFormElement, changed?: string): void;
}
const settings: SettingsCase[] = [
  {
    setting: 'numeric',
    type: 'number',
    seed: { numeric: { type: 'xsd:decimal', min: null, max: 100, decimalPlaces: null, unit: null } },
    input: 'numericMax',
    prepare: (p, v) => {
      p.numeric.max = v;
    },
    read: (p) => p.numeric.max,
    save: (p, f, c) => p.saveNumeric(f, c),
  },
  {
    setting: 'textConstraints',
    type: 'text',
    seed: { textConstraints: { minLength: null, maxLength: 100, regex: null } },
    input: 'maxLength',
    prepare: (p, v) => {
      p.text.maxLength = v;
    },
    read: (p) => p.text.maxLength,
    save: (p, f, c) => p.saveText(f, c),
  },
  {
    setting: 'occurrences',
    type: 'text',
    seed: { allowMultiple: true, maxItems: 100 },
    input: 'max',
    prepare: (p, v) => {
      p.max = v;
    },
    read: (p) => p.max,
    save: (p, f, c) => p.saveBounds(f, c),
  },
  {
    setting: 'media',
    type: 'image',
    seed: { width: 100 },
    input: 'width',
    prepare: (p, v) => {
      p.width = v;
    },
    read: (p) => p.width,
    save: (p, f, c) => p.saveMedia(f, c),
  },
];
for (const row of settings)
  for (const move of [false, true])
    for (const correction of [null, 200])
      it(`${row.setting}: recreate after move=${move}, then ${correction === null ? 'clear' : 'correct'} the invalid control`, () => {
        const service = TestBed.inject(TemplateService);
        service.resetTemplate('template', false);
        service.templateName.set('Study');
        service.addField(row.type, 0);
        const id = service.fields()[0].id;
        service.updateFieldName(id, 'Value');
        service.updateFieldSettings(id, row.seed);
        const create = () => {
          const fixture = TestBed.createComponent(FieldSettingsComponent);
          const field = service.session.fieldBinding(service.parentContainerId(id))()[0];
          fixture.componentRef.setInput('field', field);
          fixture.componentRef.setInput('hasValues', true);
          fixture.detectChanges();
          return fixture;
        };
        const first = create();
        const input = first.nativeElement.querySelector(`[name=${row.input}]`) as HTMLInputElement;
        Object.defineProperty(input, 'validity', { value: { badInput: true } });
        row.prepare(first.componentInstance, null);
        row.save(first.componentInstance, input.form!, row.input);
        first.destroy();
        if (move) {
          const element = service.addElement();
          service.updateContainerDefinition(element, { name: 'Nested' });
          service.moveChild(id, element);
        }
        const second = create();
        expect(row.read(second.componentInstance)).toBeNull();
        expect(service.validationReport().canSave).toBe(false);
        // A submit or a different input cannot silently accept the sanitised empty value.
        row.save(second.componentInstance);
        expect(service.validationReport().canSave).toBe(false);
        row.prepare(second.componentInstance, correction);
        row.save(second.componentInstance, undefined, row.input);
        expect(service.validation.settingsInput(id, row.setting)).toBeUndefined();
        expect(service.validationReport().canSave).toBe(true);
        const saved = service.templateJson();
        service.loadTemplate(saved);
        expect(service.validationReport().canSave).toBe(true);
      });
