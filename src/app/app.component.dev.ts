import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { CedConfig } from './ced-public-api';

/**
 * The standalone application, which is a host page like any other.
 *
 * It embeds `<cedar-embeddable-designer>` rather than rendering the editor
 * directly, so running `ng serve` exercises the element contract instead of a
 * private path into the same components. A regression in the element shows up
 * here, during development, rather than in someone else's page.
 */
@Component({
  selector: 'app-dev-host',
  template: `
    <cedar-embeddable-designer
      [config]="config"
      (templateChange)="onTemplateChange($event)"
    ></cedar-embeddable-designer>
    <p class="dev-host__status">Last templateChange: {{ changeCount() }} event(s)</p>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      cedar-embeddable-designer {
        flex: 1 1 auto;
        min-height: 0;
      }
      .dev-host__status {
        margin: 0;
        padding: 4px 12px;
        font:
          12px/1.6 ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace;
        color: #94a3b8;
        background: #0f172a;
      }
    `,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevHostComponent {
  /**
   * The configuration a host supplies, naming a local terminology server.
   *
   * Named here rather than defaulted inside the designer: an embedder should
   * reach a CEDAR service because it asked to, not because a component it loaded
   * had an address compiled into it.
   *
   * Local rather than production because the picker reads the version-aware
   * `/search`, which production answers with a 404. Bringing a local store up is
   * in the versioning runbook; without one, search reports the failure rather
   * than inventing a result.
   */
  readonly config: CedConfig = { terminologyBaseUrl: 'http://localhost:9004/' };

  readonly changeCount = signal(0);

  onTemplateChange(_event: Event): void {
    this.changeCount.update((count) => count + 1);
  }
}
