import { Injectable, inject } from '@angular/core';
import { CedConfig } from '../../ced-public-api';
import { TemplateService } from './template.service';
import { TerminologyService } from './terminology.service';

/** One accepted configuration per component, shared by its lookups and embedded CEF. */
@Injectable()
export class DesignerConfigService {
  private configured = false;
  private readonly template = inject(TemplateService);
  private readonly terminology = inject(TerminologyService);
  apply(value: unknown): void {
    if (value == null || this.configured) return;
    if (typeof value !== 'object' || Array.isArray(value)) {
      console.warn('CEDAR designer config must be an object. Ignored.');
      return;
    }
    const accepted: CedConfig = {};
    for (const [key, base] of Object.entries(value)) {
      if (key !== 'terminologyBaseUrl' && key !== 'bridgeBaseUrl') {
        console.warn(`Unknown designer configuration key "${key}". Ignored.`);
      } else if (base !== undefined) {
        if (typeof base !== 'string') {
          console.warn(`Designer configuration key "${key}" must be a string. Ignored.`);
        } else if (base.trim()) {
          const normalized = base.trim();
          accepted[key] = normalized.endsWith('/') ? normalized : `${normalized}/`;
        }
      }
    }
    this.configured = true;
    this.terminology.configure(accepted);
    this.template.fieldEditorConfig.set(accepted);
  }
}
