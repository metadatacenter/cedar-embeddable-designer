import { describe, it, expect } from 'vitest';
import {
  buildContainer,
  newContainer,
  readContainer,
  templateToJson,
  templateToYaml,
  readTemplate,
  containerPreview,
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
      // One known corpus field has a default inconsistent with its own regex.
      if (JSON.stringify(source).includes('"regex"')) {
        try {
          buildContainer(draft);
        } catch (error) {
          expect(String(error)).toMatch(/default/i);
          return;
        }
      }
      const first = templateToJson(buildContainer(draft));
      expect(treeShape(first)).toEqual(treeShape(before));
      expect(first['_ui']).toEqual(before['_ui']);
      expect(Object.keys(first['properties'] as object)).toEqual(Object.keys(before['properties'] as object));
      expect(templateToJson(buildContainer(readContainer(first)))).toEqual(first);
    });
  }
  it('round-trips a standalone element with nested cardinality, labels, and provenance', () => {
    const root = newContainer('element', 'Study');
    root.preferredLabel = 'Study label';
    root.alternateLabels = ['Alternative'];
    const child = newContainer('element', 'Sample');
    child.children.push(
      fieldNode({
        id: newNodeId(),
        name: 'Title',
        type: 'text',
        status: 'required',
        allowMultiple: false,
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
        status: 'required',
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
    expect((preview['properties'] as Record<string, unknown>)['Study']).toEqual(json);
  });
});
