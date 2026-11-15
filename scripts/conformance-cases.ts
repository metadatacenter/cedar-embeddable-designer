// The gate drives the actual editor session, coordinator and serialization adapter.
import '@angular/compiler';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { Worker as Thread } from 'node:worker_threads';
import {
  buildContainer,
  newContainer,
  newFieldIdentity,
  templateToJson,
  fieldToJson,
  readContainer,
  allowsOptions,
} from '../src/app/core/model/cedar-template';
import { FIELD_DESCRIPTORS } from '../src/app/core/model/cedar-model/capabilities';
import { allowedInContainer, fieldNode, fieldView, ContainerDraft } from '../src/app/core/model/container-draft';
import { SHARED_CELLS, TYPE_CELLS, sharedField, typeField } from '../src/app/core/model/field-parameter-cases.testing';
import type { Field } from '../src/app/core/models/types';
import { EditorSession } from '../src/app/core/services/editor-session';
import { ValidationCoordinator } from '../src/app/core/services/validation-coordinator';
import { english } from '../src/app/i18n/messages';
export { CedarReaders, TemplateValueValidator, JsonSourcePolicy } from 'cedar-model-typescript-library';

/**
 * The designer checks a pattern in a browser worker, and Node has none, so every pattern would stay
 * unchecked and Save shut. This runs the same worker source, from the same object URL, on a thread.
 */
class ThreadWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  private thread?: Thread;
  private readonly waiting: unknown[] = [];
  private terminated = false;
  constructor(url: string) {
    void resolveObjectURL(url)!
      .text()
      .then((source) => {
        if (this.terminated) return;
        const thread = new Thread(
          `const { parentPort } = require('node:worker_threads');
          globalThis.postMessage = (data) => parentPort.postMessage(data);
          parentPort.on('message', (data) => globalThis.onmessage({ data }));
          ${source}`,
          { eval: true },
        );
        thread.unref();
        thread.on('message', (data) => this.onmessage?.({ data }));
        thread.on('error', (error) => this.onerror?.(error));
        this.thread = thread;
        for (const data of this.waiting.splice(0)) thread.postMessage(data);
      });
  }
  postMessage(data: unknown): void {
    if (this.thread) this.thread.postMessage(data);
    else this.waiting.push(data);
  }
  terminate(): void {
    this.terminated = true;
    void this.thread?.terminate();
  }
}
(globalThis as { Worker?: unknown }).Worker ??= ThreadWorker;

type Case = { name: string; kind: 'template' | 'element' | 'field'; artifact: unknown; saveable: boolean };
const field = (type: string): Field => ({
  id: 100000000,
  type,
  name: 'Value',
  status: 'optional',
  allowMultiple: false,
  options: allowsOptions(type) ? ['A', 'B'] : [],
  defaultValue: { kind: 'none' },
  ...newFieldIdentity(),
});
/** A container holding one field inside the given depth of nested elements. */
function holding(definition: Field, kind: 'template' | 'element', depth: number, multiple = false) {
  const root = newContainer(kind, 'Study');
  let parent = root;
  for (let level = 0; level < depth; level++) {
    const child = newContainer('element', `Level ${level}`);
    parent.children = [{ id: child.id, kind: 'element', definition: child, placement: { allowMultiple: multiple } }];
    parent = child;
  }
  parent.children = [fieldNode(definition)];
  return root;
}
function document(type: string, kind: 'template' | 'element', depth: number, multiple: boolean) {
  return holding(
    { ...field(type), allowMultiple: multiple && FIELD_DESCRIPTORS[type].deployment === 'plain' },
    kind,
    depth,
    multiple,
  );
}
export async function cases(): Promise<Case[]> {
  const rows: Case[] = [];
  async function inspect(name: string, root: ContainerDraft, standalone = false) {
    const session = new EditorSession(root),
      validation = new ValidationCoordinator(session, english);
    session.access.fieldDocument.set(standalone);
    try {
      await validation.settled();
      const report = validation.report();
      assert.equal(report.canSave, true, `${name}: ${JSON.stringify(report.issues)}`);
      const child = session.document().children[0];
      rows.push({
        name,
        kind: standalone ? 'field' : root.kind,
        saveable: true,
        artifact:
          standalone && child.kind === 'field'
            ? fieldToJson(fieldView(child))
            : templateToJson(buildContainer(session.document())),
      });
    } finally {
      validation.dispose();
    }
  }
  for (const type of Object.keys(FIELD_DESCRIPTORS)) {
    await inspect(`standalone:${type}`, document(type, 'template', 0, false), true);
    for (const kind of ['template', 'element'] as const)
      for (const depth of [0, 2, 5])
        for (const multiple of [false, true])
          await inspect(`${kind}:${type}:depth=${depth}:multiple=${multiple}`, document(type, kind, depth, multiple));
  }
  // A bare field proves its type is accepted, and a parameter can still be written in a shape Java
  // refuses. Each parameter the field matrices set, one at a time, goes to Java in a template, deep in
  // an element, and as a standalone field where it is not recorded by a parent.
  const parameterised = [
    ...SHARED_CELLS.map(({ paletteType, parameter }) => ({
      type: paletteType,
      name: parameter.name,
      definition: sharedField(paletteType, parameter),
      placement: !!parameter.placement,
    })),
    ...TYPE_CELLS.map(({ paletteType, parameter }) => ({
      type: paletteType,
      name: parameter,
      definition: typeField(paletteType, parameter),
      placement: false,
    })),
  ];
  for (const { type, name, definition, placement } of parameterised) {
    await inspect(`parameter:template:${type}:${name}`, holding(definition, 'template', 0));
    if (allowedInContainer(type, 'element'))
      await inspect(`parameter:element:${type}:${name}:depth=2`, holding(definition, 'element', 2));
    if (!placement) await inspect(`parameter:standalone:${type}:${name}`, holding(definition, 'template', 0), true);
  }
  // A picker must add distinct constraints. Duplicate classes were once accepted by
  // browser fixtures even though Java has always required uniqueItems here.
  const terms = document('controlledTerms', 'template', 0, false);
  const termField = terms.children[0];
  assert.equal(termField.kind, 'field');
  if (termField.kind === 'field') {
    termField.definition.controlledTermConstraints = {
      constraints: ['162', '4'].map((id) => ({
        sourceType: 'ontology-term',
        sourceId: `http://purl.obolibrary.org/obo/DOID_${id}`,
        sourceName: id === '162' ? 'cancer' : 'disease',
        ontologyId: 'DOID',
      })),
      actions: [],
    };
    await inspect('distinct-term-constraints', terms);
    const raw: any = templateToJson(buildContainer(terms));
    const classes = raw.properties.Value._valueConstraints.classes;
    classes.push(structuredClone(classes[0]));
    const session = new EditorSession(readContainer(raw));
    const validation = new ValidationCoordinator(session, english);
    try {
      await validation.settled();
      assert.equal(validation.report().canSave, false, 'duplicate constraints must block Save');
    } finally {
      validation.dispose();
    }
    rows.push({ name: 'negative:duplicate-constraints', kind: 'template', saveable: false, artifact: raw });
  }
  // Deterministic edit histories cover accepted values, pending invalid values and later repairs.
  let seed = 61741,
    blocked = 0;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let history = 0; history < 12; history++) {
    const session = new EditorSession(document('text', 'template', 0, false));
    const validation = new ValidationCoordinator(session, english);
    try {
      for (let step = 0; step < 24; step++) {
        const max = (next() % 8) + 1,
          length = next() % 12;
        validation.submit(
          100000000,
          { textConstraints: { minLength: null, maxLength: max, regex: null } },
          'textConstraints',
          'Constraints',
        );
        validation.submit(
          100000000,
          { defaultValue: { kind: 'literal', value: 'x'.repeat(length) } },
          'defaultValue',
          'Constraints',
        );
        await validation.settled();
        if (validation.report().canSave)
          rows.push({
            name: `history:${history}:${step}`,
            kind: 'template',
            saveable: true,
            artifact: templateToJson(buildContainer(session.document())),
          });
        else blocked++;
      }
      validation.submit(100000000, { defaultValue: { kind: 'literal', value: 'x' } }, 'defaultValue', 'Constraints');
      validation.submit(
        100000000,
        { textConstraints: { minLength: null, maxLength: 8, regex: null } },
        'textConstraints',
        'Constraints',
      );
      await validation.settled();
      assert.equal(validation.report().canSave, true, 'repair must reopen save');
    } finally {
      validation.dispose();
    }
  }
  assert.ok(blocked > 0, 'histories must exercise blocked transitions');
  // Reproductions of the review: imported language survives reading, and model-only validation
  // formerly admitted an occurrence count which Java's reader cannot represent.
  for (const [name, mutate] of [
    ['language', (value: any) => (value.properties.Value['@context']['@language'] = 'a b')],
    ['occurrences', (value: any) => (value.properties.Value.maxItems = 2147483648)],
  ] as const) {
    const raw: any = templateToJson(buildContainer(document('text', 'template', 0, name === 'occurrences')));
    mutate(raw);
    let validation: ValidationCoordinator | undefined;
    try {
      const session = new EditorSession(readContainer(raw));
      validation = new ValidationCoordinator(session, english);
      await validation.settled();
      assert.equal(validation.report().canSave, false, `${name} must block Save`);
    } catch (error) {
      if (name !== 'occurrences') throw error; // The strengthened model reader may refuse this before editing.
      assert.match(String(error), /2147483647|integer|occurrence/);
    } finally {
      validation?.dispose();
    }
    rows.push({ name: `negative:${name}`, kind: 'template', saveable: false, artifact: raw });
  }
  return rows;
}

export { SchemaArtifactValidator } from 'cedar-model-typescript-library/schema';
