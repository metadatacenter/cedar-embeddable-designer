/**
 * An element keeps its property IRI through every edit the designer makes to it.
 *
 * The template maps each child's key to a property IRI, and an instance's values mean what that IRI
 * says. An edit that gave an existing element a new IRI would cut every stored instance off from
 * the element it was filled against. Only an insertion mints one, because each insertion is a new
 * placement. The editing-history fuzz test holds fields to the same rule.
 *
 * Each case checks the template the designer would save, not only its own state, because that
 * artifact is what the repository and every instance see.
 */
import { TestBed } from '@angular/core/testing';
import type { CedChildSource, CedJsonObject } from '../../ced-public-api';
import {
  buildContainer,
  newContainer,
  newFieldIdentity,
  templateToJson,
  templateToYaml,
} from '../model/cedar-template';
import { ContainerDraft, ElementNode, fieldNode, newNodeId } from '../model/container-draft';
import { Field } from '../models/types';
import { versionState } from '../model/version-state';
import { ChildVersionService } from './child-versions.service';
import { TemplateService } from './template.service';

const P_GROUP = 'https://schema.metadatacenter.org/properties/00000000-0000-4000-8000-0000000000a1';
const P_OTHER = 'https://schema.metadatacenter.org/properties/00000000-0000-4000-8000-0000000000a2';

function textField(name: string): Field {
  return {
    id: newNodeId(),
    ...newFieldIdentity(),
    type: 'text',
    name,
    deploymentName: name,
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
  };
}

function element(name: string, propertyIri: string): ElementNode {
  const definition = newContainer('element', name);
  definition.children = [fieldNode(textField(`${name} inner`))];
  return {
    kind: 'element',
    id: definition.id,
    definition,
    placement: { deploymentName: name, allowMultiple: false, propertyIri },
  };
}

function elementJson(
  name: string,
  version: string,
  status: 'bibo:published' | 'bibo:draft',
  id?: string,
): CedJsonObject {
  const definition = newContainer('element', name);
  definition.children = [fieldNode(textField(`${name} inner`))];
  if (id) definition.identifier = id;
  const json = templateToJson(buildContainer(definition)) as CedJsonObject;
  return { ...json, 'pav:version': version, 'bibo:status': status };
}

/** A stored template with a field and two elements whose property IRIs are known. */
function storedTemplate(): CedJsonObject {
  const template: ContainerDraft = newContainer('template', 'Study');
  template.children = [fieldNode(textField('Title')), element('Group', P_GROUP), element('Other', P_OTHER)];
  return templateToJson(buildContainer(template)) as CedJsonObject;
}

type Json = Record<string, unknown>;

/** The property IRI the saved artifact maps the last key of `path` to, in the container the rest names. */
function iriAt(json: unknown, path: string[]): string | undefined {
  let container = json as Json;
  for (const key of path.slice(0, -1)) {
    const child = (container['properties'] as Json)[key] as Json;
    container = (child['items'] as Json | undefined) ?? child;
  }
  const context = (container['properties'] as Json)['@context'] as Json;
  const mapping = (context['properties'] as Json)[path.at(-1)!] as Json | undefined;
  return (mapping?.['enum'] as string[] | undefined)?.[0];
}

describe('an element property IRI', () => {
  let service: TemplateService;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
    service.loadTemplate(storedTemplate());
  });
  const root = () => service.session.document();
  const byKey = (key: string, container: ContainerDraft = root()) =>
    container.children.find((child) => child.placement.deploymentName === key) as ElementNode;
  const saved = () => service.templateJson();

  it('survives opening and saving', () => {
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
    expect(iriAt(saved(), ['Other'])).toBe(P_OTHER);
  });

  it('survives a YAML export read back', () => {
    service.loadTemplate(templateToYaml(service.template()));
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives reordering among siblings', () => {
    service.moveChild(byKey('Group').id, root().id, 0);
    expect(root().children[0].placement.deploymentName).toBe('Group');
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
    service.moveChild(byKey('Group').id, root().id, Number.MAX_SAFE_INTEGER);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives a move into another element and back, read back from JSON and YAML on the way', () => {
    service.moveChild(byKey('Group').id, byKey('Other').definition.id, 0);
    expect(service.loadError()).toBeNull();
    expect(iriAt(saved(), ['Other', 'Group'])).toBe(P_GROUP);
    service.loadTemplate(saved());
    expect(iriAt(saved(), ['Other', 'Group'])).toBe(P_GROUP);
    service.loadTemplate(templateToYaml(service.template()));
    expect(iriAt(saved(), ['Other', 'Group'])).toBe(P_GROUP);
    service.moveChild(byKey('Group', byKey('Other').definition).id, root().id, 1);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives renaming the display name, the own name and the key, and moves to the new key', () => {
    service.updateElementDisplayName(byKey('Group'), 'Shown group');
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
    service.updateOwnElementName(byKey('Group'), 'Renamed group');
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
    expect(service.updateElementPlacement(byKey('Group').id, { deploymentName: 'group_key' }, 'key')).toBeNull();
    expect(iriAt(saved(), ['group_key'])).toBe(P_GROUP);
    expect(iriAt(saved(), ['Group'])).toBeUndefined();
  });

  it('survives a change of multiplicity and back', () => {
    expect(
      service.updateElementPlacement(byKey('Group').id, { allowMultiple: true, minItems: 1, maxItems: 3 }, 'placement'),
    ).toBeNull();
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
    service.updateElementPlacement(byKey('Group').id, { allowMultiple: false }, 'placement');
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives an edit inside the element', () => {
    service.addField('text', 0, byKey('Group').definition.id);
    const added = byKey('Group').definition.children[0].id;
    service.updateFieldName(added, 'Added');
    service.touchName(added);
    expect(byKey('Group').definition.children).toHaveLength(2);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives reopening after a save, keeping the view', () => {
    service.loadTemplate(saved(), true);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives capturing and restoring a recovery draft', () => {
    const draft = service.captureDraft();
    service.resetTemplate();
    service.restoreDraft(draft);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives replacing the element with a stored version, published or draft', () => {
    const id = byKey('Group').id;
    service.replaceChildren([{ id, type: 'element', artifact: elementJson('Group', '1.3.0', 'bibo:published') }]);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
    service.replaceChildren([{ id, type: 'element', artifact: elementJson('Group', '0.0.2', 'bibo:draft') }]);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('survives upgrading a linked element, detaching it, and replacing it with its origin', () => {
    const v1 = 'https://repo.metadatacenter.org/template-elements/line-v1';
    const v2 = 'https://repo.metadatacenter.org/template-elements/line-v2';
    // Open a template that already links a published element, as a stored template would.
    const template: ContainerDraft = newContainer('template', 'Study');
    template.children = [fieldNode(textField('Title'))];
    service.loadTemplate(templateToJson(buildContainer(template)));
    service.importChildren(
      [{ type: 'element', artifact: elementJson('Linked', '1.0.0', 'bibo:published', v1) }],
      root().id,
      1,
    );
    const minted = iriAt(saved(), ['Linked'])!;
    expect(minted).toMatch(/^https:\/\/schema\.metadatacenter\.org\/properties\//);
    service.loadTemplate(saved());
    const linked = byKey('Linked').id;
    expect(versionState(root(), linked)).toEqual({ kind: 'linked', identifier: v1 });
    service.replaceChildren([
      { id: linked, type: 'element', artifact: elementJson('Linked', '2.0.0', 'bibo:published', v2) },
    ]);
    expect(versionState(root(), linked)).toEqual({ kind: 'linked', identifier: v2 });
    expect(iriAt(saved(), ['Linked'])).toBe(minted);
    expect(service.detachChild(linked)).toBe(true);
    expect(versionState(root(), linked)).toEqual({ kind: 'forked', origin: v2 });
    expect(iriAt(saved(), ['Linked'])).toBe(minted);
    service.replaceChildren([
      { id: linked, type: 'element', artifact: elementJson('Linked', '2.0.0', 'bibo:published', v2) },
    ]);
    expect(iriAt(saved(), ['Linked'])).toBe(minted);
  });

  it.each([false, true])('survives saving the element as a reusable artifact (publish %s)', async (publish) => {
    const versions = TestBed.inject(ChildVersionService);
    const source: CedChildSource = {
      search: async () => ({ results: [] }),
      load: async () => ({}),
      save: async (child, options) => ({
        ...child,
        '@id': 'https://repo.metadatacenter.org/template-elements/stored-1',
        'bibo:status': options.publish ? 'bibo:published' : 'bibo:draft',
      }),
    };
    service.childSource.set(source);
    TestBed.tick();
    await versions.save(byKey('Group').id, publish);
    expect(versions.failures().size).toBe(0);
    expect(iriAt(saved(), ['Group'])).toBe(P_GROUP);
  });

  it('is new for each insertion: an inline element, and the same library element inserted twice', () => {
    const inline = service.addElement(root().id);
    const artifact = elementJson('Group', '1.0.0', 'bibo:published');
    const [first, second] = service.importChildren(
      [
        { type: 'element', artifact },
        { type: 'element', artifact },
      ],
      root().id,
      0,
    );
    const iris = [inline, first, second].map((id) => iriAt(saved(), [service.childKey(id)]));
    for (const iri of iris) expect(iri).toMatch(/^https:\/\/schema\.metadatacenter\.org\/properties\//);
    expect(new Set([...iris, P_GROUP, P_OTHER]).size).toBe(5);
  });

  it('is new when an element is deleted and inserted again under the same key', () => {
    // Deleting a child is already a breaking change to the template, and keeping its IRI would mean
    // the designer remembering deleted children. The insertion is a new placement, so it gets one.
    const group = byKey('Group');
    const artifact = templateToJson(buildContainer(group.definition)) as CedJsonObject;
    expect(service.deleteChild(group.id)).toBe(true);
    const [again] = service.importChildren([{ type: 'element', artifact }], root().id, 1);
    expect(service.childKey(again)).toBe('Group');
    expect(iriAt(saved(), ['Group'])).not.toBe(P_GROUP);
  });
});
