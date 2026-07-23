import { Component, Input, Output, EventEmitter, inject, effect, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TemplateService } from '../core/services/template.service';
import { toCedarJson } from '../core/cedar-shim';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-cedar-embeddable-template-editor-element',
  standalone: true,
  imports: [CommonModule, AppComponent],
  template: `<app-root></app-root>`,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 500px;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class CedarEmbeddableTemplateEditorElementComponent {
  readonly service = inject(TemplateService);

  @Input()
  set bioportalApiKey(key: string) {
    if (key) {
      this.service.setBioPortalApiKey(key);
    }
  }

  @Input()
  set apiKey(key: string) {
    if (key) {
      this.service.setBioPortalApiKey(key);
    }
  }

  @Input()
  set template(data: any) {
    if (data) {
      this.service.loadTemplate(data);
    }
  }

  @Input()
  set templateData(data: any) {
    if (data) {
      this.service.loadTemplate(data);
    }
  }

  @Output() templateChange = new EventEmitter<any>();
  @Output() saveTemplate = new EventEmitter<any>();

  constructor() {
    // Live emit templateChange whenever template state changes
    effect(() => {
      const cedarJson = toCedarJson(
        this.service.templateName(),
        this.service.templateDesc(),
        this.service.fields(),
        this.service.templateIdentifier(),
        this.service.templateVersion()
      );
      this.templateChange.emit(cedarJson);
    });
  }
}
