import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { fieldToJson } from '../../core/model/cedar-template';
import { CeeTemplateObject } from '../../core/model/cee-preview';
import { Field } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';

const FIELD_TAG = 'cedar-embeddable-field';
type TextValue = { kind: 'none' } | { kind: 'literal'; value: string };

/** Only the portion of the sibling element's contract used for text defaults. */
interface TextFieldElement extends HTMLElement {
  config: { readOnlyMode: false };
  fieldObject: CeeTemplateObject;
  value: TextValue;
  readonly currentValue: TextValue;
}

@Component({
  selector: 'app-text-default-value',
  templateUrl: './text-default-value.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextDefaultValueComponent {
  readonly field = input.required<Field>();
  readonly service = inject(TemplateService);
  readonly available = signal(customElements.get(FIELD_TAG) !== undefined);
  private readonly mount = viewChild<ElementRef<HTMLDivElement>>('mount');
  private editor: TextFieldElement | null = null;
  private artifactKey: string | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Sibling bundles can register asynchronously, even when their scripts load first.
    void customElements.whenDefined(FIELD_TAG).then(() => {
      if (!destroyRef.destroyed) this.available.set(true);
    });
    destroyRef.onDestroy(() => this.editor?.removeEventListener('valueChange', this.acceptValue));

    effect(() => {
      const host = this.mount()?.nativeElement;
      const field = this.field();
      if (!host) return;
      if (!this.editor) {
        this.editor = document.createElement(FIELD_TAG) as TextFieldElement;
        this.editor.config = { readOnlyMode: false };
        this.editor.addEventListener('valueChange', this.acceptValue);
        host.replaceChildren(this.editor);
      }

      // The default is the value being edited, not a reason to rebuild its control.
      // Stable artifact bytes preserve focus and the caret while the author types.
      const artifact = fieldToJson({ ...field, defaultValue: '' });
      const key = JSON.stringify(artifact);
      if (key !== this.artifactKey) {
        this.editor.fieldObject = artifact;
        this.artifactKey = key;
      }
      const value: TextValue = field.defaultValue ? { kind: 'literal', value: field.defaultValue } : { kind: 'none' };
      const current = this.editor.currentValue;
      if (
        current?.kind !== value.kind ||
        (value.kind === 'literal' && current.kind === 'literal' && current.value !== value.value)
      ) {
        this.editor.value = value;
      }
    });
  }

  private readonly acceptValue = (event: Event): void => {
    const detail = (event as CustomEvent<{ value?: TextValue; valid?: boolean }>).detail;
    if (detail?.valid !== true) return;
    const value = detail.value;
    if (value?.kind === 'none') {
      this.service.updateDefaultValue(this.field().id, '');
    } else if (value?.kind === 'literal' && typeof value.value === 'string') {
      this.service.updateDefaultValue(this.field().id, value.value);
    }
  };
}
