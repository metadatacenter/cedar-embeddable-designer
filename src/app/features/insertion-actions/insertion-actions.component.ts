import { Component, inject, input, output } from '@angular/core';
import { TemplateService } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-insertion-actions',
  imports: [IconComponent],
  template: `
    <button type="button" (click)="addField()">
      <app-icon key="add" size="small" />Add field{{ here() ? ' here' : '' }}
    </button>
    @if (service.getActivePreset() !== 'basic') {
      @if (service.preferences().showElements) {
        <button type="button" (click)="addElement()">
          <app-icon key="add" size="small" />Add element{{ here() ? ' here' : '' }}
        </button>
      }
      <button type="button" (click)="importChild('field')">
        <app-icon key="library" size="small" />Import field{{ here() ? ' here' : '' }}
      </button>
      @if (service.preferences().showElements) {
        <button type="button" (click)="importChild('element')">
          <app-icon key="library" size="small" />Import element{{ here() ? ' here' : '' }}
        </button>
      }
    }
  `,
  styleUrl: './insertion-actions.component.scss',
})
export class InsertionActionsComponent {
  readonly service = inject(TemplateService);
  readonly targetId = input.required<number>();
  readonly position = input.required<number>();
  readonly here = input(false);
  readonly used = output<void>();
  importChild(type: 'field' | 'element'): void {
    this.used.emit();
    this.service.openChildPicker(this.targetId(), this.position(), type);
  }
  addElement(): void {
    this.used.emit();
    const id = this.service.addElement(this.targetId(), this.position());
    this.service.openContainer(id);
    this.service.selectedField.set(id);
  }
  addField(): void {
    this.used.emit();
    this.service.session.activeId.set(this.targetId());
    this.service.showPicker.set(this.position());
  }
}
