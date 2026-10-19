import { describe, it, expect } from 'vitest';
import {
  buildContainer,
  newContainer,
  readContainer,
  templateToJson,
  templateToYaml,
  readTemplate,
  containerPreview,
  PREVIEW_ELEMENT_KEY,
} from './cedar-template';
import { fieldNode, newNodeId } from './container-draft';

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;
function treeShape(node: Record<string, unknown>): object {
  const properties = node['properties'] as Record<string, Record<string, unknown>> | undefined;
  const order = (node['_ui'] as { order?: string[] } | undefined)?.order ?? [];
  return {
    type: node['@type'],
    name: node['schema:name'],
    children: order.map((key) => {
      const property = properties![key];
      const child = (property['items'] ?? property) as Record<string, unknown>;
      return {
        key,
        multiple: property['type'] === 'array',
        min: property['minItems'] ?? null,
        max: property['maxItems'] ?? null,
        content: treeShape(child),
      };
    }),
  };
}
describe('recursive container codec', () => {
  for (const [path, module] of Object.entries(corpus)) {
    const source = module.default;
    it(`preserves fields and nested elements in ${path}`, () => {
      const before = templateToJson(readTemplate(source as object));
      const draft = readContainer(source as object);
      // Serialization retains imported defaults; asynchronous validation owns save eligibility.
      const first = templateToJson(buildContainer(draft));
      expect(treeShape(first)).toEqual(treeShape(before));
      expect(first['_ui']).toEqual(before['_ui']);
      expect(Object.keys(first['properties'] as object)).toEqual(Object.keys(before['properties'] as object));
      expect(templateToJson(buildContainer(readContainer(first)))).toEqual(first);
    });
  }
  it.each(['text', 'paragraph'])(
    'round-trips nested repeated %s with length bounds and element cardinality',
    (type) => {
      const root = newContainer('element', 'Study');
      root.preferredLabel = 'Study label';
      root.alternateLabels = ['Alternative'];
      const child = newContainer('element', 'Sample');
      child.children.push(
        fieldNode({
          id: newNodeId(),
          name: 'Title',
          type,
          textConstraints: { minLength: 2, maxLength: 40, regex: null },
          minItems: 1,
          maxItems: 3,
          status: 'required',
          allowMultiple: true,
          options: [],
          defaultValue: { kind: 'literal', value: 'Default' },
        }),
      );
      root.children.push({
        id: child.id,
        kind: 'element',
        definition: child,
        placement: {
          deploymentName: 'sample',
          allowMultiple: true,
          minItems: 2,
          maxItems: 4,
          displayLabel: 'Samples',
          propertyIri: 'urn:sample',
        },
      });
      const model = buildContainer(root);
      const json = templateToJson(model);
      expect(json['@type']).toBe('https://schema.metadatacenter.org/core/TemplateElement');
      for (const source of [json, JSON.stringify(json), templateToYaml(model)]) {
        expect(templateToJson(buildContainer(readContainer(source)))).toEqual(json);
      }
      const preview = templateToJson(containerPreview(root));
      expect(preview['@type']).toBe('https://schema.metadatacenter.org/core/Template');
      expect((preview['properties'] as Record<string, unknown>)[PREVIEW_ELEMENT_KEY]).toEqual(json);
    },
  );
});

it('does not trim non-JSON whitespace before strict source parsing', () => {
  const json = JSON.stringify(templateToJson(buildContainer(newContainer('template', 'Whitespace'))));
  for (const padding of ['\u00a0', '\ufeff', '\u001c']) {
    expect(() => readContainer(padding + json)).toThrow();
    expect(() => readTemplate(json + padding)).toThrow();
  }
  expect(readContainer(' \t\r\n' + json).name).toBe('Whitespace');
});
