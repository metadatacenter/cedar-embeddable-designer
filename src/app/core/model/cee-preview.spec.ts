import { CEE_PREVIEW_TAG, CeePreviewElement, ceePreviewAvailable, createCeePreview } from './cee-preview';

/**
 * What the designer asks of CEE, checked without CEE.
 *
 * The editor is a sibling component the host loads, so the unit under test is
 * the request: the tag asked for, and the configuration it is made with. That a
 * real CEE honours it is the browser suite's question.
 */

describe('offering the preview', () => {
  it('is offered when the host has registered CEE', () => {
    expect(ceePreviewAvailable({ get: () => class extends HTMLElement {} })).toBe(true);
  });

  it('is not offered when the host has not', () => {
    // CEE is a sibling component the host loads, not a dependency this bundle
    // carries, so its absence is a normal state rather than a fault.
    expect(ceePreviewAvailable({ get: () => undefined })).toBe(false);
  });
});

describe('the editor the preview builds', () => {
  const created: string[] = [];
  const factory = {
    createElement: (tag: string) => {
      created.push(tag);
      return document.createElement('div') as unknown as HTMLElement;
    },
  } as Pick<Document, 'createElement'>;

  beforeEach(() => (created.length = 0));

  it('asks for CEE by its registered tag', () => {
    createCeePreview(false, factory);

    expect(created).toEqual([CEE_PREVIEW_TAG]);
  });

  it('is read-only, always', () => {
    // Not a setting: the designer is where a template is changed, so a preview
    // that accepted input would be collecting answers nothing keeps.
    const editor: CeePreviewElement = createCeePreview(false, factory);

    expect(editor.config.readOnlyMode).toBe(true);
  });

  it("turns off the editor's own expand and collapse controls", () => {
    // The designer has its own controls over the same template beside the
    // preview, and a second set acting on a copy of it is two answers to one
    // question.
    expect(createCeePreview(false, factory).config.showExpandCollapseAll).toBe(false);
  });

  it('shows the description only when the template has one', () => {
    expect(createCeePreview(true, factory).config.showTemplateDescription).toBe(true);
    expect(createCeePreview(false, factory).config.showTemplateDescription).toBe(false);
  });

  it('carries no template until the caller assigns one', () => {
    // CEE takes one assignment, and the element has to be in the document first.
    const editor: CeePreviewElement = createCeePreview(false, factory);

    expect(editor.templateObject).toBeUndefined();
  });
});
