/**
 * The Version tab as an author reads it: its rows, its sentences and its buttons.
 *
 * The matrix crosses each state a child can be in with what the host answers and what it can do,
 * and asserts the buttons the tab renders, by their labels. The remaining cases cover the tab of
 * the document itself, a published document, a standalone field, and the settings panels that
 * now carry the tab while their Metadata tabs no longer show a version or a publication status.
 */
import { TestBed } from '@angular/core/testing';
import type { CedArtifactVersion, CedChildSource, CedCompatibility, CedJsonObject } from '../../ced-public-api';
import {
  buildContainer,
  fieldToJson,
  newContainer,
  newFieldIdentity,
  templateToJson,
} from '../../core/model/cedar-template';
import { fieldNode, newNodeId } from '../../core/model/container-draft';
import { Field } from '../../core/models/types';
import { ChildVersionService } from '../../core/services/child-versions.service';
import { TemplateService } from '../../core/services/template.service';
import { ContainerSettingsComponent } from '../container-settings/container-settings.component';
import { ElementCardComponent } from '../element-card/element-card.component';
import { FieldSettingsComponent } from '../field-settings/field-settings.component';
import { VersionPanelComponent } from './version-panel.component';

const iri = (name: string) => `https://repo.metadatacenter.org/template-fields/${name}`;

function textField(name: string): Field {
  return {
    id: newNodeId(),
    ...newFieldIdentity(),
    type: 'text',
    name,
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
  };
}

function fieldArtifact(id: string, version: string, published: boolean): CedJsonObject {
  const json = fieldToJson({ ...textField('Sample'), atId: iri(id) }) as CedJsonObject;
  return { ...json, 'pav:version': version, 'bibo:status': published ? 'bibo:published' : 'bibo:draft' };
}

function publishedElement(): CedJsonObject {
  const definition = newContainer('element', 'Group');
  definition.children = [fieldNode(textField('Inner'))];
  const json = templateToJson(buildContainer(definition)) as CedJsonObject;
  return { ...json, 'pav:version': '1.2.0', 'bibo:status': 'bibo:published' };
}

interface Host {
  readonly newer: boolean;
  readonly verdict: CedCompatibility | 'none';
  readonly open: boolean;
  readonly save: boolean;
  readonly readable?: boolean;
}

function host({ newer, verdict, open, save, readable = true }: Host): CedChildSource {
  const artifacts: Record<string, CedJsonObject> = {
    [iri('v110')]: fieldArtifact('v110', '1.1.0', true),
    [iri('v120')]: fieldArtifact('v120', '1.2.0', true),
    [iri('v130')]: fieldArtifact('v130', '1.3.0', true),
  };
  const listed = (newer ? ['v130', 'v120', 'v110'] : ['v120', 'v110']).map((id): CedArtifactVersion => ({
    id: iri(id),
    name: 'Sample',
    version: artifacts[iri(id)]['pav:version'] as string,
    publicationStatus: 'bibo:published',
    owner: 'test1',
    folder: 'Shared',
  }));
  return {
    search: async () => ({ results: [] }),
    load: async (result) => artifacts[result.id],
    versions: async () => (readable ? listed : null),
    ...(verdict === 'none' ? {} : { compatibility: async () => verdict }),
    ...(open ? { open: () => undefined } : {}),
    ...(save ? { save: async (child) => ({ ...child, '@id': iri('stored') }) } : {}),
  };
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('the Version tab', () => {
  let service: TemplateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
    TestBed.inject(ChildVersionService);
  });

  async function panel(nodeId: number) {
    const fixture = TestBed.createComponent(VersionPanelComponent);
    fixture.componentRef.setInput('nodeId', nodeId);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const text = (selector: string) => [...element.querySelectorAll(selector)].map((node) => node.textContent!.trim());
    return {
      fixture,
      element,
      buttons: () => text('.version-actions button'),
      notes: () => text('.version-note'),
      rows: () =>
        Object.fromEntries(
          [...element.querySelectorAll(':scope > dl.identity > dt')].map((dt) => [
            dt.textContent!.trim(),
            dt.nextElementSibling!.textContent!.trim().replace(/\s+/g, ' '),
          ]),
        ),
    };
  }

  function importInto(json: CedJsonObject, type: 'field' | 'element' = 'field'): number {
    const [id] = service.importChildren([{ type, artifact: json }], service.session.document().id, 0);
    return id;
  }

  describe('the buttons of a linked child', () => {
    const VERDICTS: Array<[string, Host['verdict']]> = [
      ['no verdict', 'none'],
      ['compatible', { compatible: true }],
      ['breaking', { compatible: false, invalidatedInstances: 0 }],
      ['unknown impact', { compatible: false }],
      ['breaking with instances', { compatible: false, invalidatedInstances: 2 }],
    ];
    const cases = [true, false].flatMap((newer) =>
      VERDICTS.flatMap(([name, verdict]) =>
        [true, false].flatMap((open) =>
          [true, false].map((readOnly) => [newer, name, verdict, open, readOnly] as const),
        ),
      ),
    );
    it.each(cases)(
      'newer version %s, %s, host opens %s, read only %s',
      async (newer, name, verdict, open, readOnly) => {
        service.childSource.set(host({ newer, verdict, open, save: true }));
        const id = importInto(fieldArtifact('v120', '1.2.0', true));
        service.validation.setReadOnly(readOnly);
        const tab = await panel(id);
        const upgrade =
          newer && name !== 'breaking with instances' && name !== 'unknown impact' && !readOnly
            ? [
                name === 'compatible'
                  ? 'Upgrade to v1.3.0 (compatible)'
                  : name === 'breaking'
                    ? 'Upgrade to v1.3.0 (breaking)'
                    : 'Upgrade to v1.3.0',
              ]
            : [];
        expect(tab.buttons()).toEqual([
          ...(open ? ['Open original'] : []),
          ...upgrade,
          ...(readOnly ? [] : ['Detach to edit']),
        ]);
        expect(tab.rows()).toMatchObject({
          Version: '1.2.0',
          'Publication status': 'Published',
          Reuse: 'Linked',
          Owner: 'test1',
          Folder: 'Shared',
        });
        expect(tab.notes()[0]).toBe('This is Sample v1.2.0.');
        if (!newer) expect(tab.notes()).toContain('No newer published version is available.');
        if (newer && name === 'unknown impact')
          expect(tab.notes()).toContain('Whether it is compatible could not be checked.');
        if (newer && name === 'breaking with instances')
          expect(tab.notes()).toContain(
            'Upgrading would invalidate 2 instances of this template. Create a new version of the template to upgrade.',
          );
      },
    );
  });

  describe('the buttons of a copy', () => {
    const cases = [true, false].flatMap((save) =>
      [true, false].flatMap((readable) => [true, false].map((readOnly) => [save, readable, readOnly] as const)),
    );
    it.each(cases)('host saves %s, origin readable %s, read only %s', async (save, readable, readOnly) => {
      service.childSource.set(host({ newer: true, verdict: { compatible: true }, open: true, save, readable }));
      const id = importInto({ ...fieldArtifact('v110', '1.1.0', false) });
      service.validation.setReadOnly(readOnly);
      const tab = await panel(id);
      expect(tab.buttons()).toEqual([
        ...(readable && !readOnly ? ['Replace with origin v1.3.0 (compatible)'] : []),
        ...(save && !readOnly ? ['Save as reusable draft', 'Publish as reusable'] : []),
      ]);
      expect(tab.rows()).toMatchObject({
        Version: '0.0.1',
        'Publication status': 'Draft',
        Reuse: 'Copy',
        'Derived from': iri('v110'),
      });
      expect(tab.notes()[0]).toBe(readable ? 'Derived from Sample v1.1.0.' : `Derived from ${iri('v110')}.`);
      // The owner and folder are the origin's, not the copy's, so a copy shows neither.
      expect(tab.rows()).not.toHaveProperty('Owner');
      if (readable) expect(tab.notes()[1]).toBe("The origin's newest available published version is v1.3.0.");
      if (!readable)
        expect(tab.notes()).toContain(
          'The origin cannot be read. It may have been deleted, or you may not have access to it.',
        );
    });

    it('asks before replacing a copy, and replaces it only once the author confirms', async () => {
      service.childSource.set(host({ newer: true, verdict: { compatible: true }, open: false, save: false }));
      const id = importInto({ ...fieldArtifact('v110', '1.1.0', false) });
      const tab = await panel(id);
      const dialog = tab.element.querySelector('dialog') as HTMLDialogElement;
      dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
      dialog.close = vi.fn(() => dialog.removeAttribute('open'));
      (tab.element.querySelector('.version-actions button') as HTMLButtonElement).click();
      expect(dialog.showModal).toHaveBeenCalled();
      expect(dialog.textContent).toContain(
        'Sample will use the published Sample v1.3.0. The changes made here will be lost.',
      );
      expect(service.session.document().children[0].definition).toMatchObject({ artifact: { version: '0.0.1' } });
      (dialog.querySelector('.primary') as HTMLButtonElement).click();
      await settle();
      expect(service.session.document().children[0].definition).toMatchObject({ atId: iri('v130') });
    });
  });

  it.each([true, false])(
    'offers a local child Save and Publish only when the host can store, here %s',
    async (save) => {
      service.childSource.set(host({ newer: false, verdict: 'none', open: true, save }));
      const tab = await panel(service.fields()[0].id);
      expect(tab.buttons()).toEqual(save ? ['Save as reusable draft', 'Publish as reusable'] : []);
      expect(tab.rows()).toEqual({ Version: 'Not versioned', Reuse: 'Made here' });
      expect(tab.notes()).toEqual(['It is not stored as a reusable artifact.']);
    },
  );

  it('offers nothing for a child inside a linked element, and says why', async () => {
    service.childSource.set(host({ newer: true, verdict: { compatible: true }, open: true, save: true }));
    const elementId = importInto(publishedElement(), 'element');
    const element = service.session.document().children.find((node) => node.id === elementId)!;
    const inner = element.kind === 'element' ? element.definition.children[0] : element;
    const tab = await panel(inner.id);
    expect(tab.buttons()).toEqual([]);
    expect(tab.rows()).toMatchObject({ Reuse: 'Part of a linked element' });
    expect(tab.notes()[0]).toBe('Part of Group v1.2.0. It changes only when that element is upgraded.');
  });

  it("summarizes the document's linked and copied children and upgrades the compatible ones", async () => {
    service.childSource.set(host({ newer: true, verdict: { compatible: true }, open: false, save: false }));
    importInto(fieldArtifact('v120', '1.2.0', true));
    const tab = await panel(service.session.document().id);
    expect(tab.element.querySelector('.version-caption')?.textContent?.trim()).toBe('Linked and copied children');
    const summary = tab.element.querySelectorAll('dl.identity')[1];
    expect(summary.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Linked, v1.2.0. The newest available published version is v1.3.0. It is compatible: every instance that is valid now stays valid.',
    );
    expect(tab.buttons()).toEqual(['Upgrade all compatible']);
    (tab.element.querySelector('.version-actions button') as HTMLButtonElement).click();
    await settle();
    expect(service.session.document().children[0].definition).toMatchObject({ atId: iri('v130') });
  });

  it('says a document without linked or copied children has none to summarize', async () => {
    const tab = await panel(service.session.document().id);
    expect(tab.notes()).toEqual(['No child is linked to a stored artifact or copied from one.']);
    expect(tab.buttons()).toEqual([]);
  });

  it('offers nothing in a published template, and says a new version is needed to upgrade', async () => {
    service.childSource.set(host({ newer: true, verdict: { compatible: true }, open: false, save: true }));
    importInto(fieldArtifact('v120', '1.2.0', true));
    service.loadTemplate({ ...(service.templateJson() as CedJsonObject), 'bibo:status': 'bibo:published' });
    TestBed.tick();
    const linked = service.session.document().children[0];
    const child = await panel(linked.id);
    expect(child.buttons()).toEqual([]);
    expect(child.notes()).toContain('Create a new version to upgrade.');
    const own = await panel(service.session.document().id);
    expect(own.buttons()).toEqual([]);
    expect(own.notes()).toContain('Create a new version to upgrade.');
  });
});

describe('the settings panels', () => {
  let service: TemplateService;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
  });

  const metadataLabels = (element: HTMLElement, panel: string) =>
    [...element.querySelectorAll(`[role="tabpanel"][id$="${panel}"] dt`)].map((dt) => dt.textContent!.trim());

  it('give a field a Version tab, and no version or status in its Metadata tab', () => {
    const fixture = TestBed.createComponent(FieldSettingsComponent);
    fixture.componentRef.setInput('field', service.fields()[0]);
    fixture.detectChanges();
    expect(fixture.componentInstance.tabs.at(-1)).toBe('Version');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="tab"][id$="-Version"]')?.textContent?.trim()).toBe('Version');
    expect(metadataLabels(element, '-Field-metadata')).not.toContain('Version');
    expect(metadataLabels(element, '-Field-metadata')).not.toContain('Publication status');
    expect(metadataLabels(element, '-Field-metadata')).not.toContain('Derived from');
    expect(metadataLabels(element, '-Field-metadata')).not.toContain('Previous version');
    expect(element.querySelector('[role="tabpanel"][id$="-Version"] app-version-panel')).not.toBeNull();
  });

  it('give an element a Version tab, and no version or status in its Metadata tab', () => {
    const elementId = service.addElement();
    const node = service.session.document().children.find((child) => child.id === elementId)!;
    const fixture = TestBed.createComponent(ElementCardComponent);
    fixture.componentRef.setInput('node', node);
    fixture.detectChanges();
    expect(fixture.componentInstance.tabs.at(-1)).toBe('Version');
    const element = fixture.nativeElement as HTMLElement;
    expect(metadataLabels(element, '-Element-metadata-panel')).not.toContain('Version');
    expect(metadataLabels(element, '-Element-metadata-panel')).not.toContain('Publication status');
    expect(element.querySelector('[role="tabpanel"][id$="-Version-panel"] app-version-panel')).not.toBeNull();
  });

  it('give the template a Version tab, and no version or status in its Metadata tab', () => {
    const fixture = TestBed.createComponent(ContainerSettingsComponent);
    fixture.componentRef.setInput('container', service.session.document());
    fixture.detectChanges();
    expect(fixture.componentInstance.tabs().at(-1)).toBe('Version');
    const element = fixture.nativeElement as HTMLElement;
    expect(metadataLabels(element, '-Template-Metadata-panel')).not.toContain('Version');
    expect(metadataLabels(element, '-Template-Metadata-panel')).not.toContain('Publication status');
    expect(element.querySelector('[role="tabpanel"][id$="-Version-panel"] app-version-panel')).not.toBeNull();
  });
});
