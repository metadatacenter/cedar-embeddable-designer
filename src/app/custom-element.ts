export const CED_CUSTOM_ELEMENT_NAME = 'cedar-embeddable-designer';

type CustomElementRegistryLike = Pick<CustomElementRegistry, 'define' | 'get'>;

/**
 * Register the designer without replacing a definition an earlier bundle supplied.
 *
 * `customElements.define` throws on a tag that is already defined, so a page that
 * loads two copies of this bundle would fail on the second rather than keep the
 * one it has.
 */
export function defineCustomElementOnce(
  createElement: () => CustomElementConstructor,
  registry: CustomElementRegistryLike = customElements,
): void {
  if (registry.get(CED_CUSTOM_ELEMENT_NAME)) {
    return;
  }

  registry.define(CED_CUSTOM_ELEMENT_NAME, createElement());
}
