import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';

import { TemplateService } from '../../core/services/template.service';
import {
  CeePreviewElement,
  CeeTemplateObject,
  ceePreviewAvailable,
  createCeePreview,
} from '../../core/model/cee-preview';

/**
 * How long the template must stop changing before the preview is rebuilt.
 *
 * CEE's template input is set-once, so following an author's edits means
 * replacing the element, and replacing it boots a form renderer. Once per
 * keystroke would be one boot per character; this rebuilds when typing stops.
 */
const REBUILD_QUIET_MS = 400;

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

  constructor() {
    effect((onCleanup) => {
      const host = this.mount()?.nativeElement;
      const template = this.service.templateJson();
      if (host === undefined) {
        return;
      }

      const timer = setTimeout(() => this.remount(host, template), REBUILD_QUIET_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /**
   * Replace the editor with one rendering this template.
   *
   * The old element is discarded rather than reassigned, because CEE reports and
   * ignores a second `templateObject`. The template is assigned after the element
   * is in the document, which is the order CEE's own hosts use.
   */
  private remount(host: HTMLDivElement, template: CeeTemplateObject): void {
    const editor: CeePreviewElement = createCeePreview(this.service.templateDesc().length > 0);
    host.replaceChildren(editor);
    editor.templateObject = template;
  }
}
