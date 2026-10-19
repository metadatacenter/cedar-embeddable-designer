import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { hostFindings } from '../model/host-findings';
import { containerFromFlat, fieldNode, ContainerDraft } from '../model/container-draft';
import type { CedHostFinding } from '../../ced-public-api';

const finding = (location: string, severity: 'error' | 'warning' = 'error'): CedHostFinding => ({
  location,
  severity,
  message: 'Server finding',
});
const field = (id: number, name: string) =>
  fieldNode({
    id,
    name,
    type: 'text',
    status: 'optional',
    allowMultiple: false,
    options: [],
    defaultValue: { kind: 'none' },
  });
const fixture = (): ContainerDraft => ({
  ...containerFromFlat({ name: 'Study', description: '', identifier: 'urn:study', version: '0.0.1', fields: [] }),
  children: [
    field(1, 'Title'),
    {
      kind: 'element',
      id: 2,
      placement: { deploymentName: 'A/B~C', allowMultiple: true },
      definition: {
        id: 2,
        kind: 'element',
        name: 'Nested',
        description: '',
        identifier: 'urn:nested',
        version: '0.0.1',
        children: [field(3, 'Title')],
      },
    },
  ],
});

it('resolves escaped placement paths and repeated definitions without matching labels or shared IDs', () => {
  const document = fixture();
  const [root, nested] = hostFindings(document, [
    finding('/properties/Title/_valueConstraints/regex'),
    finding('/properties/A~1B~0C/items/properties/Title/_valueConstraints/regex'),
  ]);
  expect(root).toMatchObject({ nodeId: 1, setting: 'regex', source: 'host', unmapped: false });
  expect(nested).toMatchObject({
    nodeId: 3,
    path: [document.id, 2, 3],
    setting: 'regex',
    tab: 'Constraints',
    unmapped: false,
  });
});

it('maps standalone definitions, root descriptions and element definition names', () => {
  const document = fixture();
  expect(hostFindings(document, [finding('/schema:description')])[0]).toMatchObject({
    nodeId: document.id,
    setting: 'description',
  });
  expect(hostFindings(document, [finding('/_valueConstraints/minLength')], true)[0]).toMatchObject({
    nodeId: 1,
    setting: 'minLength',
  });
  expect(hostFindings(document, [finding('/properties/A~1B~0C/items/schema:name')])[0]).toMatchObject({
    nodeId: 2,
    setting: 'ownName',
    tab: 'Display',
  });
});

it('keeps malformed and unsupported paths visible without inventing a target', () => {
  for (const location of [
    '/properties/Missing/schema:name',
    '/properties/A~2B/schema:name',
    'Title',
    '/unknown',
    '/properties/Title/_valueConstraints/minValue',
  ])
    expect(hostFindings(fixture(), [finding(location)])[0]).toMatchObject({
      location,
      message: 'Server finding',
      unmapped: true,
    });
});

describe('host finding ownership', () => {
  let service: TemplateService;
  beforeEach(() => {
    service = TestBed.inject(TemplateService);
    service.session.replace(fixture());
  });
  it('copies supplied findings, replaces reports and makes warnings advisory', () => {
    const findings = [finding('/schema:description')];
    const artifact = service.templateJson();
    service.setHostFindings(findings);
    findings[0].message = 'Mutated';
    expect(service.validationReport().canSave).toBe(false);
    expect(service.settingError(service.document().id, 'description')).toBe('Server finding');
    service.setHostFindings([finding('/schema:description', 'warning')]);
    expect(service.validationReport()).toMatchObject({ valid: true, canSave: true });
    expect(service.displayedIssues()).toEqual([]);
    expect(service.templateJson()).toEqual(artifact);
    service.setHostFindings([]);
    expect(service.validationReport().issues).toEqual([]);
  });
  it('retires findings after accepted edits, including exact reverts and document replacement', () => {
    const original = service.document();
    service.setHostFindings([finding('/schema:description')]);
    service.updateContainerDefinition(original.id, { description: 'Edited' });
    expect(service.validationReport().issues).toEqual([]);
    service.updateContainerDefinition(original.id, { description: original.description });
    expect(service.revealValidationFinding('/schema:description')).toBe(false);
    service.setHostFindings([finding('/schema:description')]);
    service.session.replace(structuredClone(service.document()));
    expect(service.validationReport().issues).toEqual([]);
  });
  it('does not clear incomplete setting input or local errors when a host report is cleared', () => {
    service.validation.setInputError(1, 'textConstraints', 'Incomplete regex', 'Constraints');
    service.setHostFindings([finding('/properties/Title/_valueConstraints/regex')]);
    service.setHostFindings([]);
    expect(service.validationReport().issues).toContainEqual(
      expect.objectContaining({ source: 'draft', message: 'Incomplete regex' }),
    );
    expect(service.validationReport().canSave).toBe(false);
  });
  it('retains inspection findings in read-only mode and rejects malformed input without replacing the report', () => {
    service.setHostFindings([finding('/schema:description')]);
    service.validation.setReadOnly(true);
    expect(service.validationReport().issues).toHaveLength(1);
    expect(service.displayedIssues()).toEqual([]);
    expect(() => service.setHostFindings([{ message: 'Invalid' } as CedHostFinding])).toThrow(TypeError);
    expect(service.validationReport().issues).toHaveLength(1);
  });
});
