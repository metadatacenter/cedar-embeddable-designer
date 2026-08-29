/**
 * The contract an embedding page programs against.
 *
 * Everything here is deliberately self-contained: no imports, and no reference to
 * a type declared elsewhere in the designer. That is not tidiness — it is what
 * lets `tsc --emitDeclarationOnly` turn this one file into the `.d.ts` the npm
 * package ships, without dragging in paths that exist only in this repository.
 *
 * Types only, with no runtime values, and that is a constraint rather than a
 * style. The shipped bundle is a script that registers a custom element and
 * exports nothing at all, so a `const` declared here would satisfy a host's
 * compiler and then be `undefined` at runtime.
 */

/** A configuration key, as a type. */
export type CedConfigKey = keyof CedConfig;

/**
 * The configuration the designer accepts.
 *
 * Every key is optional, and an omitted key takes its default.
 */
export interface CedConfig {
  /**
   * Base for controlled-term search. Must end in a slash.
   *
   * Identifies the CEDAR terminology server, and nothing below it: the search
   * path hangs off this and is the designer's own. Unset, the controlled-term
   * panel offers no terms, and the designer says so once.
   *
   * There is no default. A hardcoded production endpoint is one an embedder
   * reaches without asking and without knowing.
   */
  terminologyBaseUrl?: string;
}

/** A JSON-serialisable value, as it appears in a CEDAR artifact. */
export type CedJsonValue = string | number | boolean | null | CedJsonObject | CedJsonValue[];

export interface CedJsonObject {
  [key: string]: CedJsonValue;
}

/**
 * What `templateChange` carries: the template as CEDAR JSON-LD.
 *
 * The same document the CEDAR artifact server accepts, written by the CEDAR
 * model library rather than by the designer.
 */
export type CedTemplate = CedJsonObject;

/**
 * The element, as a host sees it.
 *
 * `template` takes CEDAR JSON-LD or CEDAR YAML — an object, or a string in
 * either serialization. A source that cannot be read is reported to the console
 * rather than thrown, because assigning a property should not fail inside the
 * host's own code.
 */
export interface CedarEmbeddableDesignerElement extends HTMLElement {
  config: CedConfig | null;
  template: CedJsonObject | string | null;
  readonly currentTemplate: CedTemplate;
  addEventListener(
    type: 'templateChange',
    listener: (event: CustomEvent<CedTemplate>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'cedar-embeddable-designer': CedarEmbeddableDesignerElement;
  }
}
