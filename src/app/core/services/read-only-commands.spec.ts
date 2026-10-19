import { TestBed } from '@angular/core/testing';
import { TemplateService } from './template.service';
import { ElementNode, findContainer } from '../model/container-draft';
import { containerArtifactMetadata } from '../model/cedar-template';

const commands: Record<string, (s: TemplateService, field: number, section: ElementNode) => unknown> = {
  'rename definition': (s, f) => s.updateFieldName(f, 'Changed'),
  'rename display': (s, f) => s.updateFieldDisplayName(f, 'Changed'),
  description: (s, f) => s.updateHelpText(f, 'Changed'),
  'display description': (s, f) => s.updateFieldDisplayDescription(f, 'Changed'),
  default: (s, f) => s.updateDefaultValue(f, { kind: 'literal', value: 'Changed' }),
  requirement: (s, f) => s.updateFieldStatus(f, 'required'),
  multiplicity: (s, f) => s.toggleAllowMultiple(f),
  key: (s, f) => s.updateFieldSettings(f, { deploymentName: 'changed' }),
  annotations: (s, f) => s.updateFieldSettings(f, { annotations: [] }),
  constraints: (s, f) => s.updateFieldSettings(f, { textConstraints: { minLength: 3, maxLength: 10, regex: null } }),
  content: (s, f) => s.updateContent(f, 'Changed'),
  'option add': (s, f) => s.addOption(f),
  'option edit': (s, f) => s.updateOption(f, 0, 'Changed'),
  'option delete': (s, f) => s.deleteOption(f, 0),
  'field delete': (s, f) => s.deleteField(f),
  'child delete': (s, f) => s.deleteChild(f),
  'field add': (s, _f, section) => s.addField('text', 0, section.id),
  'element add': (s, _f, section) => s.addElement(section.id),
  'field reorder': (s) => s.moveField(0, 1),
  'child move': (s, f, section) => s.moveChild(f, section.id),
  'element name': (s, _f, section) => s.updateElementDisplayName(section, 'Changed'),
  'element definition': (s, _f, section) => s.updateContainerDefinition(section.id, { name: 'Changed' }),
  'element placement': (s, _f, section) => s.updateElementPlacement(section.id, { allowMultiple: true }),
  'root definition': (s) => s.updateContainerDefinition(s.session.document().id, { description: 'Changed' }),
  'open import': (s) => s.openChildPicker(),
};
for (const mode of ['host', 'published-template', 'published-element'] as const)
  for (const [name, command] of Object.entries(commands)) {
    it(`${mode} rejects ${name} without changing document, drafts or dirty state`, () => {
      const service = TestBed.inject(TemplateService);
      service.templateName.set('Study');
      const field = service.fields()[0].id;
      const sectionId = service.addElement();
      const section = service.session.document().children.find((n) => n.id === sectionId) as ElementNode;
      service.updateContainerDefinition(sectionId, { name: 'Section' });
      if (mode === 'host') service.validation.setReadOnly(true);
      else
        service.session.document.update((root) => ({
          ...root,
          kind: mode === 'published-element' ? 'element' : 'template',
          metadata: {
            ...root.metadata,
            artifact: { ...containerArtifactMetadata(root), publicationStatus: 'bibo:published' },
            language: null,
            annotations: undefined,
            instanceType: null,
            header: null,
            footer: null,
          },
        }));
      service.markSaved();
      const before = structuredClone(service.session.document());
      command(service, field, section);
      expect(service.session.document()).toEqual(before);
      expect(service.validation.hasPendingEdits()).toBe(false);
      expect(service.isDirty()).toBe(false);
      expect(service.validationReport().canSave).toBe(false);
      expect(service.childPicker()).toBeNull();
      // Reading and navigation must remain possible without altering any artifact bytes.
      service.openContainer(sectionId);
      service.toggleElement(sectionId);
      service.expandAllElements();
      service.collapseAllElements();
      expect(findContainer(service.session.document(), sectionId)).toBeDefined();
      expect(service.session.document()).toEqual(before);
    });
  }

it('preserves pending input across read-only, rejects new input, and never revives an old async intent', () => {
  const s = TestBed.inject(TemplateService);
  const id = s.fields()[0].id;
  s.updateFieldSettings(id, { textConstraints: { minLength: 5, maxLength: 2, regex: null } });
  const pending = s.validation.changes(id);
  const check = s.validation.beginCheck(id, 'defaultValue', 'Checking');
  s.validation.setReadOnly(true);
  expect(check.signal.aborted).toBe(true);
  expect(check.active()).toBe(false);
  s.validation.setInputError(id, 'defaultValue', 'New invalid input', 'Constraints', 'bad');
  expect(s.validation.inputValue(id, 'defaultValue')).toBeUndefined();
  expect(s.validation.changes(id)).toEqual(pending);
  s.validation.setReadOnly(false);
  expect(check.unchanged()).toBe(false);
  expect(s.validation.changes(id)).toEqual(pending);
});

it('does not reconcile an old pending edit into an incoming published document', () => {
  const s = TestBed.inject(TemplateService);
  const id = s.fields()[0].id;
  s.updateFieldSettings(id, { textConstraints: { minLength: null, maxLength: 2, regex: null } });
  s.updateDefaultValue(id, { kind: 'literal', value: 'ABC' });
  expect(s.validation.changes(id).defaultValue).toEqual({ kind: 'literal', value: 'ABC' });
  s.session.document.update((root) => ({
    ...root,
    metadata: {
      ...root.metadata,
      artifact: { ...containerArtifactMetadata(root), publicationStatus: 'bibo:published' },
      language: null,
      annotations: undefined,
      instanceType: null,
      header: null,
      footer: null,
    },
    children: root.children.map((child) =>
      child.id === id && child.kind === 'field'
        ? {
            ...child,
            definition: { ...child.definition, textConstraints: { minLength: null, maxLength: 3, regex: null } },
          }
        : child,
    ),
  }));
  expect(s.access.readOnly()).toBe(true);
  expect(s.fields()[0].defaultValue).toEqual({ kind: 'none' });
});
