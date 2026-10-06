import { Component, Input, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getIcon, iconStyle } from '@org.metadatacenter/cedar-design-tokens/icons';

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<svg
    [attr.viewBox]="style.viewBox"
    [attr.width]="box"
    [attr.height]="box"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="style.strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    [attr.data-cedar-icon]="definition.name"
    [class]="className"
    [innerHTML]="body"
  ></svg>`,
  styles: [
    ':host { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; } svg { display: block; }',
  ],
})
export class IconComponent {
  @Input() key = 'artifact-field';
  @Input() className = '';
  /** A shared icon size, or `fill` for a host element whose own stylesheet sizes it. */
  @Input() size: 'small' | 'default' | 'large' | 'fill' = 'default';
  readonly style = iconStyle;
  get box(): number | string {
    return this.size === 'fill' ? '100%' : this.style[this.size];
  }
  private readonly sanitizer = inject(DomSanitizer);
  get definition() {
    return getIcon(this.key);
  }
  get body(): SafeHtml {
    // Only geometry from the shared, build-validated registry is trusted.
    return this.sanitizer.bypassSecurityTrustHtml(this.definition.body);
  }
}
