import { bootstrapApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app/app.config';
import { DevHostComponent } from './app/app.component.dev';
import { CedarEmbeddableDesignerElementComponent } from './app/element/cedar-embeddable-designer.element';
import { defineCustomElementOnce } from './app/custom-element';

/**
 * The standalone application, for `ng serve`.
 *
 * Registers the element as well as bootstrapping the host, because the host page
 * embeds the element: what a browser needs here is exactly what an embedder needs,
 * plus a page to put it on.
 */
bootstrapApplication(DevHostComponent, appConfig)
  .then((application) => {
    defineCustomElementOnce(() =>
      createCustomElement(CedarEmbeddableDesignerElementComponent, { injector: application.injector }),
    );
  })
  .catch((error: unknown) => console.error(error));
