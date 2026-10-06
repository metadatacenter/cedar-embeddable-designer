import { TestBed } from '@angular/core/testing';
import { CedarEmbeddableDesignerElementComponent } from './cedar-embeddable-designer.element';
import { CedarEmbeddableFieldDesignerElementComponent } from './cedar-embeddable-field-designer.element';

function mutate(value: object): void {
  const root = value as Record<string, unknown>;
  root['schema:name'] = 'Host changed the name';
  root['@id'] = 'urn:host';
  // Exercise nested ownership as well as the root object.
  const properties = root['properties'] as Record<string, unknown> | undefined;
  // Model-owned schema fragments can also be frozen; either isolation or refusal is safe.
  if (properties) Reflect.set(properties, '@context', null);
  root['_ui'] = { inputType: 'unknown' };
}

for (const kind of ['template', 'element', 'field'] as const)
  for (const channel of ['load', 'getter', 'event'] as const)
    it(`${kind}: mutation of the ${channel} snapshot cannot change the document, report or dirty state`, async () => {
      const fixture =
        kind === 'field'
          ? TestBed.createComponent(CedarEmbeddableFieldDesignerElementComponent)
          : TestBed.createComponent(CedarEmbeddableDesignerElementComponent);
      const element = fixture.componentInstance;
      if (element instanceof CedarEmbeddableFieldDesignerElementComponent) element.newArtifact('text');
      else {
        element.newArtifact(kind === 'element' ? 'element' : 'template');
        element.service.templateName.set('Study');
        element.service.addField('text', 0);
      }
      const service = element.service;
      service.updateFieldName(service.fields()[0].id, 'Value');
      const source = element.currentArtifact!;
      element.loadArtifact(source);
      fixture.detectChanges();
      await fixture.whenStable();
      const expected = structuredClone(element.currentArtifact);
      const report = element.validationReport;
      expect(element.isDirty).toBe(false);
      if (channel === 'load') mutate(source);
      if (channel === 'getter') mutate(element.currentArtifact!);
      if (channel === 'event') {
        let received = false;
        element.artifactChange.subscribe((artifact) => {
          received = true;
          mutate(artifact);
        });
        // Reloading a detached copy produces a fresh snapshot without a user edit.
        element.loadArtifact(structuredClone(expected)!);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(received).toBe(true);
      }
      expect(element.currentArtifact).toEqual(expected);
      expect(element.validationReport).toEqual(report);
      expect(element.isDirty).toBe(false);
      expect(element.canSave).toBe(true);
      service.updateFieldName(service.fields()[0].id, 'User edit');
      expect(element.isDirty).toBe(true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.currentArtifact).not.toEqual(expected);
      expect(element.canSave).toBe(true);
    });
