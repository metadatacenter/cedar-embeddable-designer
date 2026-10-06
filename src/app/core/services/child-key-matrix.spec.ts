/**
 * A child's key, whichever way it gets one.
 *
 * A child's key is the property name its parent stores it under. It comes from the child's name
 * while the designer chooses it, stays fixed once the author chooses it, is minted afresh when a
 * child is imported, and travels with the child when it moves. Each of those paths decides the key
 * on its own, so each can produce a key the others would refuse: one a sibling already holds, one
 * the model reserves for CEDAR's own metadata, or one an attribute-value field cannot take because
 * its YAML form writes it beside its parent's metadata.
 *
 * The matrix crosses the kind of child, the container it sits in, the name or key it is given, and
 * the path. Every case asserts the key the path should produce, or that the path refuses, and then
 * the same four invariants of the whole document: keys are unique within each parent, every key
 * passes the key policy for its parent, the saved artifact stores each child under the key the
 * designer shows, and saving and reopening changes no key.
 */
import { TestBed } from '@angular/core/testing';
import { buildContainer, fieldToJson, newContainer, newFieldIdentity, templateToJson } from '../model/cedar-template';
import { childKeyError } from '../model/child-key-policy';
import { ChildNode, ContainerDraft, fieldNode, findContainer, newNodeId } from '../model/container-draft';
import { Field } from '../models/types';
import { TemplateService } from './template.service';

type Kind = 'a field' | 'an attribute-value field' | 'an element';
const KINDS: Kind[] = ['a field', 'an attribute-value field', 'an element'];
// Each container already holds a field called Taken, under the key taken.
const CONTAINERS = { 'the template root': 'Study', 'an element': 'Group', 'a nested element': 'Inner' } as const;
type Container = keyof typeof CONTAINERS;

function field(name: string, type = 'text', deploymentName?: string): Field {
  return {
    id: newNodeId(),
    ...newFieldIdentity(),
    type,
    name,
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: type === 'attributeValue',
    ...(deploymentName === undefined ? {} : { deploymentName }),
  };
}
function element(name: string, ...children: ChildNode[]): ChildNode {
  const definition = newContainer('element', name);
  definition.children = children;
  return {
    kind: 'element',
    id: definition.id,
    definition,
    placement: { deploymentName: name.toLowerCase(), allowMultiple: false },
  };
}
/** Study holds Taken and Group; Group holds Taken and Inner; Inner holds Taken. Elsewhere is empty. */
function study(): object {
  const root = newContainer('template', 'Study');
  const taken = () => fieldNode(field('Taken', 'text', 'taken'));
  root.children = [taken(), element('Group', taken(), element('Inner', taken())), element('Elsewhere')];
  return templateToJson(buildContainer(root));
}
function containerNamed(root: ContainerDraft, name: string): ContainerDraft | undefined {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = child.kind === 'element' ? containerNamed(child.definition, name) : undefined;
    if (found) return found;
  }
  return undefined;
}

/**
 * The key the designer should derive from a name, for each kind of child in each kind of parent:
 * lower case with underscores, a suffix past a key that is taken or reserved, and the kind's own
 * word for a name no suffix can repair.
 */
function derived(name: string, kind: Kind, parent: ContainerDraft['kind']): string {
  const attributeValue = kind === 'an attribute-value field';
  const table: Record<string, string> = {
    Sample: 'sample',
    'Sample ID': 'sample_id',
    Taken: 'taken_2',
    '@id': kind === 'an element' ? 'element' : 'field',
    'schema:name': 'schema:name_2',
    // A computed key, since a literal __proto__ key would set the table's prototype instead.
    ['__proto__']: '__proto___2',
    Échantillon: 'échantillon',
    // An attribute-value field's YAML sits beside its parent's metadata, and a template has more of it.
    annotations: attributeValue && parent === 'template' ? 'annotations_2' : 'annotations',
    name: attributeValue ? 'name_2' : 'name',
  };
  return table[name];
}
const NAMES = ['Sample', 'Sample ID', 'Taken', '@id', 'schema:name', '__proto__', 'Échantillon', 'annotations', 'name'];

/** A key the author types, and whether the policy for that child in that parent accepts it. */
const KEYS: { key: string; accepted: (kind: Kind, parent: ContainerDraft['kind']) => boolean; stored?: string }[] = [
  { key: 'chosen', accepted: () => true },
  { key: 'with space', accepted: () => true },
  { key: '  padded  ', accepted: () => true, stored: 'padded' },
  { key: 'taken', accepted: () => false },
  { key: '', accepted: () => false },
  { key: '   ', accepted: () => false },
  { key: '@id', accepted: () => false },
  { key: 'schema:name', accepted: () => false },
  { key: '__proto__', accepted: () => false },
  { key: 'annotations', accepted: (kind, parent) => kind !== 'an attribute-value field' || parent === 'element' },
  { key: 'name', accepted: (kind) => kind !== 'an attribute-value field' },
];

describe('child keys', () => {
  let service: TemplateService;
  beforeEach(() => {
    service = TestBed.inject(TemplateService);
    service.loadTemplate(study());
  });
  const container = (name: string) => containerNamed(service.document(), name)!;

  function add(kind: Kind, target: ContainerDraft): number {
    if (kind === 'an element') return service.addElement(target.id);
    service.addField(kind === 'a field' ? 'text' : 'attributeValue', Number.MAX_SAFE_INTEGER, target.id);
    return findContainer(service.document(), target.id)!.children.at(-1)!.id;
  }
  function rename(kind: Kind, id: number, name: string): void {
    if (kind === 'an element') service.updateContainerDefinition(id, { name });
    else service.updateFieldName(id, name);
  }
  function setKey(kind: Kind, id: number, key: string): string | null {
    return kind === 'an element'
      ? service.updateElementPlacement(id, { deploymentName: key }, 'key', 'Configuration')
      : service.updateFieldSettings(id, { deploymentName: key });
  }
  function artifact(kind: Kind, name: string): { type: 'field' | 'element'; artifact: never } {
    if (kind === 'an element') {
      const definition = newContainer('element', name);
      definition.children = [fieldNode(field('Inside'))];
      return { type: 'element', artifact: templateToJson(buildContainer(definition)) as never };
    }
    return {
      type: 'field',
      artifact: fieldToJson(field(name, kind === 'a field' ? 'text' : 'attributeValue')) as never,
    };
  }

  /** Each container's children as the designer keys them, recursively. */
  type KeyTree = [string, KeyTree | null][];
  const keyTree = (from: ContainerDraft): KeyTree =>
    from.children.map((child) => [
      service.childKey(child.id),
      child.kind === 'element' ? keyTree(child.definition) : null,
    ]);
  /** The same tree as the saved artifact stores it. */
  const storedTree = (node: Record<string, unknown>): KeyTree =>
    ((node['_ui'] as { order: string[] }).order ?? []).map((key) => {
      const property = (node['properties'] as Record<string, Record<string, unknown>>)[key];
      const child = (property['items'] ?? property) as Record<string, unknown>;
      return [
        key,
        child['@type'] === 'https://schema.metadatacenter.org/core/TemplateElement' ? storedTree(child) : null,
      ];
    });

  function expectSoundKeys(): void {
    const walk = (from: ContainerDraft) => {
      const keys = from.children.map((child) => service.childKey(child.id));
      expect(new Set(keys).size, `keys in ${from.name}`).toBe(keys.length);
      from.children.forEach((child, index) => {
        const attributeValue = child.kind === 'field' && child.definition.type === 'attributeValue';
        expect(childKeyError(keys[index], attributeValue, undefined, from.kind), `key ${keys[index]}`).toBeNull();
        if (child.kind === 'element') walk(child.definition);
      });
    };
    walk(service.document());
    const before = keyTree(service.document());
    expect(storedTree(service.templateJson() as Record<string, unknown>)).toEqual(before);
    service.loadTemplate(service.templateJson());
    expect(keyTree(service.document())).toEqual(before);
  }

  const cross = <T>(values: readonly T[]) =>
    KINDS.flatMap((kind) =>
      (Object.keys(CONTAINERS) as Container[]).flatMap((where) => values.map((value) => [kind, where, value] as const)),
    );

  it.each(cross(NAMES))('%s added to %s and named %j takes the key its name gives', (kind, where, name) => {
    const target = container(CONTAINERS[where]);
    const id = add(kind, target);
    rename(kind, id, name);
    expect(service.childKey(id)).toBe(derived(name, kind, target.kind));
    expectSoundKeys();
  });

  // A child added and not yet named holds a key all the same, and it must be one the policy accepts.
  it.each(KINDS.flatMap((kind) => (Object.keys(CONTAINERS) as Container[]).map((where) => [kind, where] as const)))(
    '%s added to %s and left unnamed takes its kind as its key',
    (kind, where) => {
      const target = container(CONTAINERS[where]);
      const first = add(kind, target);
      const second = add(kind, container(CONTAINERS[where]));
      const word = kind === 'an element' ? 'element' : 'field';
      expect([service.childKey(first), service.childKey(second)]).toEqual([word, `${word}_2`]);
      expectSoundKeys();
    },
  );

  it.each(cross(NAMES))('%s in %s renamed to %j has its key follow the name', (kind, where, name) => {
    const target = container(CONTAINERS[where]);
    const id = add(kind, target);
    rename(kind, id, 'First');
    expect(service.childKey(id)).toBe('first');
    rename(kind, id, name);
    expect(service.childKey(id)).toBe(derived(name, kind, target.kind));
    expectSoundKeys();
  });

  it.each(cross(NAMES))('%s in %s given a key keeps it when renamed to %j', (kind, where, name) => {
    const id = add(kind, container(CONTAINERS[where]));
    rename(kind, id, 'First');
    expect(setKey(kind, id, 'chosen')).toBeNull();
    rename(kind, id, name);
    expect(service.childKey(id)).toBe('chosen');
    expectSoundKeys();
  });

  it.each(cross(NAMES))('%s imported into %s and named %j takes the key its name gives', (kind, where, name) => {
    const target = container(CONTAINERS[where]);
    service.importChildren([artifact(kind, name)], target.id, target.children.length);
    const id = findContainer(service.document(), target.id)!.children.at(-1)!.id;
    expect(service.childKey(id)).toBe(derived(name, kind, target.kind));
    expectSoundKeys();
  });

  it.each(cross(KEYS))('%s in %s keyed %j', (kind, where, { key, accepted, stored }) => {
    const target = container(CONTAINERS[where]);
    const id = add(kind, target);
    rename(kind, id, 'Sample');
    const error = setKey(kind, id, key);
    if (accepted(kind, target.kind)) {
      expect(error).toBeNull();
      expect(service.childKey(id)).toBe(stored ?? key);
      expect(service.validationReport().canSave).toBe(true);
    } else {
      // The edit is held, the key stays what it was, and Save says why it is refused.
      expect(error).toEqual(expect.any(String));
      expect(service.childKey(id)).toBe('sample');
      expect(service.validationReport().canSave).toBe(false);
      setKey(kind, id, 'sample');
      expect(service.validationReport().canSave).toBe(true);
    }
    expectSoundKeys();
  });

  it.each(cross(NAMES))('%s moved from elsewhere into %s after being named %j', (kind, where, name) => {
    const source = container('Elsewhere');
    const target = container(CONTAINERS[where]);
    const id = add(kind, source);
    rename(kind, id, name);
    const key = derived(name, kind, 'element');
    expect(service.childKey(id)).toBe(name === 'Taken' ? 'taken' : key);
    service.moveChild(id, target.id);
    // A key the destination already holds, or reserves, refuses the move; the child stays put.
    const attributeValue = kind === 'an attribute-value field';
    const refused = name === 'Taken' || !!childKeyError(service.childKey(id), attributeValue, undefined, target.kind);
    const parent = refused ? source : target;
    expect(findContainer(service.document(), parent.id)!.children.some((child) => child.id === id)).toBe(true);
    expect(service.loadError()).toEqual(refused ? expect.any(String) : null);
    expect(service.childKey(id)).toBe(name === 'Taken' ? 'taken' : key);
    expectSoundKeys();
  });
});
