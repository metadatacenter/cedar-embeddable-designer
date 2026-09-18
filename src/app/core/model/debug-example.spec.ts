import { describe, expect, it } from 'vitest';
import example from '../../../../public/examples/all-fields-nested.json';
import { ChildNode } from './container-draft';
import { FIELD_TYPES } from '../models/types';
import { buildContainer, readContainer } from './cedar-template';

describe('all-fields debugging example', () => {
  it('opens all palette types and retains authority fields in repeated nested sections', () => {
    const root = readContainer(example);
    expect(new Set(root.children.filter((n) => n.kind === 'field').map((n) => n.definition.type))).toEqual(
      new Set(Object.keys(FIELD_TYPES)),
    );
    expect(() => buildContainer(root)).not.toThrow();
    for (const node of root.children) {
      if (node.kind !== 'element') continue;
      const leaves = (nodes: ChildNode[]): ChildNode[] =>
        nodes.flatMap((n) => (n.kind === 'element' ? leaves(n.definition.children) : [n]));
      const fields = leaves(node.definition.children);
      for (const type of ['nihGrantId', 'doi']) {
        const found = fields.find((n) => n.kind === 'field' && n.definition.type === type);
        expect(found, `${node.definition.name}: ${type}`).toBeDefined();
        if (node.placement.deploymentName?.includes('multi') || node.definition.name.includes('multi')) {
          expect(found?.placement.allowMultiple).toBe(true);
        }
      }
    }
  });
});
