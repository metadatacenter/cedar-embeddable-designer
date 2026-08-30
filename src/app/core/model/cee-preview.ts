/**
 * What the designer needs from `<cedar-embeddable-editor>` to preview a template.
 *
 * CEE is a sibling web component, not a dependency: a host page loads both
 * scripts and neither bundles the other. That is the same arrangement the term
 * picker is in, and for the same reason — CEE is a form renderer weighing rather
 * more than this designer, and an author previewing a template wants the renderer
 * production uses rather than a second implementation of one.
 *
 * The shape below is declared here rather than imported, because CEE's package is
 * not installed and the designer assigns two properties of a much larger element.
 */

/** The tag the host is expected to have registered. */
export const CEE_PREVIEW_TAG = 'cedar-embeddable-editor';

/**
 * A CEDAR artifact as CEE takes it.
 *
 * The index signature is the model library's `JsonNode`, so what the designer
 * already builds can be handed over without a cast.
 */
export interface CeeTemplateObject {
  readonly [key: string]: string | number | boolean | object | null | undefined;
}

/**
 * The configuration a preview asks for.
 *
 * Constant, and no part of it derived from the template: CEE applies a
 * configuration once, so a preview whose configuration changed with its content
 * would be back to replacing the element. `showTemplateDescription` is always on
 * because CEE renders a description only where the template carries one, so
 * asking for it costs nothing on a template with none.
 */
export interface CeePreviewConfig {
  readonly readOnlyMode: true;
  readonly showTemplateDescription: true;
  readonly showExpandCollapseAll: false;
}

export const CEE_PREVIEW_CONFIG: CeePreviewConfig = {
  readOnlyMode: true,
  showTemplateDescription: true,
  showExpandCollapseAll: false,
};

/**
 * The element, as the designer uses it.
 *
 * `config` is set-once: CEE accepts the first assignment and reports and ignores
 * any later one. `templateObject` is not, while no instance has been supplied —
 * each assignment builds the form afresh, which is what lets a preview follow an
 * author's edits without discarding the editor.
 *
 * It was set-once for every host until this preview asked otherwise. Replacing the
 * element per edit cost about a second of Angular bootstrapping whatever the size
 * of the template, and took the reader's scroll position and page with it.
 */
export interface CeePreviewElement extends HTMLElement {
  config: CeePreviewConfig;
  templateObject: CeeTemplateObject;
}

/** Whether a host has loaded CEE, which decides whether a preview can be offered. */
export function ceePreviewAvailable(registry: Pick<CustomElementRegistry, 'get'> = customElements): boolean {
  return registry.get(CEE_PREVIEW_TAG) !== undefined;
}

/**
 * A configured editor, with no template in it yet.
 *
 * One of these lasts as long as the panel: the caller keeps it and assigns each
 * new template to it.
 *
 * Read-only always, and not a setting: the designer is where a template is
 * changed, so a preview that accepted input would be collecting answers nothing
 * keeps. With no instance behind it CEE reads a read-only form as a statement of
 * what each field will accept, which is what an author is asking to see.
 *
 * Expand All and Collapse All are off for the same reason. The designer has its
 * own controls over the same template beside the preview, and a second set acting
 * on a copy of it is two answers to one question. Each section still opens and
 * closes on its own header.
 *
 * The template is assigned by the caller once the element is in the document,
 * which is the order CEE's own hosts use, and again whenever it changes.
 */
export function createCeePreview(factory: Pick<Document, 'createElement'> = document): CeePreviewElement {
  const editor = factory.createElement(CEE_PREVIEW_TAG) as CeePreviewElement;
  editor.config = CEE_PREVIEW_CONFIG;
  return editor;
}
