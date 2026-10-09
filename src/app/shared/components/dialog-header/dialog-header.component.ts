import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../icon/icon.component';

/**
 * The head of a dialog that hosts the term picker: its title, what it is about, and the way out.
 * Workspace's Permissions dialog heads itself the same way, so the picker reads as one product
 * wherever it opens.
 */
@Component({
  selector: 'app-dialog-header',
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog-heading">
      <h2>{{ heading() }}</h2>
      <button type="button" class="dialog-close" [attr.aria-label]="closeLabel() | translate" (click)="closed.emit()">
        <app-icon key="close" />
      </button>
    </div>
    @if (context()) {
      <p class="dialog-context">{{ context() }}</p>
    }
  `,
  styleUrl: './dialog-header.component.scss',
})
export class DialogHeaderComponent {
  readonly heading = input.required<string>();
  /** What the dialog is about, such as the field whose constraints it edits. */
  readonly context = input<string>();
  /** A translation key, for a dialog whose close button says more than "Close". */
  readonly closeLabel = input('common.close');
  readonly closed = output<void>();
}
