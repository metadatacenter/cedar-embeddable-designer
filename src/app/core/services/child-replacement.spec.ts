/**
 * The document changes behind the Version tab's buttons: detaching a linked child, and putting a
 * stored version in a child's place.
 *
 * Each case checks the template the designer would save, not only its own state, because that
 * artifact is what the repository and every instance see.
 */
import { TestBed } from '@angular/core/testing';
import type { CedJsonObject } from '../../ced-public-api';
import {
  buildContainer,
  fieldToJson,
  newContainer,
  newFieldIdentity,
  readField,
  templateToJson,
} from '../model/cedar-template';
import { fieldNode, FieldNode, newNodeId } from '../model/container-draft';
import { Field } from '../models/types';
import { versionState } from '../model/version-state';
import { TemplateService } from './template.service';

function textField(name: string): Field {
  return {
    id: newNodeId(),
    ...newFieldIdentity(),
    type: 'text',
    name,
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
  };
}

function published(json: object, version = '1.2.0'): CedJsonObject {
  return { ...(json as CedJsonObject), 'pav:version': version, 'bibo:status': 'bibo:published' };
}

/** The properties of the saved template's children, by key. */
function storedChildren(service: TemplateService): Record<string, CedJsonObject> {
  return (service.templateJson() as { properties: Record<string, CedJsonObject> }).properties;
}

describe('replacing and detaching children', () => {
  let service: TemplateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
  });

  const root = () => service.session.document();
  const importOne = (type: 'field' | 'element', artifact: CedJsonObject) =>
    service.importChildren([{ type, artifact }], root().id, 0)[0];
  const children = (id: number): FieldNode[] => {
    const node = root().children.find((child) => child.id === id);
    if (node?.kind !== 'element') throw new Error('expected an element');
    return node.definition.children.filter((child): child is FieldNode => child.kind === 'field');
  };

  it('stores a copied draft field with its own identifier and the identifier it came from', () => {
    const source = fieldToJson(textField('Sample')) as CedJsonObject;
    const id = importOne('field', source);
    const stored = storedChildren(service)[service.childKey(id)];
    expect(stored['@id']).not.toBe(source['@id']);
    expect(stored['pav:derivedFrom']).toBe(source['@id']);
    expect(stored['pav:version']).toBe('0.0.1');
  });

  it('stores a linked field as the published artifact it is', () => {
    const source = published(fieldToJson(textField('Sample')));
    const id = importOne('field', source);
    const stored = storedChildren(service)[service.childKey(id)];
    expect(stored['@id']).toBe(source['@id']);
    expect(stored['bibo:status']).toBe('bibo:published');
    expect(stored['pav:derivedFrom']).toBeUndefined();
  });

  it('detaches a linked field into an editable copy, and refuses what is not linked', () => {
    const source = published(fieldToJson(textField('Sample')));
    const id = importOne('field', source);
    const local = service.fields().find((field) => field.id !== id)!.id;
    expect(service.definitionLocked(id)).toBe(true);
    expect(service.detachChild(local)).toBe(false);
    expect(service.detachChild(id)).toBe(true);
    expect(service.definitionLocked(id)).toBe(false);
    expect(versionState(root(), id)).toEqual({ kind: 'forked', origin: source['@id'] });
    expect(service.detachChild(id)).toBe(false);
    const stored = storedChildren(service)[service.childKey(id)];
    expect(stored['pav:derivedFrom']).toBe(source['@id']);
    expect(stored['bibo:status']).toBe('bibo:draft');
  });

  it('refuses to detach in a read-only designer', () => {
    const id = importOne('field', published(fieldToJson(textField('Sample'))));
    service.validation.setReadOnly(true);
    expect(service.detachChild(id)).toBe(false);
    expect(versionState(root(), id)?.kind).toBe('linked');
  });

  it('detaches a linked element and leaves its published children linked', () => {
    const linkedInner = published(fieldToJson(textField('Linked inner')));
    const definition = newContainer('element', 'Group');
    definition.children = [
      fieldNode(textField('Draft inner')),
      fieldNode({ ...readField(JSON.stringify(linkedInner)), id: newNodeId(), deploymentName: 'linked_inner' }),
    ];
    const element = templateToJson(buildContainer(definition)) as CedJsonObject;
    const id = importOne('element', published(element));
    const [draftBefore, linkedBefore] = children(id);
    expect(versionState(root(), draftBefore.id)?.kind).toBe('contained');
    expect(versionState(root(), linkedBefore.id)?.kind).toBe('contained');
    expect(service.detachChild(id)).toBe(true);
    expect(versionState(root(), id)).toEqual({ kind: 'forked', origin: element['@id'] });
    const [draftInner, linked] = children(id);
    // The element's own content becomes editable, and its inline child keeps its identifier.
    expect(versionState(root(), draftInner.id)).toEqual({ kind: 'local' });
    expect(service.definitionLocked(draftInner.id)).toBe(false);
    expect(draftInner.definition).toMatchObject({ atId: draftBefore.definition.atId });
    // A published child of the element is still the published artifact, now linked on its own.
    expect(versionState(root(), linked.id)).toEqual({ kind: 'linked', identifier: linkedInner['@id'] });
    expect(service.definitionLocked(linked.id)).toBe(true);
  });

  it('keeps the key, labels and requirement of a replaced child', () => {
    const id = importOne('field', published(fieldToJson(textField('Sample')), '1.2.0'));
    service.updateFieldSettings(id, { deploymentName: 'sample_key', displayLabel: 'Shown', status: 'required' });
    const newer = published(fieldToJson({ ...textField('Sample renamed') }), '1.3.0');
    service.replaceChildren([{ id, type: 'field', artifact: newer }]);
    const node = root().children.find((child) => child.id === id)!;
    expect(node.placement).toMatchObject({ deploymentName: 'sample_key', displayLabel: 'Shown', status: 'required' });
    expect(node.definition).toMatchObject({ name: 'Sample renamed', atId: newer['@id'] });
    expect(storedChildren(service)['sample_key']['@id']).toBe(newer['@id']);
  });

  it('changes nothing when one replacement in a batch cannot be read', () => {
    const first = importOne('field', published(fieldToJson(textField('First'))));
    const second = importOne('field', published(fieldToJson(textField('Second'))));
    const before = root();
    expect(() =>
      service.replaceChildren([
        { id: first, type: 'field', artifact: published(fieldToJson(textField('Newer')), '1.3.0') },
        { id: second, type: 'field', artifact: {} },
      ]),
    ).toThrow();
    expect(root()).toBe(before);
  });

  it('refuses to replace a field with an element', () => {
    const id = importOne('field', published(fieldToJson(textField('Sample'))));
    const element = published(templateToJson(buildContainer(newContainer('element', 'Group'))));
    const before = root();
    expect(() => service.replaceChildren([{ id, type: 'element', artifact: element }])).toThrow();
    expect(root()).toBe(before);
  });

  it('refuses to replace a child inside a linked element', () => {
    const definition = newContainer('element', 'Group');
    definition.children = [fieldNode(textField('Inner'))];
    const id = importOne('element', published(templateToJson(buildContainer(definition))));
    const group = root().children.find((child) => child.id === id)!;
    const innerId = group.kind === 'element' ? group.definition.children[0].id : -1;
    const before = root();
    expect(() =>
      service.replaceChildren([{ id: innerId, type: 'field', artifact: published(fieldToJson(textField('Other'))) }]),
    ).toThrow();
    expect(root()).toBe(before);
  });
});
