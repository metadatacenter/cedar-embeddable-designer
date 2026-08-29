import { Component, inject, signal, effect, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../../core/services/template.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-api-key-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './api-key.component.html',
})
export class ApiKeyModalComponent {
  readonly service = inject(TemplateService);

  localKey = '';
  readonly showKey = signal(false);
  readonly isSaved = signal(false);

  constructor() {
    // Sync local key when modal opens
    effect(() => {
      if (this.service.showApiKeyModal()) {
        this.localKey = this.service.bioportalApiKey();
        this.showKey.set(false);
        this.isSaved.set(false);
      }
    });
  }

  handleSave() {
    this.service.bioportalApiKey.set(this.localKey);
    this.isSaved.set(true);
    setTimeout(() => {
      this.isSaved.set(false);
      this.service.showApiKeyModal.set(false);
    }, 1000);
  }

  handleCancel() {
    this.service.showApiKeyModal.set(false);
  }
}
