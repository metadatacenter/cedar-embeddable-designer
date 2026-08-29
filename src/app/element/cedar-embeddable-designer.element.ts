import {
  Component,
  EnvironmentInjector,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  effect,
  inject,
} from '@angular/core';
import { TemplateService } from '../core/services/template.service';
import { toCedarJson } from '../core/cedar-shim';
import { AppComponent } from '../app.component';

/**
 * The element an embedding page programs against.
 *
 * Rendered in shadow DOM, which is what makes it embeddable rather than merely
 * loadable: the designer's styles cannot reach the host page, and the host page's
 * cannot reach in. That is also why the global stylesheet is listed here rather
 * than in `angular.json` — a stylesheet in the document head does not cross into a
 * shadow root, so the element has to carry its own.
 *
 * Shadow DOM is not free, and the places it costs are the places that used to
 * reach for `document`: looking a field card up by id, and reading `event.target`
 * on a document-level listener. Both are handled where they occur.
 */
@Component({
  selector: 'app-cedar-embeddable-designer-element',
  imports: [AppComponent],
  template: `<app-root></app-root>`,
  styleUrls: ['../../styles.css', './cedar-embeddable-designer.element.scss'],
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class CedarEmbeddableDesignerElementComponent {
  readonly service = inject(TemplateService);

  @Input()
  set bioportalApiKey(key: string) {
    if (key) {
      this.service.setBioPortalApiKey(key);
    }
  }

  @Input()
  set template(data: unknown) {
    if (data) {
      this.service.loadTemplate(data);
    }
  }

  /** The template as it now stands, for a host that would rather read than listen. */
  @Input() get currentTemplate(): object {
    return this.cedarTemplate();
  }

  @Output() templateChange = new EventEmitter<object>();

  constructor() {
    /*
     * A root effect, not a view effect.
     *
     * An `effect()` created in a component's injection context runs when that
     * component's view is refreshed. This component's own template is one static
     * tag, so under Angular 22's default OnPush its view is never dirty and the
     * effect ran exactly once — the host saw the initial template and then nothing,
     * however much the author edited. Naming the environment injector makes it a
     * root effect, scheduled on state changes rather than on this view's refresh,
     * so what the host receives no longer depends on the wrapper's change detection.
     */
    effect(() => this.templateChange.emit(this.cedarTemplate()), {
      injector: inject(EnvironmentInjector),
    });
  }

  private cedarTemplate(): object {
    return toCedarJson(
      this.service.templateName(),
      this.service.templateDesc(),
      this.service.fields(),
      this.service.templateIdentifier(),
      this.service.templateVersion(),
    );
  }
}
