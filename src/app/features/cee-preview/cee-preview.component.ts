import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';

import { TemplateService } from '../../core/services/template.service';
import {
  CeePreviewElement,
  CeeTemplateObject,
  ceePreviewAvailable,
  createCeePreview,
} from '../../core/model/cee-preview';

/**
 * How long the template must stop changing before the preview is handed a new one.
 *
 * Rebuilding the form is cheaper than it was — the editor is kept and reassigned
 * rather than replaced — but it is still a form being built, and an author holding
 * a key down has no use for the twenty renders in between.
 */
const REBUILD_QUIET_MS = 200;

/**
 * The template as CEE renders it.
 *
 * What was here was the designer's own approximation of a form, drawn from the
 * same field list the cards are drawn from, which meant an author previewing a
 * template saw this component's idea of CEDAR rather than the renderer that will
 * show the form to whoever fills it in. The two had already drifted.
 */
@Component({
  selector: 'app-cee-preview',
  standalone: true,
  templateUrl: './cee-preview.component.html',
  styleUrls: ['./cee-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CeePreviewComponent {
  readonly service = inject(TemplateService);

  /**
   * Whether CEE can be offered.
   *
   * Read once, when the panel is built. A host loads CEE's script before or
   * alongside the designer's; one that has not is not going to have done so by
   * the time an author presses Preview.
   */
  readonly editorAvailable = ceePreviewAvailable();

  private readonly mount = viewChild<ElementRef<HTMLDivElement>>('mount');

  private editor: CeePreviewElement | null = null;

  constructor() {
    effect((onCleanup) => {
      const host = this.mount()?.nativeElement;
      const template = this.service.templateJson();
      if (host === undefined) {
        return;
      }

      const timer = setTimeout(() => this.show(host, template), REBUILD_QUIET_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /**
   * Show this template, in the editor already on screen where there is one.
   *
   * CEE fixes a template only once an instance is loaded against it, and a preview
   * supplies none, so the same element renders each new template. Replacing the
   * element instead cost about a second of bootstrapping per edit — flat in the
   * size of the template, because almost all of it was starting an application —
   * and threw away the reader's scroll position and page along with it.
   *
   * The first template is assigned after the element is in the document, which is
   * the order CEE's own hosts use.
   */
  private show(host: HTMLDivElement, template: CeeTemplateObject): void {
    if (this.editor === null) {
      this.editor = createCeePreview();
      host.replaceChildren(this.editor);
    }
    this.editor.templateObject = template;
  }
}
