import { bootstrapApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { CedarEmbeddableDesignerElementComponent } from './app/element/cedar-embeddable-designer.element';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    // Define the custom element <cedar-embeddable-designer> for external use
    if (!customElements.get('cedar-embeddable-designer')) {
      const element = createCustomElement(CedarEmbeddableDesignerElementComponent, {
        injector: appRef.injector,
      });
      customElements.define('cedar-embeddable-designer', element);
    }
  })
  .catch((err) => console.error(err));
