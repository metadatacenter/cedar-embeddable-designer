import { describe, expect, it } from 'vitest';
import { EditorSession } from '../services/editor-session';
import { buildContainer, newContainer, templateToJson, templateToYaml, readContainer } from './cedar-template';
import { ContainerDraft, fieldNode, moveChild } from './container-draft';
import { Command, commands, checkHistory, historySeeds } from '../../../testing/seeded-history';

interface Row {
  parent: number | null;
  children: number[];
  name: string;
  element: boolean;
  value: string | null;
}

// A flat adjacency table is the reference model. It does not use production tree
// traversal, mutation, placement or serialization to calculate expected edits.
function replay(history: Command[]): void {
  const root = newContainer('template', 'Root');
  root.id = 0;
  const session = new EditorSession(root);
  const rows = new Map<number, Row>([[0, { parent: null, children: [], name: 'Root', element: true, value: null }]]);
  let serial = 0;
  const choose = (ids: number[], token: number) => ids[token % ids.length];
  const remove = (id: number) => {
    const row = rows.get(id)!;
    for (const child of row.children) remove(child);
    rows.delete(id);
  };
  const observe = (container: ContainerDraft, parent: number | null = null): Map<number, Row> => {
    const result = new Map<number, Row>();
    const visit = (node: ContainerDraft, owner: number | null) => {
      expect(result.has(node.id), 'unique occurrence identity').toBe(false);
      result.set(node.id, {
        parent: owner,
        children: node.children.map((c) => c.id),
        name: node.name,
        element: true,
        value: null,
      });
      for (const child of node.children) {
        if (child.kind === 'element') visit(child.definition, node.id);
        else {
          expect(result.has(child.id), 'unique field identity').toBe(false);
          const value = child.definition.defaultValue;
          result.set(child.id, {
            parent: node.id,
            children: [],
            name: child.definition.name,
            element: false,
            value: value.kind === 'literal' ? value.value : null,
          });
          expect(child.placement.deploymentName, 'stable property key').toBe(`key${child.id}`);
          expect(child.placement.propertyIri, 'stable property IRI').toBe(`urn:field:${child.id}`);
        }
      }
    };
    visit(container, parent);
    return result;
  };
  for (const command of history) {
    const snapshot = session.document();
    const frozen = JSON.stringify(snapshot);
    const containers = [...rows.keys()].filter((id) => rows.get(id)!.element);
    const fields = [...rows.keys()].filter((id) => !rows.get(id)!.element);
    const children = [...rows.keys()].filter((id) => id !== 0);
    const target = choose(containers, command.a);
    session.activeId.set(target);
    if (command.op <= 1 && rows.size < 60) {
      const id = ++serial;
      const name = `Node ${id}`;
      const element = command.op === 1;
      const position = command.c % (rows.get(target)!.children.length + 1);
      session.update((container) => {
        const next = [...container.children];
        const definition = { ...newContainer('element', name), id };
        next.splice(
          position,
          0,
          element
            ? {
                id,
                kind: 'element',
                definition,
                placement: { allowMultiple: true, deploymentName: `key${id}`, propertyIri: `urn:element:${id}` },
              }
            : fieldNode({
                id,
                name,
                type: 'text',
                deploymentName: `key${id}`,
                propertyIri: `urn:field:${id}`,
                status: 'optional',
                allowMultiple: false,
                options: [],
                defaultValue: { kind: 'none' },
              }),
        );
        return { ...container, children: next };
      });
      rows.set(id, { parent: target, children: [], name, element, value: null });
      rows.get(target)!.children.splice(position, 0, id);
    } else if (command.op === 2) {
      const name = `Renamed ${command.b}`;
      session.property('name').set(name);
      rows.get(target)!.name = name;
    } else if (command.op === 3 && fields.length) {
      const id = choose(fields, command.b);
      const row = rows.get(id)!;
      const value = command.c % 3 ? `value:${command.c}` : null;
      session
        .fieldBinding(row.parent!)
        .update((fields) =>
          fields.map((f) =>
            f.id === id ? { ...f, defaultValue: value === null ? { kind: 'none' } : { kind: 'literal', value } } : f,
          ),
        );
      row.value = value;
    } else if (command.op === 4 && children.length) {
      const id = choose(children, command.b);
      let ancestor: number | null = target;
      let forbidden = false;
      while (ancestor !== null) {
        if (ancestor === id) forbidden = true;
        ancestor = rows.get(ancestor)!.parent;
      }
      if (forbidden) expect(() => moveChild(snapshot, id, target, command.c % 8), 'reject cycles').toThrow();
      else {
        session.document.set(moveChild(snapshot, id, target, command.c % 8));
        const row = rows.get(id)!;
        const siblings = rows.get(row.parent!)!.children;
        siblings.splice(siblings.indexOf(id), 1);
        const destination = rows.get(target)!.children;
        destination.splice(Math.min(command.c % 8, destination.length), 0, id);
        row.parent = target;
      }
    } else if (command.op === 5 && children.length) {
      const id = choose(children, command.b);
      const parent = rows.get(id)!.parent!;
      session.activeId.set(parent);
      session.update((container) => ({
        ...container,
        children: container.children.filter((child) => child.id !== id),
      }));
      rows.get(parent)!.children = rows.get(parent)!.children.filter((child) => child !== id);
      remove(id);
    } else if (command.op === 6 && fields.length && rows.size < 60) {
      const source = choose(fields, command.b);
      const row = rows.get(source)!;
      const id = ++serial;
      const sourceView = session
        .fieldBinding(row.parent!)()
        .find((f) => f.id === source)!;
      session
        .fieldBinding(target)
        .update((fields) => [
          ...fields,
          { ...structuredClone(sourceView), id, deploymentName: `key${id}`, propertyIri: `urn:field:${id}` },
        ]);
      rows.set(id, { ...row, parent: target, children: [] });
      rows.get(target)!.children.push(id);
    } else if (command.op === 7) {
      // Swapping field views retains element positions in a mixed list.
      session.fieldBinding().update((fields) => [...fields].reverse());
      const row = rows.get(target)!;
      const reversed = row.children.filter((id) => !rows.get(id)!.element).reverse();
      row.children = row.children.map((id) => (rows.get(id)!.element ? id : reversed.shift()!));
    } else if (command.op === 8 && children.length) {
      expect(() => moveChild(snapshot, choose(children, command.b), -1, 0), 'reject missing destination').toThrow();
    } else if (command.op === 10 && fields.length) {
      const id = choose(fields, command.b);
      const row = rows.get(id)!;
      const name = ['Renamed', 'on', 'a:b', 'Δοκιμή 😃', 'a "quoted" name'][command.c % 5];
      session.fieldBinding(row.parent!).update((fields) => fields.map((f) => (f.id === id ? { ...f, name } : f)));
      row.name = name;
    } else if (command.op === 9) {
      const json = templateToJson(buildContainer(snapshot));
      for (const source of [json, templateToYaml(buildContainer(snapshot))]) {
        expect(templateToJson(buildContainer(readContainer(source))), 'codec preserves current document').toEqual(json);
      }
    }
    expect(JSON.stringify(snapshot), 'previous snapshot must not mutate').toBe(frozen);
    expect(observe(session.document()), 'document matches independent model after every command').toEqual(rows);
    expect(session.active().id, 'navigation resolves a live container').toBe(session.activeId());
  }
}

describe('seeded CED editing histories', () => {
  it.each(historySeeds())('seed %i', (seed) => {
    checkHistory(seed, commands(seed, 60, 11), replay);
  });
  it('shrinks a failure while retaining the original assertion', () => {
    expect(() =>
      checkHistory(7, [0, 1, 2, 3], (history) => {
        if (history.includes(2)) throw new Error('the defect');
      }),
    ).toThrow('reduced from 4 to 1 commands:\n[2]');
  });
});
