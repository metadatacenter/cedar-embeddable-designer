import { bootstrapApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { CedarEmbeddableTemplateEditorElementComponent } from './app/element/cedar-embeddable-template-editor.element';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    // Define the custom element <cedar-embeddable-template-editor> for external use
    if (!customElements.get('cedar-embeddable-template-editor')) {
      const element = createCustomElement(CedarEmbeddableTemplateEditorElementComponent, {
        injector: appRef.injector,
      });
      customElements.define('cedar-embeddable-template-editor', element);
    }
  })
  .catch((err) => console.error(err));
