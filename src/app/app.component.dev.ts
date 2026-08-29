import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';

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
    <cedar-embeddable-designer (templateChange)="onTemplateChange($event)"></cedar-embeddable-designer>
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
  readonly changeCount = signal(0);

  onTemplateChange(_event: Event): void {
    this.changeCount.update((count) => count + 1);
  }
}
