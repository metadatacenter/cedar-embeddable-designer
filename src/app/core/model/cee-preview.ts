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

/** The configuration a preview asks for. */
export interface CeePreviewConfig {
  readonly readOnlyMode: true;
  readonly showTemplateDescription: boolean;
  readonly showExpandCollapseAll: false;
}

/**
 * The element, as the designer uses it.
 *
 * `config` and `templateObject` are set-once: CEE accepts the first assignment to
 * each, and reports and ignores any later one. A preview that follows an author's
 * edits therefore replaces the element rather than reassigning its template,
 * which is what CEE's contract says a host wanting a different artifact should do.
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
 * which is the order CEE's own hosts use.
 */
export function createCeePreview(
  showTemplateDescription: boolean,
  factory: Pick<Document, 'createElement'> = document,
): CeePreviewElement {
  const editor = factory.createElement(CEE_PREVIEW_TAG) as CeePreviewElement;
  editor.config = { readOnlyMode: true, showTemplateDescription, showExpandCollapseAll: false };
  return editor;
}
