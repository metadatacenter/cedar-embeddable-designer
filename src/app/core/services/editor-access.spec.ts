import { signal } from '@angular/core';
import { EditorAccess } from './editor-access';
import { ContainerDraft, fieldNode, newNodeId } from '../model/container-draft';
import { newContainer, containerArtifactMetadata } from '../model/cedar-template';

function publish(container: ContainerDraft): void {
  container.metadata = {
    ...container.metadata,
    artifact: { ...containerArtifactMetadata(container), publicationStatus: 'bibo:published' },
    language: null,
    annotations: undefined,
    instanceType: null,
    header: null,
    footer: null,
  };
}

for (const kind of ['template', 'element'] as const)
  for (const hostReadOnly of [false, true])
    for (const rootPublished of [false, true])
      for (const depth of [0, 1, 3, 6])
        for (const ancestorPublished of depth ? [false, true] : [false])
          for (const childPublished of [false, true]) {
            it(`access matrix: ${kind}, host=${hostReadOnly}, root=${rootPublished}, depth=${depth}, ancestor=${ancestorPublished}, child=${childPublished}`, () => {
              const root = newContainer(kind, 'Root');
              let parent = root;
              for (let i = 0; i < depth; i++) {
                const nested = newContainer('element', `Level ${i}`);
                if (i === 0 && ancestorPublished) publish(nested);
                parent.children.push({
                  kind: 'element',
                  id: nested.id,
                  definition: nested,
                  placement: { allowMultiple: false },
                });
                parent = nested;
              }
              const child = fieldNode({
                id: newNodeId(),
                type: 'text',
                name: 'Value',
                status: 'optional',
                options: [],
                allowMultiple: false,
                defaultValue: { kind: 'none' },
                ...(childPublished ? { publishedDefinition: '{}' } : {}),
              });
              parent.children.push(child);
              if (rootPublished) publish(root);
              const access = new EditorAccess(signal(root));
              access.setHostReadOnly(hostReadOnly);
              const documentWritable = !hostReadOnly && !rootPublished;
              const placementWritable = documentWritable && !ancestorPublished;
              expect(access.readOnly()).toBe(!documentWritable);
              expect(access.canEditDefinition(root.id)).toBe(documentWritable);
              expect(access.canEditPlacement(root.id)).toBe(false);
              expect(access.canEditHeader(root.id)).toBe(documentWritable);
              expect(access.canEditPlacement(child.id)).toBe(placementWritable);
              expect(access.canEditDefinition(child.id)).toBe(placementWritable && !childPublished);
              expect(access.canChange(child.id, ['displayLabel', 'minItems'])).toBe(placementWritable);
              expect(access.canChange(child.id, ['defaultValue', 'displayLabel'])).toBe(
                placementWritable && !childPublished,
              );
              expect(access.canEditDefinition(-1)).toBe(false);
              expect(access.canEditPlacement(-1)).toBe(false);
              expect(access.canChange(-1, [])).toBe(false);
            });
          }

for (const hostReadOnly of [false, true])
  for (const published of [false, true]) {
    it(`standalone field: host=${hostReadOnly}, published=${published}`, () => {
      const root = newContainer('template', 'Synthetic parent');
      const child = fieldNode({
        id: newNodeId(),
        type: 'text',
        name: 'Value',
        status: 'optional',
        options: [],
        allowMultiple: false,
        defaultValue: { kind: 'none' },
        ...(published ? { publishedDefinition: '{}' } : {}),
      });
      root.children.push(child);
      const access = new EditorAccess(signal(root));
      access.fieldDocument.set(true);
      access.setHostReadOnly(hostReadOnly);
      expect(access.readOnly()).toBe(hostReadOnly || published);
      expect(access.canEditHeader(child.id)).toBe(!hostReadOnly && !published);
      expect(access.canEditPlacement(child.id)).toBe(false);
      access.setHostReadOnly(false);
      expect(access.canEditDefinition(child.id)).toBe(!published);
    });
  }
