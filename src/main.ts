import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app/app.config';
import { CedarEmbeddableDesignerElementComponent } from './app/element/cedar-embeddable-designer.element';
import { CED_CUSTOM_ELEMENT_NAME, defineCustomElementOnce } from './app/custom-element';

/**
 * Register the designer as a custom element, and do nothing else.
 *
 * `createApplication` rather than `bootstrapApplication`: nothing on the page is
 * bootstrapped by us. The host decides where and when a `<cedar-embeddable-designer>`
 * appears, and the application exists only to give the element an injector.
 *
 * This entry point used to bootstrap the standalone application and register the
 * element from the `.then` of that bootstrap, which made the element a side effect
 * of mounting an app the host never asked for. A page without `<app-root>` failed
 * the bootstrap outright, so the `.then` never ran and the element was never
 * defined — the demo page could not have worked. The standalone application now
 * has its own entry point in `main.dev.ts`.
 */
createApplication(appConfig)
  .then((application) => {
    defineCustomElementOnce(() =>
      createCustomElement(CedarEmbeddableDesignerElementComponent, { injector: application.injector }),
    );
  })
  .catch((error: unknown) => console.error(`<${CED_CUSTOM_ELEMENT_NAME}> failed to register`, error));
