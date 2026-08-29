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
import { TerminologyService } from '../core/services/terminology.service';
import { CedConfig } from '../ced-public-api';
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
  private readonly terminology = inject(TerminologyService);
  private configured = false;

  /**
   * The designer's configuration, which takes one assignment and keeps it.
   *
   * A host wanting different settings creates a new element, which is CEE's rule
   * and for its reason: a second assignment that patched some keys and replaced
   * others is a contract no host could reason about.
   *
   * This replaces a `bioportalApiKey` input. The key gated controlled-term search
   * and was then sent to an endpoint that builds an anonymous request context and
   * never read it, so the gate turned a working search off in exchange for
   * nothing. What was actually missing was the address of the terminology server,
   * which was hardcoded to production.
   */
  @Input()
  set config(value: CedConfig | null) {
    if (value === null || this.configured) {
      return;
    }
    this.configured = true;
    this.terminology.configure(value);
  }

  /**
   * A template for the designer to open, as CEDAR JSON or CEDAR YAML.
   *
   * A source the model library cannot read is reported to the host's console
   * rather than thrown: this runs inside a property setter the host wrote, and an
   * exception there would surface as a failure in the host's own code rather than
   * as something the designer said about the value it was given.
   */
  @Input()
  set template(data: unknown) {
    if (!data) {
      return;
    }
    try {
      this.service.loadTemplate(data);
    } catch (error: unknown) {
      console.error('<cedar-embeddable-designer> could not read the template it was given', error);
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
    return this.service.templateJson();
  }
}
